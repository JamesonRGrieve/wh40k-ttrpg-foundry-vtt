import { describe, expect, it } from 'vitest';
import { FIELD_VIVISECTION, LEAPING_DODGE, PUSH_THE_LIMIT, RIGHT_STUFF, SERENITY_OF_THE_GREEN, SURVIVORS_PARANOIA } from './xenos-features';

/**
 * Contract tests for the Enemies Without supplement constants
 * (without.md p.48 / p.32-35). Covers the Ace role (#100), novel-
 * mechanic talents (#101), and Without homeworld traits (#102).
 * Runtime wiring (hooks into roll dialog / damage path / surprise
 * mechanics) remains follow-up.
 */

describe('Ace role — Right Stuff (#100)', () => {
    it('applies to Operate and Survival skills only', () => {
        expect([...RIGHT_STUFF.applicableSkills]).toEqual(['operate', 'survival']);
    });
});

describe('Without novel-mechanic talents (#101)', () => {
    it('Field Vivisection uses Medicae and requires Forbidden Lore', () => {
        expect(FIELD_VIVISECTION.alternateSkill).toBe('medicae');
        expect(FIELD_VIVISECTION.requiresForbiddenLore).toBe(true);
    });

    it('Leaping Dodge uses Dodge skill for Spray avoidance (composes with #103)', () => {
        expect(LEAPING_DODGE.sprayAvoidanceSkill).toBe('dodge');
    });

    it('Push the Limit grants +20 Operate; 4+ DoF triggers motive-systems critical', () => {
        expect(PUSH_THE_LIMIT.operateBonus).toBe(20);
        expect(PUSH_THE_LIMIT.failureThresholdForCritical).toBe(4);
    });
});

describe('Without homeworld traits (#102)', () => {
    it("Death World — Survivor's Paranoia negates the +30 Surprise bonus", () => {
        expect(SURVIVORS_PARANOIA.negatedSurpriseBonus).toBe(30);
    });

    it('Garden World — Serenity of the Green halves Shock/Trauma duration; 50 XP Insanity recovery', () => {
        expect(SERENITY_OF_THE_GREEN.shockDurationMultiplier).toBe(0.5);
        expect(SERENITY_OF_THE_GREEN.insanityRecoveryXpCost).toBe(50);
    });
});
