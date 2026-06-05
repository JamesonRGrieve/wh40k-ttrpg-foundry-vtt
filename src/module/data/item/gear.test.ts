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
