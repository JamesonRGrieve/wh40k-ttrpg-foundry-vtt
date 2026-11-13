/**
 * Tests for the skill pack index (#440, #498, #707).
 *
 * Two bugs these guard:
 *
 * - #440: a character's skills live in `system.skills` (a SchemaField built from
 *   SKILL_DEFINITIONS), not as embedded Items, so the roll dialog's owned-Item
 *   lookup found nothing and the sense-channel selector never rendered even with
 *   `awarenessSenseSplit` on and the Awareness variants correctly authored in the
 *   pack. Variants now come from the compendium, keyed by the actor's skill key.
 * - #498: a typed specialisation that missed the book's spelling created a paid
 *   track the roll engine could not match. The picker offers the pack's list.
 *
 * And one cost (#707): both lists were built by separate modules that each read
 * every skills pack at `ready`. One build now reads each pack once.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import { SKILL_INDEX_FIELDS } from '../utils/pack-index.ts';
import {
    buildSkillPackIndex,
    getSkillVariantsForKey,
    getSpecializationsForSkill,
    normalizeSkillKey,
    setSkillVariantsForTesting,
    setSpecializationsForTesting,
} from './skill-pack-index.ts';
import type { SkillVariant } from './skill-variants.ts';

const AWARENESS: SkillVariant[] = [
    { name: 'Visual', description: 'sight', blockedBy: 'blinded' },
    { name: 'Auditory', description: 'hearing', blockedBy: 'deafened' },
    { name: 'Olfactory', description: 'smell', blockedBy: '' },
];

describe('normalizeSkillKey', () => {
    it('collapses every spelling of a skill to one comparison key', () => {
        // The actor key is camelCase, the pack doc's name is spaced Title Case, and
        // Foundry derives a kebab identifier in Item#_preCreate. All must collide.
        expect(normalizeSkillKey('sleightOfHand')).toBe('sleightofhand');
        expect(normalizeSkillKey('Sleight of Hand')).toBe('sleightofhand');
        expect(normalizeSkillKey('sleight-of-hand')).toBe('sleightofhand');
        expect(normalizeSkillKey('Awareness')).toBe('awareness');
    });

    it('collapses every spelling of one specialist skill onto the same key', () => {
        const forms = ['commonLore', 'Common Lore', 'common-lore', 'COMMON LORE'];
        const keys = new Set(forms.map(normalizeSkillKey));
        expect(keys.size).toBe(1);
        expect([...keys][0]).toBe('commonlore');
    });

    it('keeps genuinely different skills apart', () => {
        expect(normalizeSkillKey('Common Lore')).not.toBe(normalizeSkillKey('Forbidden Lore'));
    });

    it('returns an empty key for input with no alphanumerics', () => {
        expect(normalizeSkillKey('  -- ')).toBe('');
    });
});

describe('getSkillVariantsForKey', () => {
    beforeEach(() => {
        setSkillVariantsForTesting({ Awareness: AWARENESS });
    });

    it('resolves the actor camelCase skill key against the pack document name', () => {
        // This is the exact lookup the dialog performs: rollKey 'awareness' must
        // find the variants authored on the pack doc named 'Awareness'.
        expect(getSkillVariantsForKey('awareness')).toEqual(AWARENESS);
    });

    it('resolves regardless of separator or case', () => {
        setSkillVariantsForTesting({ 'Sleight of Hand': AWARENESS });
        expect(getSkillVariantsForKey('sleightOfHand')).toEqual(AWARENESS);
        expect(getSkillVariantsForKey('sleight-of-hand')).toEqual(AWARENESS);
    });

    it('returns [] for a skill that declares no variants', () => {
        expect(getSkillVariantsForKey('carouse')).toEqual([]);
    });

    it('returns [] for an empty or punctuation-only key rather than matching everything', () => {
        expect(getSkillVariantsForKey('')).toEqual([]);
        expect(getSkillVariantsForKey('---')).toEqual([]);
    });

    it('prefers the system-scoped entry and falls back cross-system', () => {
        const dh2Only: SkillVariant[] = [{ name: 'Visual', description: 'dh2', blockedBy: 'blinded' }];
        setSkillVariantsForTesting({ Awareness: dh2Only }, 'dh2');
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(dh2Only);
        // rt authors none; the flat fallback still resolves so the selector works
        // on lines that share the FFG skill list.
        expect(getSkillVariantsForKey('awareness', 'rt')).toEqual(dh2Only);
    });

    it('returns [] once the seeded list is replaced by an empty one', () => {
        setSkillVariantsForTesting({}, 'dh2');
        expect(getSkillVariantsForKey('awareness')).toEqual([]);
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual([]);
    });
});

describe('getSpecializationsForSkill', () => {
    beforeEach(() => {
        setSpecializationsForTesting({ 'Common Lore': ['Imperium', 'Adeptus Arbites'], 'Trade': ['Armourer'] }, 'dh2');
    });

    it('finds a skill by the actor’s camelCase key, not just the pack display name', () => {
        // The actor's skills live in a SchemaField keyed `commonLore`; the pack
        // document is named `Common Lore`. The lookup has to bridge that.
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('preserves book order rather than sorting', () => {
        // The rulebook's order is the order a GM reads down the page; re-sorting
        // it alphabetically would make the picker harder to check against the book.
        expect(getSpecializationsForSkill('Common Lore', 'dh2')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('returns an empty list for a skill with no authored specialisations', () => {
        // Empty means "no canonical list", which the picker reads as "offer the
        // free-text field" — not as "offer an empty select".
        expect(getSpecializationsForSkill('awareness', 'dh2')).toEqual([]);
    });

    it('returns an empty list for an unknown or blank key rather than throwing', () => {
        expect(getSpecializationsForSkill('')).toEqual([]);
        expect(getSpecializationsForSkill('notASkill')).toEqual([]);
    });

    it('falls back across lines when the requested line authors none', () => {
        // A line whose skills pack is not yet authored still gets the canonical
        // list rather than nothing.
        expect(getSpecializationsForSkill('commonLore', 'ow')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('returns an empty list when the index was never built', () => {
        setSpecializationsForTesting({});
        expect(getSpecializationsForSkill('commonLore')).toEqual([]);
    });
});

describe('the two lists are separate', () => {
    it('seeding one list leaves the other as it was', () => {
        setSkillVariantsForTesting({ Awareness: AWARENESS }, 'dh2');
        setSpecializationsForTesting({ 'Common Lore': ['Imperium'] }, 'dh2');

        setSkillVariantsForTesting({});
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(['Imperium']);

        setSkillVariantsForTesting({ Awareness: AWARENESS }, 'dh2');
        setSpecializationsForTesting({});
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(AWARENESS);
    });

    it('a skill indexed for one list is not found in the other', () => {
        setSkillVariantsForTesting({ Awareness: AWARENESS }, 'dh2');
        setSpecializationsForTesting({ 'Common Lore': ['Imperium'] }, 'dh2');

        expect(getSpecializationsForSkill('awareness', 'dh2')).toEqual([]);
        expect(getSkillVariantsForKey('commonLore', 'dh2')).toEqual([]);
    });
});

/** A skill pack index row as the build reads it. */
interface SkillDocStub {
    name?: string;
    system?: { identifier?: string; variants?: SkillVariant[]; specializations?: string[] };
}

