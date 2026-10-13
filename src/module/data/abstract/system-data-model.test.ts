import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Tests for SystemDataModel static utilities.
 * The class extends foundry.abstract.TypeDataModel so it cannot be
 * instantiated in happy-dom; we test every static method that operates
 * on plain objects and is Foundry-runtime-independent.
 */
describe('SystemDataModel', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static metadata has systemFlagsModel null by default', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        expect(SystemDataModel.metadata.systemFlagsModel).toBeNull();
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        const source = {};
        expect(() => SystemDataModel._migrateData(source)).not.toThrow();
    });

    it('_cleanData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        expect(() => SystemDataModel._cleanData(undefined)).not.toThrow();
    });
});

/**
 * Live: updating an item with `requiredTraining` (no schema initial, absent from
 * a source that never stored it) threw "Cannot add property requiredTraining,
 * object is not extensible", because Foundry seals the source after shimData.
 */
describe('SystemDataModel.declareSchemaKeys', () => {
    it('makes an absent optional field writable through the seal', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const source: { class: string; requiredTraining?: string } = { class: 'pistol' };
        mod.default.declareSchemaKeys(source, ['class', 'requiredTraining']);
        Object.seal(source);
        expect(() => {
            source.requiredTraining = 'Las';
        }).not.toThrow();
        expect(source).toEqual({ class: 'pistol', requiredTraining: 'Las' });
    });

    it('leaves stored values and an already-sealed source alone', async () => {
        const mod = await importModelOrSkip(import('./system-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const stored = { requiredTraining: 'Bolt' };
        mod.default.declareSchemaKeys(stored, ['requiredTraining']);
        expect(stored).toEqual({ requiredTraining: 'Bolt' });
        const sealed = Object.seal({ class: 'pistol' });
        expect(() => mod.default.declareSchemaKeys(sealed, ['effect'])).not.toThrow();
        expect('effect' in sealed).toBe(false);
    });
});
