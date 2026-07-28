/**
 * Unit tests for the pure NPC-advancement math (#503).
 *
 * The invariants that matter are (a) the characteristic split always
 * reconstructs the printed value, (b) every ladder is charged cumulatively so an
 * NPC's XP equals what a player would have paid, and (c) aptitude derivation is
 * deterministic — the same stat block must always yield the same set, or the
 * derived XP drifts between runs.
 */

import { describe, expect, it } from 'vitest';
import {
    CHARACTERISTIC_STEP,
    MAX_CHARACTERISTIC_ADVANCES,
    MAX_SKILL_RANK,
    NPC_CHARACTERISTIC_BASELINE,
    type AdvancementCostTables,
    type NpcBuild,
    characteristicAdvanceCost,
    countMatches,
    cumulativeLadderCost,
    deriveAptitudes,
    deriveNpcXp,
    psychicAdvanceCost,
    skillAdvanceCost,
    splitCharacteristic,
    talentAdvanceCost,
} from './npc-advancement.ts';

/** DH2e Core tables 2-2 / 2-4 / 2-6, the defaults `AptitudeBasedSystemConfig` supplies. */
const TABLES: AdvancementCostTables = {
    skill: { 2: [100, 200, 300, 400], 1: [200, 400, 600, 800], 0: [300, 600, 900, 1200] },
    characteristic: { 2: [100, 250, 500, 750, 1250], 1: [250, 500, 750, 1000, 1500], 0: [500, 750, 1000, 1500, 2500] },
    talent: { 1: { 2: 200, 1: 300, 0: 600 }, 2: { 2: 300, 1: 450, 0: 900 }, 3: { 2: 400, 1: 600, 0: 1200 } },
};

const emptyBuild = (): NpcBuild => ({ skills: [], talents: [], characteristics: [], psychic: { psyRating: 0, powerPrCosts: [] } });

describe('splitCharacteristic', () => {
    it('always reconstructs the printed value from base + advance x 5', () => {
        for (let printed = 0; printed <= 80; printed += 1) {
            const { base, advance } = splitCharacteristic(printed);
            expect(base + advance * CHARACTERISTIC_STEP).toBe(printed);
        }
    });

    it('charges no advances at or below the baseline', () => {
        expect(splitCharacteristic(NPC_CHARACTERISTIC_BASELINE)).toEqual({ base: 30, advance: 0 });
        expect(splitCharacteristic(25)).toEqual({ base: 25, advance: 0 });
        expect(splitCharacteristic(0)).toEqual({ base: 0, advance: 0 });
    });

    it('floors part-steps into base instead of rounding up into an unpaid advance', () => {
        // 44 is two full +5 steps above 30 with 4 left over — the remainder stays in base.
        expect(splitCharacteristic(44)).toEqual({ base: 34, advance: 2 });
        expect(splitCharacteristic(40)).toEqual({ base: 30, advance: 2 });
        expect(splitCharacteristic(34)).toEqual({ base: 34, advance: 0 });
    });

    it('clamps at the five-tier ceiling', () => {
        const { advance } = splitCharacteristic(200);
        expect(advance).toBe(MAX_CHARACTERISTIC_ADVANCES);
    });

    it('is total on non-finite input', () => {
        expect(splitCharacteristic(Number.NaN)).toEqual({ base: 0, advance: 0 });
    });
});

describe('cumulativeLadderCost', () => {
    it('charges every step up to the rank, not just the last', () => {
        expect(cumulativeLadderCost([100, 200, 300, 400], 3)).toBe(600);
    });

    it('is zero at rank 0 and total beyond the row', () => {
        expect(cumulativeLadderCost([100, 200], 0)).toBe(0);
        expect(cumulativeLadderCost([100, 200], 9)).toBe(300);
        expect(cumulativeLadderCost(undefined, 3)).toBe(0);
    });
});

describe('countMatches', () => {
    it('counts case-insensitively', () => {
        expect(countMatches(['Fellowship', 'social'], ['Social', 'Leadership'])).toBe(1);
        expect(countMatches(['Fellowship', 'Social'], ['Fellowship', 'Social'])).toBe(2);
        expect(countMatches([], ['Fellowship'])).toBe(0);
    });
});

