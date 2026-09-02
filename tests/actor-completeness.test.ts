/**
 * Regression guard: every NPC-family actor (bestiary / npcs / reinforcements /
 * mounts) must be PLAYABLE — real stats, a weapon that renders, migrated skills,
 * inventory whose refs resolve. These are the "correctness, not shape" gaps
 * validate-schema.cjs does not cover; they are exactly what left the Ambull and
 * the Combat Servitor with a weapon that never appeared and a blank skill list.
 *
 * See src/packs/validate-actors.cjs and the audit-wh40k-actors skill.
 */

import { describe, expect, it } from 'vitest';
import { type ActorWarning, type IdIndex, isNpcFamily, splitProseAbilities, validateActor } from '../src/packs/validate-actors.cjs';

/**
 * Open authored-JSON shape of a pack `_source` document. A closed interface
 * would make the partial/complete fixtures untestable (same rationale as
 * pack-vehicle-schema.test.ts).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: pack _source docs are open authored JSON whose completeness is the thing under test
type Json = Record<string, unknown>;

function rulesFor(doc: Json, index: IdIndex = {}): string[] {
    const warnings: ActorWarning[] = [];
    validateActor(doc, 'test.json', index, warnings);
    return warnings.map((w) => w.rule);
}

const DEFAULT_ITEMS: Json[] = [
    { _id: 'w0000000000000001', name: 'Claws', type: 'weapon' },
    { _id: 't0000000000000001', name: 'Bestial', type: 'trait' },
    { _id: 't0000000000000002', name: 'Sturdy', type: 'trait' },
];

/** A minimally COMPLETE NPC; `system` is merged over the complete baseline. */
function npc(system: Json = {}, items: Json[] = DEFAULT_ITEMS): Json {
    return {
        name: 'Test Beast',
        _id: 'TestBeastId00001',
        type: 'dh1-npc',
        img: 'https://example/portrait.webp',
        system: {
            characteristics: { ws: 40, bs: 0, s: 45, t: 45, ag: 35, int: 16, per: 30, wp: 30, fel: 0 },
            wounds: { max: 12, value: 12, critical: 0 },
            weapons: { mode: 'embedded', simple: [] },
            skills: 'Awareness (Per)',
            trainedSkills: { awareness: { name: 'Awareness', characteristic: 'perception', advance: 1 } },
            talents_traits: 'Bestial, Sturdy',
            ...system,
        },
        items,
    };
}

describe('a complete NPC trips no hard rule', () => {
    it('passes the fully-authored fixture', () => {
        const rules = rulesFor(npc());
        for (const hard of ['weapons-inline-not-embedded', 'skills-prose-not-migrated', 'stats-all-default', 'stats-no-wounds', 'inventory-dangling-ref']) {
            expect(rules).not.toContain(hard);
        }
    });
});

describe('weapons', () => {
    // tab-npc.hbs DISPLAYS system.weapons.simple[], but only embedded weapon ITEMS are
    // clickable/rollable — an inline-only weapon isn't usable in play, so it's a defect.
    it('flags inline-only weapons (display text, not a rollable item)', () => {
        const doc = npc({ weapons: { mode: 'embedded', simple: [{ name: 'Bite', damage: '1d10' }] } }, [
            { _id: 't0000000000000001', name: 'Bestial', type: 'trait' },
        ]);
        expect(rulesFor(doc)).toContain('weapons-inline-not-embedded');
    });

    it('does not flag an actor that has an embedded weapon item', () => {
        const rules = rulesFor(npc());
        expect(rules).not.toContain('weapons-inline-not-embedded');
        expect(rules).not.toContain('weapons-none');
    });

    it('flags weapons-none only when there is no weapon at all', () => {
        const doc = npc({ weapons: { mode: 'embedded', simple: [] } }, [{ _id: 't0000000000000001', name: 'Bestial', type: 'trait' }]);
        expect(rulesFor(doc)).toContain('weapons-none');
    });
});

