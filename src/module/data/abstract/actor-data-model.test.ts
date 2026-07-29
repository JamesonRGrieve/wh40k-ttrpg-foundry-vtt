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

    // Content used `system.variantOf` on actors long before the schema had a slot
    // for it, so SchemaField.clean silently dropped it on every affected document
    // (PROBLEMS.md P76). These lock the slot open for every actor type.
    it('declares variantOf so named individuals can link to their class', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const schema = mod.default.defineSchema();
        expect(schema['variantOf']).toBeDefined();
    });

    it('variantOf defaults to the empty string, marking an actor as its own base', async () => {
        const mod = await importModelOrSkip(import('./actor-data-model.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        const field = mod.default.defineSchema()['variantOf'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has the flag off so ESLint reads the index access as non-nullish, while the main tsconfig has it on and tsc requires the guard
        expect(field?.initial).toBe('');
    });
});
