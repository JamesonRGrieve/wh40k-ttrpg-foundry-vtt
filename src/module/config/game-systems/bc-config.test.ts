/**
 * Black Crusade system-config behavioral tests (#173).
 *
 * Asserts that BCSystemConfig's cost dispatch consults the
 * True/Allied/Opposed matrix (not the aptitude-count tables it used to
 * inherit), that alignment derivation reads the actor's advancement
 * log, and that the Khorne-psyker lock fires through `isPsyker`.
 *
 * No Foundry runtime — uses a minimal stub for the bits of `actor` the
 * config touches.
 */
import { describe, expect, it } from 'vitest';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { ChaosAdvanceEntry } from '../../rules/bc-alignment-derivation.ts';
import { BCSystemConfig } from './bc-config.ts';
import type { ChaosAlignment } from './types.ts';

interface BcActorStub {
    chaosAlignment?: ChaosAlignment;
    chaosAdvancements?: ChaosAdvanceEntry[];
    alignmentCheckpoint?: number;
    corruption?: number;
    infamy?: number;
    archetypeName?: string;
}

function makeActor(stub: BcActorStub = {}): WH40KBaseActor {
    const archetypeName = stub.archetypeName ?? '';
    return {
        items: {
            some: (predicate: (item: { isOriginPath: boolean; system: { step?: string }; name: string }) => boolean) =>
                archetypeName !== '' &&
                predicate({
                    isOriginPath: true,
                    system: { step: 'archetype' },
                    name: archetypeName,
                }),
        },
        system: {
            chaosAlignment: stub.chaosAlignment ?? 'unaligned',
            chaosAdvancements: stub.chaosAdvancements ?? [],
            alignmentCheckpoint: stub.alignmentCheckpoint ?? 0,
            corruption: stub.corruption ?? 0,
            infamy: stub.infamy ?? 0,
        },
        // eslint-disable-next-line no-restricted-syntax -- boundary: test stub for WH40KBaseActor; only the surface BCSystemConfig touches is implemented
    } as unknown as WH40KBaseActor;
}

const cfg = new BCSystemConfig();

describe('BCSystemConfig: characteristic cost dispatch (Table 2-6)', () => {
    it('uses True row for Strength when Aligned to Khorne', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        expect(cfg.getCharacteristicAdvanceCost(actor, 'strength', 0)).toEqual({ cost: 100, tier: 'simple' });
        expect(cfg.getCharacteristicAdvanceCost(actor, 'strength', 3)).toEqual({ cost: 750, tier: 'expert' });
    });

    it('uses Allied row for Strength when Aligned to Nurgle', () => {
        const actor = makeActor({ chaosAlignment: 'nurgle' });
        expect(cfg.getCharacteristicAdvanceCost(actor, 'strength', 0)).toEqual({ cost: 250, tier: 'simple' });
    });

    it('uses Opposed row for Fellowship when Aligned to Khorne (Slaanesh char)', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        // Fellowship = Slaanesh, Khorne vs Slaanesh = Opposed → row [500, 750, 1000, 2500].
        expect(cfg.getCharacteristicAdvanceCost(actor, 'fellowship', 0)?.cost).toBe(500);
        expect(cfg.getCharacteristicAdvanceCost(actor, 'fellowship', 3)?.cost).toBe(2500);
    });

    it('returns null past the Expert tier', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        expect(cfg.getCharacteristicAdvanceCost(actor, 'strength', 4)).toBeNull();
    });

    it('treats Weapon Skill / Infamy as unaligned (Allied for every alignment)', () => {
        const actorK = makeActor({ chaosAlignment: 'khorne' });
        const actorS = makeActor({ chaosAlignment: 'slaanesh' });
        // Unaligned char vs any alignment = Allied → Simple = 250.
        expect(cfg.getCharacteristicAdvanceCost(actorK, 'weaponSkill', 0)?.cost).toBe(250);
        expect(cfg.getCharacteristicAdvanceCost(actorS, 'weaponSkill', 0)?.cost).toBe(250);
    });
});

describe('BCSystemConfig: skill cost dispatch (Table 2-7)', () => {
    it('uses Opposed row when the advance alignment opposes the character', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        // Charm (Slaanesh) for a Khorne PC: RAW worked example, "further 500 xp".
        expect(cfg.getSkillAdvanceCost(actor, 'charm', 1, { advanceAlignment: 'slaanesh' })).toBe(500);
    });

    it('uses True row for an alignment-matching skill', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        expect(cfg.getSkillAdvanceCost(actor, 'athletics', 0, { advanceAlignment: 'khorne' })).toBe(100);
    });

    it('defaults to Allied (unaligned advance) when no advanceAlignment is supplied', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        expect(cfg.getSkillAdvanceCost(actor, 'awareness', 0)).toBe(200); // unaligned → Allied → 200
    });
});

describe('BCSystemConfig: talent cost dispatch (Table 2-9)', () => {
    it('reads tier and alignment off the talent item when present', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        const talent = { system: { chaosAlignment: 'khorne', tier: 2 } };
        expect(cfg.getTalentAdvanceCost(actor, talent)).toBe(300); // True / Tier 2
    });

    it('lets context override the talent system data', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        const talent = { system: { chaosAlignment: 'khorne', tier: 1 } };
        expect(cfg.getTalentAdvanceCost(actor, talent, { tier: 3, advanceAlignment: 'slaanesh' })).toBe(1000);
    });

    it('falls back to Tier 1 / unaligned when the talent has no system data', () => {
        const actor = makeActor({ chaosAlignment: 'khorne' });
        expect(cfg.getTalentAdvanceCost(actor, null)).toBe(250); // unaligned → Allied / Tier 1
    });
});