describe('advance pricing', () => {
    it('prices a skill ladder against matching aptitudes', () => {
        const skill = { key: 'command', aptitudes: ['Fellowship', 'Leadership'], steps: 3 };
        // 2 matches → 100 + 200 + 300
        expect(skillAdvanceCost(TABLES, ['Fellowship', 'Leadership'], skill)).toBe(600);
        // 1 match → 200 + 400 + 600
        expect(skillAdvanceCost(TABLES, ['Fellowship'], skill)).toBe(1200);
        // 0 matches → 300 + 600 + 900
        expect(skillAdvanceCost(TABLES, [], skill)).toBe(1800);
    });

    it('clamps a skill above the rank ceiling', () => {
        const skill = { key: 'dodge', aptitudes: ['Agility', 'Defence'], steps: 99 };
        expect(skillAdvanceCost(TABLES, ['Agility', 'Defence'], skill)).toBe(cumulativeLadderCost(TABLES.skill[2], MAX_SKILL_RANK));
    });

    it('prices a characteristic ladder cumulatively', () => {
        const characteristic = { key: 'weaponSkill', aptitudes: ['Weapon Skill', 'Offence'], steps: 2 };
        expect(characteristicAdvanceCost(TABLES, ['Weapon Skill', 'Offence'], characteristic)).toBe(350);
        expect(characteristicAdvanceCost(TABLES, [], characteristic)).toBe(1250);
    });

    it('prices a talent at its tier, falling back to tier 1 outside the table', () => {
        expect(talentAdvanceCost(TABLES, ['Offence', 'Weapon Skill'], { aptitudes: ['Offence', 'Weapon Skill'], tier: 2 })).toBe(300);
        expect(talentAdvanceCost(TABLES, [], { aptitudes: ['Offence'], tier: 3 })).toBe(1200);
        // tier 0 (schema default) is not a priced tier — falls back to tier 1
        expect(talentAdvanceCost(TABLES, ['Offence'], { aptitudes: ['Offence'], tier: 0 })).toBe(300);
    });

    it('prices psy rating cumulatively plus each known power', () => {
        // rating 3 → 200 + 400 + 600 = 1200; two PR-1 powers → 200 each
        expect(psychicAdvanceCost({ psyRating: 3, powerPrCosts: [1, 1] })).toBe(1600);
        expect(psychicAdvanceCost({ psyRating: 0, powerPrCosts: [] })).toBe(0);
    });
});

describe('deriveNpcXp', () => {
    it('sums every advancement class and reports the breakdown', () => {
        const build: NpcBuild = {
            skills: [{ key: 'command', aptitudes: ['Fellowship', 'Leadership'], steps: 3 }],
            talents: [{ aptitudes: ['Fellowship', 'Leadership'], tier: 1 }],
            characteristics: [{ key: 'fellowship', aptitudes: ['Fellowship', 'Social'], steps: 2 }],
            psychic: { psyRating: 0, powerPrCosts: [] },
        };
        const held = ['Fellowship', 'Leadership', 'Social'];
        const xp = deriveNpcXp(TABLES, held, build);
        expect(xp.skills).toBe(600);
        expect(xp.talents).toBe(200);
        expect(xp.characteristics).toBe(350);
        expect(xp.psychic).toBe(0);
        expect(xp.total).toBe(1150);
    });

    it('is zero for a stat block with nothing advanced', () => {
        expect(deriveNpcXp(TABLES, [], emptyBuild()).total).toBe(0);
    });
});

describe('deriveAptitudes', () => {
    const build: NpcBuild = {
        skills: [
            { key: 'command', aptitudes: ['Fellowship', 'Leadership'], steps: 3 },
            { key: 'intimidate', aptitudes: ['Strength', 'Social'], steps: 2 },
            { key: 'awareness', aptitudes: ['Perception', 'Fieldcraft'], steps: 1 },
        ],
        talents: [{ aptitudes: ['Fellowship', 'Leadership'], tier: 2 }],
        characteristics: [{ key: 'fellowship', aptitudes: ['Fellowship', 'Social'], steps: 2 }],
        psychic: { psyRating: 0, powerPrCosts: [] },
    };

    it('ranks the aptitudes the stat block actually leans on', () => {
        const apts = deriveAptitudes(build, 3);
        // Fellowship scores 3 (command) + 2 (talent) + 2 (characteristic) = 7 — clearly first.
        expect(apts[0]).toBe('Fellowship');
        expect(apts).toContain('Leadership');
        expect(apts).toHaveLength(3);
    });

    it('is deterministic — repeated derivation yields an identical set', () => {
        expect(deriveAptitudes(build)).toEqual(deriveAptitudes(build));
    });

    it('breaks ties alphabetically rather than by insertion order', () => {
        const tied: NpcBuild = {
            ...emptyBuild(),
            skills: [
                { key: 'a', aptitudes: ['Zeta'], steps: 1 },
                { key: 'b', aptitudes: ['Alpha'], steps: 1 },
            ],
        };
        expect(deriveAptitudes(tied, 2)).toEqual(['Alpha', 'Zeta']);
    });

    it('returns an empty set for an unadvanced stat block', () => {
        expect(deriveAptitudes(emptyBuild())).toEqual([]);
    });
});
