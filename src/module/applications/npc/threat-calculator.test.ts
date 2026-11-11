import { describe, expect, it } from 'vitest';
import { resolveSkillCharacteristic, SKILL_DEFINITIONS } from '../../data/shared/skill-definitions.ts';
import ThreatCalculator from './threat-calculator.ts';

/**
 * A generated NPC's skills roll on the skill catalog's characteristics (#725).
 * The generator kept a 30-skill table of its own, which had already drifted
 * from the catalog on Security and Survival.
 */
describe('ThreatCalculator.generateSkills (#725)', () => {
    const roles = ThreatCalculator.getRoles().map((role) => role.key);

    it('knows its roles', () => {
        expect(roles.length).toBeGreaterThan(0);
    });

    it("gives every generated skill the catalog's characteristic, for every role and tier", () => {
        const drifted: string[] = [];
        for (const role of roles) {
            for (const threat of [1, 6, 11, 16, 21, 26]) {
                for (const [key, skill] of Object.entries(ThreatCalculator.generateSkills(role, threat))) {
                    if (skill.characteristic !== resolveSkillCharacteristic(key)) drifted.push(`${role}@${threat}:${key}=${skill.characteristic}`);
                }
            }
        }
        expect(drifted).toEqual([]);
    });

    it('generates only skills the catalog lists, so none falls to the default', () => {
        const unknown = roles.flatMap((role) => Object.keys(ThreatCalculator.generateSkills(role, 10)).filter((key) => !(key in SKILL_DEFINITIONS)));
        expect(unknown).toEqual([]);
    });

    it('always includes Dodge on Agility and Awareness on Perception', () => {
        for (const role of roles) {
            expect(ThreatCalculator.generateSkills(role, 1)).toMatchObject({
                dodge: { characteristic: 'agility' },
                awareness: { characteristic: 'perception' },
            });
        }
    });
});