describe('BCSystemConfig: Infamy advancement (core.md :2667)', () => {
    it('returns 500 xp while infamy is below 40', () => {
        expect(cfg.getInfamyAdvanceCost(makeActor({ infamy: 0 }))).toBe(500);
        expect(cfg.getInfamyAdvanceCost(makeActor({ infamy: 39 }))).toBe(500);
    });

    it('returns null once infamy reaches 40', () => {
        expect(cfg.getInfamyAdvanceCost(makeActor({ infamy: 40 }))).toBeNull();
        expect(cfg.getInfamyAdvanceCost(makeActor({ infamy: 60 }))).toBeNull();
    });

    it('exposes the increment and cap to the UI', () => {
        expect(cfg.infamyAdvanceIncrement).toBe(5);
        expect(cfg.infamyAdvanceCap).toBe(40);
        expect(cfg.infamyAdvanceFlatCost).toBe(500);
    });
});

describe('BCSystemConfig: alignment derivation from advance log', () => {
    function adv(alignment: ChaosAlignment, fromArchetype = false): ChaosAdvanceEntry {
        return { category: 'skill', key: 'k', xpCost: 100, alignment, fromArchetype };
    }

    it('tallies non-archetype advances per god', () => {
        const actor = makeActor({
            chaosAdvancements: [adv('khorne'), adv('khorne'), adv('nurgle'), adv('khorne', true)],
        });
        expect(cfg.getAlignmentTally(actor)).toEqual({ khorne: 2, nurgle: 1, slaanesh: 0, tzeentch: 0 });
    });

    it('derives Khorne when its lead reaches 5 advances', () => {
        const actor = makeActor({
            chaosAdvancements: [adv('khorne'), adv('khorne'), adv('khorne'), adv('khorne'), adv('khorne')],
        });
        expect(cfg.deriveAlignmentFor(actor)).toBe('khorne');
    });

    it('stays Unaligned when the lead is only 4 advances', () => {
        const actor = makeActor({
            chaosAdvancements: [adv('khorne'), adv('khorne'), adv('khorne'), adv('khorne'), adv('khorne'), adv('nurgle')],
        });
        expect(cfg.deriveAlignmentFor(actor)).toBe('unaligned');
    });

    it('reports a pending re-check after each 10-CP threshold (core.md :2569)', () => {
        const a0 = makeActor({ corruption: 0, alignmentCheckpoint: 0 });
        const a9 = makeActor({ corruption: 9, alignmentCheckpoint: 0 });
        const a10 = makeActor({ corruption: 10, alignmentCheckpoint: 0 });
        const a25 = makeActor({ corruption: 25, alignmentCheckpoint: 20 });
        const a30 = makeActor({ corruption: 30, alignmentCheckpoint: 20 });
        expect(cfg.shouldRecheckAlignment(a0)).toBe(false);
        expect(cfg.shouldRecheckAlignment(a9)).toBe(false);
        expect(cfg.shouldRecheckAlignment(a10)).toBe(true);
        expect(cfg.shouldRecheckAlignment(a25)).toBe(false);
        expect(cfg.shouldRecheckAlignment(a30)).toBe(true);

        expect(cfg.nextCheckpointFor(a10)).toBe(10);
        expect(cfg.nextCheckpointFor(a25)).toBe(20);
        expect(cfg.nextCheckpointFor(a30)).toBe(30);
    });
});

describe('BCSystemConfig: Khorne / psyker lock (core.md :2750)', () => {
    it('returns true for a Psyker-archetype actor while Unaligned', () => {
        const actor = makeActor({ chaosAlignment: 'unaligned', archetypeName: 'Psyker' });
        expect(cfg.isPsyker(actor)).toBe(true);
    });

    it('returns false for a Psyker-archetype actor Aligned to Khorne', () => {
        const actor = makeActor({ chaosAlignment: 'khorne', archetypeName: 'Psyker' });
        expect(cfg.isPsyker(actor)).toBe(false);
        expect(cfg.isAlignmentBlockingPsyker(actor)).toBe(true);
    });

    it('returns true for a Psyker-archetype actor Aligned to Tzeentch', () => {
        const actor = makeActor({ chaosAlignment: 'tzeentch', archetypeName: 'Psyker' });
        expect(cfg.isPsyker(actor)).toBe(true);
        expect(cfg.isAlignmentBlockingPsyker(actor)).toBe(false);
    });

    it('returns false for any non-Psyker archetype regardless of alignment', () => {
        expect(cfg.isPsyker(makeActor({ chaosAlignment: 'tzeentch', archetypeName: 'Chosen' }))).toBe(false);
    });
});

describe('BCSystemConfig: tier and rank definitions (core.md :2581, :2677)', () => {
    it('declares the 4 BC characteristic tiers in RAW order', () => {
        expect(cfg.getCharacteristicTiers().map((t) => t.key)).toEqual(['simple', 'intermediate', 'trained', 'expert']);
    });

    it('declares the 4 BC skill ranks with DH2-compatible schema keys', () => {
        const ranks = cfg.getSkillRanks();
        expect(ranks).toHaveLength(4);
        expect(ranks.map((r) => r.key)).toEqual(['trained', 'plus10', 'plus20', 'plus30']);
        expect(ranks.map((r) => r.bonus)).toEqual([0, 10, 20, 30]);
        expect(ranks.map((r) => r.tooltip)).toEqual(['Known', 'Trained', 'Experienced', 'Veteran']);
    });
});
