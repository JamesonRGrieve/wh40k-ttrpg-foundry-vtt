/**
 * Unit tests for the shared simple-effect-item schema factory.
 *
 * `simpleEffectItemSchema` defers all `foundry.data.fields` access until
 * called, so the module imports cleanly without a Foundry runtime. We can
 * therefore drive it directly here with a minimal `foundry.data.fields` stub
 * that records which field constructors fire and the keys they are assigned
 * to. The real Foundry field behaviour is exercised by the Tier B e2e suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The field-options shape `simpleEffectItemSchema` passes to each Foundry data field. */
interface FieldOptions {
    required: boolean;
    blank: boolean;
}

/** Records each constructed field so we can assert key/type wiring. */
class StubField {
    constructor(public readonly options: FieldOptions) {}
}
class HTMLFieldStub extends StubField {}
class StringFieldStub extends StubField {}

describe('simpleEffectItemSchema', () => {
    beforeEach(() => {
        vi.stubGlobal('foundry', {
            data: {
                fields: {
                    HTMLField: HTMLFieldStub,
                    StringField: StringFieldStub,
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('keys the HTML field under the requested field name', async () => {
        const { simpleEffectItemSchema } = await import('./simple-effect-item.ts');
        const schema = simpleEffectItemSchema('effect');
        expect(Object.keys(schema)).toEqual(['identifier', 'effect', 'notes']);
        expect(schema['effect']).toBeInstanceOf(HTMLFieldStub);
    });

    it('keys the HTML field under a different requested name', async () => {
        const { simpleEffectItemSchema } = await import('./simple-effect-item.ts');
        const schema = simpleEffectItemSchema('benefit');
        expect(Object.keys(schema)).toEqual(['identifier', 'benefit', 'notes']);
        expect(schema['benefit']).toBeInstanceOf(HTMLFieldStub);
    });

    it('produces an identical (bar the named field) shape for both field names', async () => {
        const { simpleEffectItemSchema } = await import('./simple-effect-item.ts');
        const effect = simpleEffectItemSchema('effect');
        const benefit = simpleEffectItemSchema('benefit');

        // identifier + notes are structurally the same regardless of the name.
        expect(effect['identifier']).toBeTruthy();
        expect(benefit['identifier']).toBeTruthy();
        expect(effect['notes']).toBeInstanceOf(StringFieldStub);
        expect(benefit['notes']).toBeInstanceOf(StringFieldStub);

        // The HTML field carries the same options regardless of its key.
        const effField = effect['effect'] as HTMLFieldStub;
        const benField = benefit['benefit'] as HTMLFieldStub;
        expect(effField.options).toEqual(benField.options);
        expect(effField.options).toEqual({ required: true, blank: true });
    });

    it('marks the notes field optional and blank-allowed', async () => {
        const { simpleEffectItemSchema } = await import('./simple-effect-item.ts');
        const schema = simpleEffectItemSchema('effect');
        const notes = schema['notes'] as StringFieldStub;
        expect(notes.options).toEqual({ required: false, blank: true });
    });
});