/** An installed pack whose `getIndex` counts its reads and records the fields asked for. */
interface PackStub {
    metadata: ReturnType<typeof packMetadata>;
    getIndex: ReturnType<typeof vi.fn<(options: { fields: string[] }) => Promise<SkillDocStub[]>>>;
}

/** An installed pack of `line` and `category` whose index holds `docs`. */
function pack(name: string, line: string, docs: SkillDocStub[], category = 'skills', homebrew = false): PackStub {
    return {
        metadata: packMetadata(name, line, category, homebrew),
        getIndex: vi.fn<(options: { fields: string[] }) => Promise<SkillDocStub[]>>(async () => Promise.resolve(docs)),
    };
}

/** Install `packs` as the world's compendiums and build the index from them. */
async function buildFrom(packs: PackStub[]): Promise<void> {
    vi.stubGlobal('game', { packs });
    await buildSkillPackIndex();
}

describe('buildSkillPackIndex (#707)', () => {
    const DH2_LORE = ['Imperium', 'Adeptus Arbites'];
    const RT_LORE = ['Koronus Expanse'];
    const RT_AWARENESS: SkillVariant[] = [{ name: 'Auspex', description: 'rt', blockedBy: null }];

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads each skills pack once and fills both lists from that one read', async () => {
        const dh2 = pack('dh2-skills', 'dh2', [
            { name: 'Awareness', system: { variants: AWARENESS } },
            { name: 'Common Lore', system: { specializations: DH2_LORE } },
        ]);
        const rt = pack('rt-skills', 'rt', [{ name: 'Common Lore', system: { specializations: RT_LORE } }]);

        await buildFrom([dh2, rt]);

        expect(dh2.getIndex).toHaveBeenCalledTimes(1);
        expect(rt.getIndex).toHaveBeenCalledTimes(1);
        // An index read with the skill fields, never whole documents (#706).
        expect(dh2.getIndex).toHaveBeenCalledWith({ fields: ['name', 'type', ...SKILL_INDEX_FIELDS] });
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(AWARENESS);
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(DH2_LORE);
        expect(getSpecializationsForSkill('commonLore', 'rt')).toEqual(RT_LORE);
    });

    it('fills both lists from one document that declares both', async () => {
        await buildFrom([pack('dh2-skills', 'dh2', [{ name: 'Awareness', system: { variants: AWARENESS, specializations: ['Sight'] } }])]);

        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(AWARENESS);
        expect(getSpecializationsForSkill('awareness', 'dh2')).toEqual(['Sight']);
    });

    it('reads no pack of another category', async () => {
        const talents = pack('dh2-talents', 'dh2', [{ name: 'Awareness', system: { variants: AWARENESS } }], 'talents');

        await buildFrom([talents]);

        expect(talents.getIndex).not.toHaveBeenCalled();
        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual([]);
    });

    it('reads no homebrew skills pack', async () => {
        const brew = pack('brew-skills', 'dh2', [{ name: 'Common Lore', system: { specializations: ['Homebrew'] } }], 'skills', true);

        await buildFrom([brew]);

        expect(brew.getIndex).not.toHaveBeenCalled();
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual([]);
    });

    it("scopes each list to its pack's line, and gives the first line's list to a line that authors none", async () => {
        await buildFrom([
            pack('dh2-skills', 'dh2', [
                { name: 'Awareness', system: { variants: AWARENESS } },
                { name: 'Common Lore', system: { specializations: DH2_LORE } },
            ]),
            pack('rt-skills', 'rt', [
                { name: 'Awareness', system: { variants: RT_AWARENESS } },
                { name: 'Common Lore', system: { specializations: RT_LORE } },
            ]),
        ]);

        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual(AWARENESS);
        expect(getSkillVariantsForKey('awareness', 'rt')).toEqual(RT_AWARENESS);
        expect(getSpecializationsForSkill('commonLore', 'rt')).toEqual(RT_LORE);
        // ow authors neither: the first pack to declare the skill answers.
        expect(getSkillVariantsForKey('awareness', 'ow')).toEqual(AWARENESS);
        expect(getSpecializationsForSkill('commonLore', 'ow')).toEqual(DH2_LORE);
        // No line given reads the same cross-line entry.
        expect(getSkillVariantsForKey('awareness')).toEqual(AWARENESS);
        expect(getSpecializationsForSkill('commonLore')).toEqual(DH2_LORE);
    });

    it('indexes a document under an authored identifier that differs from its name', async () => {
        await buildFrom([pack('dh2-skills', 'dh2', [{ name: 'Lore: Common', system: { identifier: 'common-lore', specializations: DH2_LORE } }])]);

        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(DH2_LORE);
        expect(getSpecializationsForSkill('Lore: Common', 'dh2')).toEqual(DH2_LORE);
    });

    it('indexes nothing for an empty list, a missing list or a nameless document', async () => {
        await buildFrom([
            pack('dh2-skills', 'dh2', [
                { name: 'Carouse', system: { variants: [], specializations: [] } },
                { name: 'Dodge', system: {} },
                { name: 'Parry' },
                { name: '   ', system: { specializations: ['Orphan'] } },
            ]),
        ]);

        expect(getSkillVariantsForKey('carouse', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('carouse', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('dodge', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('parry', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('', 'dh2')).toEqual([]);
    });

    it('replaces the last build: a skill no pack declares any more is gone from both lists', async () => {
        await buildFrom([
            pack('dh2-skills', 'dh2', [
                { name: 'Awareness', system: { variants: AWARENESS } },
                { name: 'Common Lore', system: { specializations: DH2_LORE } },
            ]),
        ]);
        await buildFrom([pack('dh2-skills', 'dh2', [{ name: 'Trade', system: { specializations: ['Armourer'] } }])]);

        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual([]);
        expect(getSkillVariantsForKey('awareness')).toEqual([]);
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('trade', 'dh2')).toEqual(['Armourer']);
    });

    it('replaces lists seeded for a test', async () => {
        setSkillVariantsForTesting({ Awareness: AWARENESS }, 'dh2');
        setSpecializationsForTesting({ 'Common Lore': DH2_LORE }, 'dh2');

        await buildFrom([]);

        expect(getSkillVariantsForKey('awareness', 'dh2')).toEqual([]);
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual([]);
    });

    it('builds empty lists when no compendiums are installed', async () => {
        vi.stubGlobal('game', {});

        await buildSkillPackIndex();

        expect(getSkillVariantsForKey('awareness')).toEqual([]);
        expect(getSpecializationsForSkill('commonLore')).toEqual([]);
    });
});
