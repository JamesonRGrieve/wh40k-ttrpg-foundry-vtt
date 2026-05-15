import { describe, expect, it } from 'vitest';
import type { GrantResult } from './grants-processor';

/**
 * Schema-only regression for the GrantResult shape. The processor itself
 * needs a live Foundry actor + item graph so the integration paths are
 * exercised by the application/story suite. This file pins the addition
 * of `fateThresholdBonus` so a future refactor can't quietly drop it.
 */
describe('GrantResult shape', () => {
    it('declares fateThresholdBonus alongside fateBonus', () => {
        const empty: GrantResult = {
            characteristics: {},
            itemsToCreate: [],
            skillUpdates: {},
            woundsBonus: 0,
            fateBonus: 0,
            fateThresholdBonus: 0,
            corruptionBonus: 0,
            insanityBonus: 0,
            aptitudes: [],
            notifications: [],
        };
        expect(empty.fateThresholdBonus).toBe(0);
        expect(empty.fateBonus).toBe(0);
    });
});
