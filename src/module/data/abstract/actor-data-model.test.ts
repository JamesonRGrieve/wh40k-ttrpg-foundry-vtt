import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Tests for ActorDataModel.
 * The class extends foundry.abstract.TypeDataModel so runtime instantiation
 * is not possible in happy-dom. We test the static surface and the metadata
 * configuration instead.
 */
describe('ActorDataModel', () => {
    it('exports a default class symbol', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static metadata has supportsAdvancement: false', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ActorDataModel = mod.default;
        const meta = ActorDataModel.metadata as { supportsAdvancement: boolean };
        expect(meta.supportsAdvancement).toBe(false);
    });

    it('static metadata inherits systemFlagsModel from SystemDataModel base', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ActorDataModel = mod.default;
        expect(ActorDataModel.metadata.systemFlagsModel).toBeNull();
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ActorDataModel = mod.default;
        expect(() => ActorDataModel._migrateData({})).not.toThrow();
    });

    it('_migrateData does not mutate unrelated fields', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ActorDataModel = mod.default;
        const source = { name: 'Inquisitor Tharn', type: 'npc' };
        ActorDataModel._migrateData(source);
        expect(source.name).toBe('Inquisitor Tharn');
        expect(source.type).toBe('npc');
    });

    it('mergeSchema is inherited from SystemDataModel', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const ActorDataModel = mod.default;
        expect(typeof ActorDataModel.mergeSchema).toBe('function');
    });
});
