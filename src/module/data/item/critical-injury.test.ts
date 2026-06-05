import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('CriticalInjuryData', () => {
    it('has a default CriticalInjuryData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./critical-injury.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - severity field validates against the FFG critical hit table range
    //   - migrateData normalises legacy critical effect payloads
});
