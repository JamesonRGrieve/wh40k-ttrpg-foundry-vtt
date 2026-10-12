import { describe, expect, it } from 'vitest';
import { isCharacterActorType } from './actor-types.ts';

describe('isCharacterActorType', () => {
    it('accepts every per-line character type and the generic fallback', () => {
        for (const type of ['character', 'dh2-character', 'dh1-character', 'bc-character', 'dw-character', 'ow-character', 'rt-character']) {
            expect(isCharacterActorType(type)).toBe(true);
        }
    });

    it('rejects NPCs, vehicles, starships and look-alikes', () => {
        for (const type of ['dh2-npc', 'rt-starship', 'dh2-terracraft', 'loot', 'acolyte', 'character-sheet']) {
            expect(isCharacterActorType(type)).toBe(false);
        }
    });
});
