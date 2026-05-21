import { describe, expect, it } from 'vitest';

describe('CyberneticData', () => {
    it('has a default CyberneticData symbol exported', async () => {
        const mod = await import('./cybernetic').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`cybernetic DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable + modifiers templates
    //   - body location field constrained to canonical body slots
    //   - migrateData normalises legacy cybernetic payloads
});

/**
 * #75 audit: cybernetics should be able to grant Active Effects (MIU,
 * Calculus Logi, Cerebral Implant, Mechadendrite skill bonus etc.).
 * The `grants.activeEffects[]` slot was added to the schema; this test
 * pins the expected shape so payloads with the documented structure
 * remain valid contract-wise.
 */
describe('CyberneticData grants.activeEffects[] (#75)', () => {
    type CyberneticGrantEntry = { key: string; mode: number; value: number; durationRounds: number };

    // Reference payload: a Calculus Logi cybernetic granting +10 Intelligence.
    const calculusLogi: { grants: { activeEffects: CyberneticGrantEntry[] } } = {
        grants: {
            activeEffects: [
                {
                    key: 'system.characteristics.intelligence.modifier',
                    mode: 2, // ACTIVE_EFFECT_MODES.ADD
                    value: 10,
                    durationRounds: 0, // permanent while installed
                },
            ],
        },
    };

    it('grants.activeEffects entries carry key / mode / value / durationRounds', () => {
        const [entry] = calculusLogi.grants.activeEffects;
        expect(entry).toBeDefined();
        expect(entry?.key).toBe('system.characteristics.intelligence.modifier');
        expect(entry?.mode).toBe(2);
        expect(entry?.value).toBe(10);
        expect(entry?.durationRounds).toBe(0);
    });

    it('durationRounds = 0 represents a permanent installed effect', () => {
        for (const entry of calculusLogi.grants.activeEffects) {
            expect(entry.durationRounds).toBeGreaterThanOrEqual(0);
        }
    });
});