describe('skills', () => {
    it('flags prose skills with no trainedSkills — they never render', () => {
        expect(rulesFor(npc({ skills: 'Awareness (Per), Dodge (Ag)', trainedSkills: {} }))).toContain('skills-prose-not-migrated');
    });

    it('accepts prose backed by trainedSkills', () => {
        expect(rulesFor(npc())).not.toContain('skills-prose-not-migrated');
    });

    it('does not flag "None"/descriptive prose (not a real skill list)', () => {
        for (const p of ['None.', 'None', "Uses host's skills.", 'None in their present state.']) {
            expect(rulesFor(npc({ skills: p, trainedSkills: {} }))).not.toContain('skills-prose-not-migrated');
        }
    });
});

describe('stats', () => {
    it('flags an all-30 characteristic grid (no stat block applied)', () => {
        const chars = { ws: 30, bs: 30, s: 30, t: 30, ag: 30, int: 30, per: 30, wp: 30, fel: 30 };
        expect(rulesFor(npc({ characteristics: chars }))).toContain('stats-all-default');
    });

    it('does NOT flag a beast whose — stats are 0 and others vary', () => {
        expect(rulesFor(npc())).not.toContain('stats-all-default');
    });

    it('flags missing wounds', () => {
        expect(rulesFor(npc({ wounds: { max: 0, value: 0, critical: 0 } }))).toContain('stats-no-wounds');
    });

    it('does not flag a horde/swarm without wounds (it tracks magnitude)', () => {
        expect(rulesFor(npc({ wounds: { max: 0, value: 0, critical: 0 }, horde: { enabled: true, magnitude: { max: 30, current: 30 } } }))).not.toContain(
            'stats-no-wounds',
        );
    });
});

describe('inventory references', () => {
    const src = 'Compendium.wh40k-rpg.dh1-core-items-traits.Item.abcdef0123456789';
    const withRef = (): Json => npc({}, [{ _id: 'w0000000000000001', name: 'Claws', type: 'weapon', _stats: { compendiumSource: src } }]);

    it('flags a ref whose id is absent from the target pack', () => {
        expect(rulesFor(withRef(), { 'dh1-core-items-traits': new Set() })).toContain('inventory-dangling-ref');
    });

    it('resolves a ref present in the index', () => {
        expect(rulesFor(withRef(), { 'dh1-core-items-traits': new Set(['abcdef0123456789']) })).not.toContain('inventory-dangling-ref');
    });
});

describe('variant exemption', () => {
    it('does not demand stats/weapons/skills on a variantOf actor (it inherits them)', () => {
        const variant: Json = {
            name: 'Named Individual',
            _id: 'NamedIndivId0001',
            type: 'dh1-npc',
            img: 'https://example/portrait.webp',
            system: { variantOf: 'Compendium.wh40k-rpg.dh1-core-actors-bestiary.Actor.baseclass0000001' },
            items: [],
        };
        const rules = rulesFor(variant, { 'dh1-core-actors-bestiary': new Set(['baseclass0000001']) });
        for (const hard of ['stats-all-default', 'stats-no-wounds', 'weapons-none', 'skills-prose-not-migrated']) {
            expect(rules).not.toContain(hard);
        }
    });
});

describe('scope', () => {
    it('ignores non-npc documents in an actor pack (a stray weapon or vehicle)', () => {
        expect(rulesFor({ name: 'Autogun', _id: 'AutogunTestId001', type: 'weapon', system: {} })).toHaveLength(0);
        expect(rulesFor({ name: 'Tank', _id: 'TankTestId000001', type: 'dh2-terracraft', system: {} })).toHaveLength(0);
    });

    it('isNpcFamily recognises bare and prefixed npc types', () => {
        expect(isNpcFamily('npc')).toBe(true);
        expect(isNpcFamily('dh1-npc')).toBe(true);
        expect(isNpcFamily('dh2-terracraft')).toBe(false);
        expect(isNpcFamily('weapon')).toBe(false);
    });
});

describe('splitProseAbilities', () => {
    it('splits on comma/period/pipe and drops the Size entry (it is system.size)', () => {
        const out = splitProseAbilities('Swift Attack. | Bestial, Fear 1 (Disturbing), Size (Hulking), Sturdy.');
        expect(out).toContain('Swift Attack');
        expect(out).toContain('Bestial');
        expect(out).toContain('Sturdy');
        expect(out.some((s) => /size/i.test(s))).toBe(false);
    });
});
