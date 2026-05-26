import { describe, expect, it } from 'vitest';
import { DH2eSystemConfig } from './dh2-config';

/**
 * DH2 errata regression tests (errata.md L33):
 *
 *   "Table 2–5: Skill Aptitudes (Page 81): Replace the Aptitude 2 for
 *    the Common Lore skill with *General*."
 *
 * The codebase already encodes this — `commonLore: ['Intelligence',
 * 'General']` in `getSkillAptitudeTable()`. This test pins the value so
 * a future refactor of the aptitude table cannot quietly regress the
 * errata.
 */
describe('DH2eSystemConfig skill-aptitude table (#150 errata)', () => {
    const cfg = new DH2eSystemConfig();
    const aptitudes = cfg.getSkillAptitudeTable();

    it("Common Lore's aptitudes are [Intelligence, General] (errata L33)", () => {
        expect(aptitudes['commonLore']).toEqual(['Intelligence', 'General']);
    });

    it('every visible skill has exactly two aptitude entries', () => {
        for (const skill of cfg.getVisibleSkills()) {
            const pair = aptitudes[skill];
            expect(pair, `missing aptitudes for skill "${skill}"`).toBeDefined();
            expect(pair).toHaveLength(2);
        }
    });
});

/**
 * DH2 aptitude advance-cost matrix (#126) — core.md Tables 2-2, 2-4, 2-6
 * (p. 41 region). Each advance's XP cost is modified by how many of the
 * actor's Aptitudes match (0 / 1 / 2 matches). `aptitude-based-system-
 * config.ts` exposes the three matrix lookups; these tests pin the
 * canonical DH2e values so a future refactor of the cost tables cannot
 * silently regress the matrix.
 */
describe('DH2eSystemConfig advance cost matrix (#126)', () => {
    const cfg = new DH2eSystemConfig();

    describe('getSkillCostTable() — Table 2-4 (Skill Ranks)', () => {
        const skillCosts = cfg.getSkillCostTable();
        // ranks 0..3 = Known, Trained, Experienced, Veteran
        it('2 matching aptitudes: [100, 200, 300, 400]', () => {
            expect(skillCosts[2]).toEqual([100, 200, 300, 400]);
        });
        it('1 matching aptitude: [200, 400, 600, 800]', () => {
            expect(skillCosts[1]).toEqual([200, 400, 600, 800]);
        });
        it('0 matching aptitudes: [300, 600, 900, 1200]', () => {
            expect(skillCosts[0]).toEqual([300, 600, 900, 1200]);
        });
    });

    describe('getCharacteristicCostTable() — Table 2-2 (Characteristics)', () => {
        const charCosts = cfg.getCharacteristicCostTable();
        // tiers 0..4 = Simple, Intermediate, Trained, Proficient, Expert
        it('2 matching aptitudes: [100, 250, 500, 750, 1250]', () => {
            expect(charCosts[2]).toEqual([100, 250, 500, 750, 1250]);
        });
        it('1 matching aptitude: [250, 500, 750, 1000, 1500]', () => {
            expect(charCosts[1]).toEqual([250, 500, 750, 1000, 1500]);
        });
        it('0 matching aptitudes: [500, 750, 1000, 1500, 2500]', () => {
            expect(charCosts[0]).toEqual([500, 750, 1000, 1500, 2500]);
        });
    });

    describe('getTalentCostTable() — Table 2-6 (Talents)', () => {
        const talentCosts = cfg.getTalentCostTable();
        it('Tier 1: 2/1/0 matches → 200/300/600', () => {
            expect(talentCosts[1]).toEqual({ 2: 200, 1: 300, 0: 600 });
        });
        it('Tier 2: 2/1/0 matches → 300/450/900', () => {
            expect(talentCosts[2]).toEqual({ 2: 300, 1: 450, 0: 900 });
        });
        it('Tier 3: 2/1/0 matches → 400/600/1200', () => {
            expect(talentCosts[3]).toEqual({ 2: 400, 1: 600, 0: 1200 });
        });
    });

    describe('countMatchingAptitudes()', () => {
        it('returns 2 when both advance aptitudes are in the character set', () => {
            const matches = cfg.countMatchingAptitudes(['Weapon Skill', 'Offence', 'Defence'], ['Weapon Skill', 'Offence']);
            expect(matches).toBe(2);
        });
        it('returns 1 when one of the two matches', () => {
            const matches = cfg.countMatchingAptitudes(['Weapon Skill', 'Defence'], ['Weapon Skill', 'Offence']);
            expect(matches).toBe(1);
        });
        it('returns 0 when neither matches', () => {
            const matches = cfg.countMatchingAptitudes(['Fellowship', 'Social'], ['Weapon Skill', 'Offence']);
            expect(matches).toBe(0);
        });
        it('is case-insensitive', () => {
            const matches = cfg.countMatchingAptitudes(['weapon skill', 'OFFENCE'], ['Weapon Skill', 'Offence']);
            expect(matches).toBe(2);
        });
    });
});
