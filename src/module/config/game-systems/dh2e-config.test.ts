import { describe, expect, it } from 'vitest';
import { DH2eSystemConfig } from './dh2e-config';

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
