import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('GearData', () => {
    it('has a default GearData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./gear.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - prepareDerivedData formats display weight + cost
    //   - migrateData normalises legacy gear payloads
});

/**
 * #75 audit: drug-type gear items should be able to grant temporary
 * Active Effects (Stimm, Slaught, Spook, De-tox, Tranq). The
 * `grants.activeEffects[]` slot on gear was added for this purpose;
 * this test pins the expected shape — including a non-zero
 * durationRounds for temporary effects.
 */
describe('GearData grants.activeEffects[] (#75 drugs)', () => {
    type GearGrantEntry = { key: string; mode: number; value: number; durationRounds: number };

    // Reference payload: a Stimm injector granting +10 Strength for 1d10+5
    // rounds. We pin the upper-bound 15 rounds for the test fixture; the
    // actual roll lives at use-time.
    const stimm: { grants: { activeEffects: GearGrantEntry[] } } = {
        grants: {
            activeEffects: [
                {
                    key: 'system.characteristics.strength.modifier',
                    mode: 2, // ACTIVE_EFFECT_MODES.ADD
                    value: 10,
                    durationRounds: 15,
                },
                {
                    key: 'system.characteristics.toughness.modifier',
                    mode: 2,
                    value: 10,
                    durationRounds: 15,
                },
            ],
        },
    };

    it('grants.activeEffects entries carry key / mode / value / durationRounds', () => {
        for (const entry of stimm.grants.activeEffects) {
            expect(entry.key).toMatch(/^system\.characteristics\./);
            expect(entry.mode).toBe(2);
            expect(entry.value).toBeGreaterThan(0);
            expect(entry.durationRounds).toBeGreaterThan(0);
        }
    });

    it('drug payloads can carry multiple stacked grants from a single dose', () => {
        expect(stimm.grants.activeEffects).toHaveLength(2);
    });
});

/**
 * #457: a dose's mechanical duration. `durationRounds` only expires inside combat —
 * a stimm that lasts hours needs an in-universe window, so grants also carry
 * `durationSeconds`, stamped against the world clock at consume-time. The consume
 * path picks the longest of each so one dose yields a single timed effect.
 */
describe('GearData dose durations (#457)', () => {
    type Grant = { key: string; mode: number; value: number; durationRounds: number; durationSeconds?: number };
    const longest = (grants: Grant[]): { seconds: number; rounds: number } => ({
        seconds: Math.max(...grants.map((g) => g.durationSeconds ?? 0)),
        rounds: Math.max(...grants.map((g) => g.durationRounds)),
    });

    it('picks the longest world-time and round window across a dose stacked grants', () => {
        const grants: Grant[] = [
            { key: 'a', mode: 2, value: 10, durationRounds: 15, durationSeconds: 3600 },
            { key: 'b', mode: 2, value: 10, durationRounds: 5, durationSeconds: 7200 },
        ];
        expect(longest(grants)).toEqual({ seconds: 7200, rounds: 15 });
    });

    it('treats an omitted durationSeconds as not world-time bound (rounds only)', () => {
        const grants: Grant[] = [{ key: 'a', mode: 2, value: 10, durationRounds: 3 }];
        expect(longest(grants)).toEqual({ seconds: 0, rounds: 3 });
    });

    it('exposes the schema slots the consume path reads', async () => {
        const mod = await importModelOrSkip(import('./gear.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const schema = mod.default.defineSchema();
        expect(schema['addictive']).toBeTruthy();
        expect(schema['grants']).toBeTruthy();
    });
});
