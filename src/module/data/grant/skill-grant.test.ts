import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('SkillGrantData', () => {
    it('has a default SkillGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./skill-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares skill key + advance + specialization fields
    //   - apply() updates the target's skill advance
    //   - migrateData() splits legacy specialised skill identifiers
});
