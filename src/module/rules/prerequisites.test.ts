import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTERISTICS } from '../data/shared/characteristics.ts';
import {
    type PrerequisiteActorView,
    prerequisiteLabels,
    type StructuredPrerequisites,
    toStructuredPrerequisites,
    unmetPrerequisites as unmetWith,
} from './prerequisites.ts';

/** The langpack: nested groups whose leaves are strings. */
interface LangTree {
    [key: string]: string | LangTree;
}

const LANG = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangTree;

/** `game.i18n.format` in English: a langpack key's text with its `{name}` substitutions. */
function format(key: string, data: Record<string, string | number> = {}): string {
    let node: string | LangTree = LANG;
    for (const part of key.split('.')) {
        if (typeof node === 'string') return key;
        const next: string | LangTree | undefined = Object.entries(node).find(([name]) => name === part)?.[1];
        if (next === undefined) return key;
        node = next;
    }
    return typeof node === 'string' ? node.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(data[name] ?? '')) : key;
}

/** The English langpack wording, as the advancement dialog words it. */
const LABELS = prerequisiteLabels(format, (key) => CHARACTERISTICS.find((c) => c.key === key)?.label ?? key);
const unmetPrerequisites = (prereqs: StructuredPrerequisites, actor: PrerequisiteActorView): string[] => unmetWith(prereqs, actor, LABELS);

const NONE: StructuredPrerequisites = { text: '', characteristics: {}, skills: [], talents: [], talentsAny: [], alignment: '', thresholds: {} };

describe('toStructuredPrerequisites (#673, #675)', () => {
    it('keeps a legacy flat string as the printed text', () => {
        expect(toStructuredPrerequisites('Willpower 40')).toEqual({ ...NONE, text: 'Willpower 40' });
    });

    it('reads an absent or malformed value as no prerequisites', () => {
        expect(toStructuredPrerequisites(undefined)).toEqual(NONE);
        expect(toStructuredPrerequisites(null)).toEqual(NONE);
        expect(toStructuredPrerequisites(['Willpower 40'])).toEqual(NONE);
    });

    it('keeps the structured shape, coercing record-shaped lists and dropping non-numeric minimums', () => {
        const raw = {
            text: 'Willpower 40, Psyniscience',
            characteristics: { willpower: 40, agility: 'x' },
            skills: { 0: 'Psyniscience' },
            talents: ['Hatred'],
        };
        expect(toStructuredPrerequisites(raw)).toEqual({
            ...NONE,
            text: 'Willpower 40, Psyniscience',
            characteristics: { willpower: 40 },
            skills: ['Psyniscience'],
            talents: ['Hatred'],
        });
    });

    it('keeps a known alignment and thresholds on known stats, and drops the rest', () => {
        const raw = { alignment: 'nurgle', thresholds: { corruption: 30, infamy: 40, wealth: 9 }, talentsAny: ['Hatred'] };
        expect(toStructuredPrerequisites(raw)).toEqual({ ...NONE, alignment: 'nurgle', thresholds: { corruption: 30, infamy: 40 }, talentsAny: ['Hatred'] });
        expect(toStructuredPrerequisites({ alignment: 'chaos-undivided' }).alignment).toBe('');
    });
});

describe('unmetPrerequisites (#673, #675)', () => {
    const actor = (overrides: Partial<PrerequisiteActorView> = {}): PrerequisiteActorView => ({
        characteristics: { willpower: 40, agility: 25 },
        skillRanks: { 'Psyniscience': 2, 'Forbidden Lore (Warp)': 3 },
        talents: ['Psychic Discipline', 'Hatred (Orks)'],
        alignment: 'nurgle',
        thresholds: { corruption: 30, infamy: 20, insanity: 0, rank: 3 },
        ...overrides,
    });

    it('passes when every gate is met', () => {
        const prereqs: StructuredPrerequisites = {
            ...NONE,
            characteristics: { willpower: 40 },
            skills: ['Psyniscience +10', 'Forbidden Lore (The Warp) +20'],
            talents: ['psychic discipline'],
            talentsAny: ['Hatred'],
            alignment: 'nurgle',
            thresholds: { corruption: 30, rank: 3 },
        };
        expect(unmetPrerequisites(prereqs, actor())).toEqual([]);
    });

    it('names an unmet characteristic minimum, as DH2 Smite needs Willpower 40', () => {
        const prereqs = { ...NONE, characteristics: { willpower: 40 } };
        expect(unmetPrerequisites(prereqs, actor({ characteristics: { willpower: 25 } }))).toEqual(['Willpower 40+']);
    });

    it('reads a skill suffix as the training level: none Known, +10 Trained, +20 Experienced', () => {
        const ranked = actor({ skillRanks: { psyniscience: 2 } });
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience'] }, ranked)).toEqual([]);
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience +10'] }, ranked)).toEqual([]);
        expect(unmetPrerequisites({ ...NONE, skills: ['Psyniscience +20'] }, ranked)).toEqual(['Psyniscience +20']);
        expect(unmetPrerequisites({ ...NONE, skills: ['Awareness'] }, ranked)).toEqual(['Awareness']);
    });

    it('reads a specialist skill by its specialisation, "The" or not', () => {
        expect(unmetPrerequisites({ ...NONE, skills: ['Forbidden Lore (Warp) +30'] }, actor())).toEqual(['Forbidden Lore (Warp) +30']);
        expect(unmetPrerequisites({ ...NONE, skills: ['Scholastic Lore (Occult)'] }, actor())).toEqual(['Scholastic Lore (Occult)']);
    });

    it('names a talent the actor does not own', () => {
        expect(unmetPrerequisites({ ...NONE, talents: ['Warp Conduit'] }, actor())).toEqual(['Warp Conduit']);
    });

    it('takes any specialisation of an "any" talent, and names a missing one', () => {
        expect(unmetPrerequisites({ ...NONE, talentsAny: ['Hatred'] }, actor())).toEqual([]);
        expect(unmetPrerequisites({ ...NONE, talentsAny: ['Resistance'] }, actor())).toEqual(['Resistance (any)']);
    });

    it('requires the printed Chaos alignment, as BC "Aligned Nurgle" powers do', () => {
        expect(unmetPrerequisites({ ...NONE, alignment: 'tzeentch' }, actor())).toEqual(['Aligned to Tzeentch']);
        expect(unmetPrerequisites({ ...NONE, alignment: 'nurgle' }, actor({ alignment: 'unaligned' }))).toEqual(['Aligned to Nurgle']);
    });

    it('names each unmet Corruption, Infamy, Insanity or rank threshold', () => {
        const prereqs = { ...NONE, thresholds: { corruption: 40, infamy: 40, insanity: 5, rank: 5 } };
        expect(unmetPrerequisites(prereqs, actor())).toEqual(['Corruption 40+', 'Infamy 40+', 'Insanity 5+', 'Rank 5+']);
    });

    it('words every chip from the langpack, never a raw key (#699 audit)', () => {
        const prereqs = { ...NONE, characteristics: { weaponSkill: 45 }, alignment: 'slaanesh' as const, thresholds: { infamy: 70 } };
        const unmet = unmetPrerequisites(prereqs, actor());
        expect(unmet).toEqual(['Weapon Skill 45+', 'Aligned to Slaanesh', 'Infamy 70+']);
        for (const chip of unmet) expect(chip).not.toMatch(/weaponSkill|aligned |slaanesh|infamy/);
    });

    it('lets text alone gate nothing', () => {
        expect(unmetPrerequisites({ ...NONE, text: 'Devoted to Slaanesh' }, actor())).toEqual([]);
    });
});
