import { afterAll, describe, expect, it } from 'vitest';

/**
 * Tests for SystemDataModel's static utilities.
 *
 * The class extends `foundry.abstract.TypeDataModel` at module-eval, which happy-dom
 * does not provide, so the module is imported AFTER a minimal `foundry` stub (a
 * static import would hoist above it). The stub's `shimData` stands in for
 * Foundry's: it returns the source it was given, as the real one does once its
 * own shims have run. Previously each test skipped itself when the import failed,
 * so none of them ever ran.
 */

type AnyCtor = abstract new (...args: never[]) => object;
interface GlobalShim {
    foundry?: { abstract: { TypeDataModel: AnyCtor } } | undefined;
}

class TypeDataModelStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: stands in for Foundry's DataModel.shimData, whose source is untyped
    static shimData(data: Record<string, unknown>): Record<string, unknown> {
        return data;
    }
}

// eslint-disable-next-line no-restricted-syntax -- boundary: installing a test stub for the Foundry runtime global
const G = globalThis as GlobalShim;
const ORIGINAL_FOUNDRY = G.foundry;
G.foundry = { abstract: { TypeDataModel: TypeDataModelStub } };
afterAll(() => {
    G.foundry = ORIGINAL_FOUNDRY;
});

const { default: SystemDataModel } = await import('./system-data-model.ts');

/** A concrete model whose schema declares `fields`, as an item type's would. */
function modelWithFields(fields: readonly string[]): typeof SystemDataModel {
    const Model = class extends SystemDataModel {};
    Object.defineProperty(Model, 'schema', { value: { keys: () => [...fields] } });
    return Model;
}

describe('SystemDataModel', () => {
    it('has no system flags model by default', () => {
        expect(SystemDataModel.metadata.systemFlagsModel).toBeNull();
    });

    it('migrates and cleans an empty source without templates', () => {
        expect(() => SystemDataModel._migrateData({})).not.toThrow();
        expect(() => SystemDataModel._cleanData(undefined)).not.toThrow();
    });
});

/**
 * Live (#598): updating an item with `requiredTraining` (no schema initial, absent
 * from a source that never stored it) threw "Cannot add property requiredTraining,
 * object is not extensible", because Foundry seals the source after shimData.
 */
describe('SystemDataModel.declareSchemaKeys', () => {
    it('makes an absent optional field writable through the seal', () => {
        const source: { class: string; requiredTraining?: string } = { class: 'pistol' };
        SystemDataModel.declareSchemaKeys(source, ['class', 'requiredTraining']);
        Object.seal(source);
        expect(() => {
            source.requiredTraining = 'Las';
        }).not.toThrow();
        expect(source).toEqual({ class: 'pistol', requiredTraining: 'Las' });
    });

    it('leaves stored values and an already-sealed source alone', () => {
        const stored = { requiredTraining: 'Bolt' };
        SystemDataModel.declareSchemaKeys(stored, ['requiredTraining']);
        expect(stored).toEqual({ requiredTraining: 'Bolt' });
        const sealed = Object.seal({ class: 'pistol' });
        expect(() => SystemDataModel.declareSchemaKeys(sealed, ['effect'])).not.toThrow();
        expect('effect' in sealed).toBe(false);
    });
});

describe('SystemDataModel.shimData', () => {
    it('declares every schema field on the source before Foundry seals it (#598)', () => {
        const Model = modelWithFields(['class', 'requiredTraining', 'effect']);
        const source: { class: string; requiredTraining?: string; effect?: string } = { class: 'pistol' };
        const shimmed = Model.shimData(source);
        expect(shimmed).toBe(source);
        expect(Object.keys(source).sort()).toEqual(['class', 'effect', 'requiredTraining']);
        expect(source.class).toBe('pistol');
        // What Foundry does next: seal, then a later update writes the optional field.
        Object.seal(source);
        source.requiredTraining = 'Flame';
        source.effect = 'Snare';
        expect(source).toEqual({ class: 'pistol', requiredTraining: 'Flame', effect: 'Snare' });
    });

    it('does not add fields the schema does not declare', () => {
        const Model = modelWithFields(['class']);
        const source = { class: 'basic' };
        Model.shimData(source);
        expect(source).toEqual({ class: 'basic' });
    });
});
