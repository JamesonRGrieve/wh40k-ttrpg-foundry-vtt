import { describe, expect, it } from 'vitest';
import {
    CONVERTIBLE_ACTOR_KINDS,
    CONVERTIBLE_CHARACTER_SYSTEMS,
    getActorKind,
    getActorSystemId,
    getConvertedActorType,
    isConvertibleActorKind,
    isConvertibleActorType,
} from './actor-system-converter.ts';

/**
 * Coverage for the pure type-guard / parser surface of the actor-system
 * converter — the `<system>-<kind>` actor-type string handling. The conversion
 * pipeline itself (cleanData / scene-token reassignment / actor.update) is
 * Foundry-coupled and left for an integration harness.
 */

describe('isConvertibleActorKind', () => {
    it('accepts every registered kind', () => {
        for (const kind of CONVERTIBLE_ACTOR_KINDS) {
            expect(isConvertibleActorKind(kind)).toBe(true);
        }
    });

    it('rejects an unknown kind', () => {
        expect(isConvertibleActorKind('starship')).toBe(false);
        expect(isConvertibleActorKind('')).toBe(false);
    });
});

describe('isConvertibleActorType', () => {
    it('accepts a "<system>-<kind>" pair for every system', () => {
        for (const system of CONVERTIBLE_CHARACTER_SYSTEMS) {
            expect(isConvertibleActorType(`${system}-character`)).toBe(true);
        }
    });

    it('rejects an unknown system', () => {
        expect(isConvertibleActorType('wfrp-character')).toBe(false);
    });

    it('rejects an unknown kind', () => {
        expect(isConvertibleActorType('dh2-starship')).toBe(false);
    });

    it('rejects a string without the separator', () => {
        expect(isConvertibleActorType('dh2character')).toBe(false);
        expect(isConvertibleActorType('dh2')).toBe(false);
    });
});

describe('getActorKind', () => {
    it('extracts the kind from a valid type', () => {
        expect(getActorKind('dh2-character')).toBe('character');
        expect(getActorKind('rt-npc')).toBe('npc');
        expect(getActorKind('ow-aircraft')).toBe('aircraft');
    });

    it('returns null for an invalid type', () => {
        expect(getActorKind('wfrp-character')).toBeNull();
        expect(getActorKind('dh2-starship')).toBeNull();
    });
});

describe('getActorSystemId', () => {
    it('extracts the system id from a valid type', () => {
        expect(getActorSystemId('dh2-character')).toBe('dh2');
        expect(getActorSystemId('im-npc')).toBe('im');
    });

    it('returns null for an invalid type', () => {
        expect(getActorSystemId('wfrp-character')).toBeNull();
    });
});

describe('getConvertedActorType', () => {
    it('joins system and kind into a "<system>-<kind>" type', () => {
        expect(getConvertedActorType('dh1', 'character')).toBe('dh1-character');
        expect(getConvertedActorType('bc', 'npc')).toBe('bc-npc');
    });

    it('round-trips with getActorSystemId / getActorKind', () => {
        const type = getConvertedActorType('dw', 'character');
        expect(getActorSystemId(type)).toBe('dw');
        expect(getActorKind(type)).toBe('character');
    });
});
