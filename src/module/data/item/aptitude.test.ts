import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('AptitudeData', () => {
    it('has a default AptitudeData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./aptitude.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - aptitude name validation matches the FFG canonical list
    //   - migrateData normalises legacy aptitude payloads
});
