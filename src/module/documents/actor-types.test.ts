import { describe, expect, it } from 'vitest';
import { isCharacterActorType, isVehicleActorType } from './actor-types.ts';

describe('isVehicleActorType', () => {
    it('accepts every per-line and generic craft, voidship and legacy vehicle type', () => {
        for (const type of [
            'vehicle',
            'starship',
            'terracraft',
            'aircraft',
            'watercraft',
            'voidcraft',
            'dh2-vehicle',
            'rt-starship',
            'dh2-terracraft',
            'ow-aircraft',
            'rt-voidcraft',
            'im-vehicle',
        ]) {
            expect(isVehicleActorType(type)).toBe(true);
        }
    });

    it('rejects characters, NPCs, loot and look-alikes', () => {
        for (const type of ['character', 'dh2-character', 'rt-npc', 'loot', 'vehicle-crew', 'aircraftman', '']) {
            expect(isVehicleActorType(type)).toBe(false);
        }
    });
});

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
