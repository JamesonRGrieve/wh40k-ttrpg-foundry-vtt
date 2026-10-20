import { describe, expect, it } from 'vitest';
import { type PrerequisiteActorView, type StructuredPrerequisites, toStructuredPrerequisites, unmetPrerequisites } from './prerequisites-field.ts';

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
        expect(unmetPrerequisites(prereqs, actor({ characteristics: { willpower: 25 } }))).toEqual(['willpower 40+']);
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
        expect(unmetPrerequisites({ ...NONE, alignment: 'tzeentch' }, actor())).toEqual(['aligned tzeentch']);
        expect(unmetPrerequisites({ ...NONE, alignment: 'nurgle' }, actor({ alignment: 'unaligned' }))).toEqual(['aligned nurgle']);
    });

    it('names each unmet Corruption, Infamy, Insanity or rank threshold', () => {
        const prereqs = { ...NONE, thresholds: { corruption: 40, infamy: 40, insanity: 5, rank: 5 } };
        expect(unmetPrerequisites(prereqs, actor())).toEqual(['corruption 40+', 'infamy 40+', 'insanity 5+', 'rank 5+']);
    });

    it('lets text alone gate nothing', () => {
        expect(unmetPrerequisites({ ...NONE, text: 'Devoted to Slaanesh' }, actor())).toEqual([]);
    });
});
