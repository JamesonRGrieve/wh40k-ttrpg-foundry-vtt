import { describe, expect, it } from 'vitest';

/**
 * Tests for CharacterData.
 * CharacterData extends CreatureTemplate and adds character-specific fields
 * (experience, origin path, mental state) plus pure-logic derived getters.
 *
 * CharacterData touches `foundry.data.fields` during `defineSchema`, so it
 * cannot be imported under happy-dom (no Foundry runtime) — the import is
 * attempted at module load and every test is gated with `it.skipIf` so the
 * suite skips cleanly when the runtime is unavailable. Once Foundry test
 * infrastructure exists, these run for real (corruption thresholds, insanity
 * degrees, experience-availability), exercising the prototype getters with a
 * minimal stubbed `this`.
 */

/** Minimal shape a CharacterData getter reads when computing corruptionLevel. */
interface CorruptionStub {
    corruption: number;
}

/** Minimal shape a CharacterData getter reads when computing insanityDegrees. */
interface InsanityStub {
    insanity: number;
}

/** Minimal shape _prepareExperience mutates / reads. */
interface ExperienceStub {
    experience: { total: number; used: number; available: number };
}

const MOD = await import('./character').catch((err) => {
    console.warn(`CharacterData could not be imported in this environment: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
});

const CREATURE_MOD = await import('./templates/creature').catch(() => undefined);
const proto = MOD?.default.prototype;

describe('CharacterData', () => {
    it.skipIf(MOD === undefined)('exports a default class symbol', () => {
        expect(MOD?.default).toBeTruthy();
    });

    it.skipIf(MOD === undefined || CREATURE_MOD === undefined)('inherits CreatureTemplate as its parent class', () => {
        expect(MOD?.default.prototype).toBeInstanceOf(CREATURE_MOD?.default);
    });

    it.skipIf(MOD === undefined)('_migrateData with empty source does not throw', () => {
        expect(() => MOD?.default._migrateData({})).not.toThrow();
    });

    it.skipIf(MOD === undefined)('defineSchema is available as a static method', () => {
        expect(typeof MOD?.default.defineSchema).toBe('function');
    });

    it.skipIf(proto === undefined)('corruptionLevel maps corruption thresholds to the four levels', () => {
        expect(typeof Object.getOwnPropertyDescriptor(proto ?? {}, 'corruptionLevel')?.get).toBe('function');
        const read = (corruption: number): string =>
            String(Object.getOwnPropertyDescriptor(proto ?? {}, 'corruptionLevel')?.get?.call({ corruption } satisfies CorruptionStub));
        expect(read(0)).toBe('none');
        expect(read(29)).toBe('none');
        expect(read(30)).toBe('tainted');
        expect(read(59)).toBe('tainted');
        expect(read(60)).toBe('corrupted');
        expect(read(89)).toBe('corrupted');
        expect(read(90)).toBe('lost');
        expect(read(120)).toBe('lost');
    });

    it.skipIf(proto === undefined)('insanityDegrees returns floor(insanity / 10)', () => {
        expect(typeof Object.getOwnPropertyDescriptor(proto ?? {}, 'insanityDegrees')?.get).toBe('function');
        const read = (insanity: number): number =>
            Number(Object.getOwnPropertyDescriptor(proto ?? {}, 'insanityDegrees')?.get?.call({ insanity } satisfies InsanityStub));
        expect(read(0)).toBe(0);
        expect(read(9)).toBe(0);
        expect(read(10)).toBe(1);
        expect(read(25)).toBe(2);
        expect(read(99)).toBe(9);
    });

    it.skipIf(proto === undefined)('_prepareExperience sets experience.available to total minus used', () => {
        const prepareExperience = Object.getOwnPropertyDescriptor(proto ?? {}, '_prepareExperience')?.value as ((this: ExperienceStub) => void) | undefined;
        expect(typeof prepareExperience).toBe('function');
        const stub: ExperienceStub = { experience: { total: 1000, used: 350, available: 0 } };
        prepareExperience?.call(stub);
        expect(stub.experience.available).toBe(650);
    });
});
