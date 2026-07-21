/**
 * Tests for assistance eligibility (#60).
 *
 * The bonus used to come from a free integer, which let a player claim aid from
 * allies who weren't on the scene or couldn't perform the skill. Eligibility is
 * now decided here: friendly, present, not the roller, and trained.
 */

import { describe, expect, it } from 'vitest';
import { type AssistCandidate, actorKnowsSkill, eligibleAssistants, retainEligibleSelection } from './roll-assist.ts';

const FRIENDLY = 1;
const NEUTRAL = 0;
const HOSTILE = -1;

function candidate(overrides: Partial<AssistCandidate> & { id: string; name: string }): AssistCandidate {
    return {
        disposition: FRIENDLY,
        isSelf: false,
        actor: { skills: { medicae: { advance: 1 } } },
        ...overrides,
    };
}

describe('actorKnowsSkill', () => {
    it('accepts a character with a trained advance rank', () => {
        expect(actorKnowsSkill({ skills: { medicae: { advance: 2 } } }, 'medicae')).toBe(true);
    });

    it('rejects a character whose advance is 0 (untrained is not RAW assistance)', () => {
        expect(actorKnowsSkill({ skills: { medicae: { advance: 0 } } }, 'medicae')).toBe(false);
    });

    it('accepts an NPC via the separate trainedSkills map', () => {
        // NPCs do not carry the full skill schema — they use trainedSkills.
        expect(actorKnowsSkill({ trainedSkills: { medicae: 30 } }, 'medicae')).toBe(true);
    });

    it('rejects a skill absent from both stores', () => {
        expect(actorKnowsSkill({ skills: { dodge: { advance: 3 } } }, 'medicae')).toBe(false);
        expect(actorKnowsSkill({ trainedSkills: { dodge: 30 } }, 'medicae')).toBe(false);
    });

    it('rejects a null actor or an absent skill key', () => {
        expect(actorKnowsSkill(null, 'medicae')).toBe(false);
        expect(actorKnowsSkill({ skills: { medicae: { advance: 2 } } }, null)).toBe(false);
        expect(actorKnowsSkill({ skills: { medicae: { advance: 2 } } }, '')).toBe(false);
    });
});

describe('eligibleAssistants', () => {
    it('offers a friendly, trained ally who is not the roller', () => {
        const allies = [candidate({ id: 't1', name: 'Ibnad' })];
        expect(eligibleAssistants(allies, 'medicae').map((a) => a.name)).toEqual(['Ibnad']);
    });

    it('excludes the roller themselves', () => {
        const allies = [candidate({ id: 't1', name: 'Self', isSelf: true })];
        expect(eligibleAssistants(allies, 'medicae')).toEqual([]);
    });

    it('excludes hostile and neutral tokens', () => {
        const allies = [candidate({ id: 't1', name: 'Foe', disposition: HOSTILE }), candidate({ id: 't2', name: 'Bystander', disposition: NEUTRAL })];
        expect(eligibleAssistants(allies, 'medicae')).toEqual([]);
    });

    it('excludes an ally who does not know the skill', () => {
        const allies = [candidate({ id: 't1', name: 'Untrained', actor: { skills: { medicae: { advance: 0 } } } })];
        expect(eligibleAssistants(allies, 'medicae')).toEqual([]);
    });

    it('offers nothing for a characteristic test (no skill key)', () => {
        // A characteristic test has no "knows the skill" notion — offering every
        // ally would be exactly the unbounded claim the chips exist to prevent.
        expect(eligibleAssistants([candidate({ id: 't1', name: 'Ibnad' })], null)).toEqual([]);
    });

    it('deduplicates one actor placed as several tokens', () => {
        const allies = [candidate({ id: 't1', name: 'Ibnad' }), candidate({ id: 't2', name: 'Ibnad' })];
        expect(eligibleAssistants(allies, 'medicae')).toHaveLength(1);
    });
});

describe('retainEligibleSelection', () => {
    it('keeps only ids that are still eligible, in eligibility order', () => {
        const eligible = [candidate({ id: 't1', name: 'A' }), candidate({ id: 't2', name: 'B' })];
        expect(retainEligibleSelection(new Set(['t2', 't1']), eligible).map((a) => a.id)).toEqual(['t1', 't2']);
    });

    it('drops a stale id whose token left the scene', () => {
        // Guards a chip toggled on, then the ally walking off the map: the bonus
        // must not survive without a visible chip behind it.
        const eligible = [candidate({ id: 't1', name: 'A' })];
        expect(retainEligibleSelection(new Set(['t1', 'gone']), eligible).map((a) => a.id)).toEqual(['t1']);
    });

    it('returns [] when nothing is selected', () => {
        expect(retainEligibleSelection(new Set(), [candidate({ id: 't1', name: 'A' })])).toEqual([]);
    });
});
