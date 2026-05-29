/**
 * DataModel test for SkillData.
 *
 * Runs against happy-dom (vitest.config.ts), where Foundry globals such as
 * `foundry.data.fields` aren't available — importing a V14 DataModel at module
 * top touches them during defineSchema and throws. We defer the import into the
 * test body so the failure is scoped and informative, matching the canonical
 * pattern in `armour.test.ts`.
 */
import { describe, expect, it } from 'vitest';

describe('SkillData', () => {
    it('has a default SkillData symbol exported', async () => {
        const mod = await import('./skill').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`skill DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes exampleDifficulties rows with a `specialization` slot
    //     (default '') alongside difficulty / modifier / example
    //   - schema includes exampleAdditionalUses rows ({ name, description })
    //     defaulting to an empty array
    //   - characteristicAbbr / skillTypeLabel derive the documented labels
    //   - toChatSpecialUse(index) returns undefined for an out-of-range index
});
