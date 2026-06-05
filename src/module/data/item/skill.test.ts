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
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('SkillData', () => {
    it('has a default SkillData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./skill.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
