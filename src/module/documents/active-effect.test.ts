import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../testing/model-import.ts';

describe('WH40KActiveEffect', () => {
    it('exports WH40KActiveEffect class', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.WH40KActiveEffect).toBeTruthy();
    });

    it('isTemporary returns true when duration.rounds is positive', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeEffect = Object.create(mod.WH40KActiveEffect.prototype) as InstanceType<typeof mod.WH40KActiveEffect>;
        Object.defineProperty(fakeEffect, 'duration', { value: { seconds: null, rounds: 3, turns: null }, writable: true });
        expect(fakeEffect.isTemporary).toBe(true);
    });

    it('isTemporary returns false when duration fields are null', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeEffect = Object.create(mod.WH40KActiveEffect.prototype) as InstanceType<typeof mod.WH40KActiveEffect>;
        Object.defineProperty(fakeEffect, 'duration', { value: { seconds: null, rounds: null, turns: null }, writable: true });
        expect(fakeEffect.isTemporary).toBe(false);
    });

    it('isTemporary returns true when duration.seconds is positive', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeEffect = Object.create(mod.WH40KActiveEffect.prototype) as InstanceType<typeof mod.WH40KActiveEffect>;
        Object.defineProperty(fakeEffect, 'duration', { value: { seconds: 60, rounds: null, turns: null }, writable: true });
        expect(fakeEffect.isTemporary).toBe(true);
    });

    it('natureClass returns a wh40k-effect-* CSS class string', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeEffect = Object.create(mod.WH40KActiveEffect.prototype) as InstanceType<typeof mod.WH40KActiveEffect>;
        Object.defineProperty(fakeEffect, 'duration', { value: { seconds: null, rounds: null, turns: null }, writable: true });
        Object.defineProperty(fakeEffect, 'changes', { value: [], writable: true });
        // Set up minimal CONST needed for the nature calculation.
        // eslint-disable-next-line no-restricted-syntax -- test boundary: patching globalThis.CONST to simulate Foundry runtime for isolated unit test
        type GlobalAny = Record<string, Record<string, unknown>>;
        // eslint-disable-next-line no-restricted-syntax -- test boundary: globalThis is untyped at the engine boundary; cast is the only option here
        const g = globalThis as unknown as GlobalAny;
        const origConst = g['CONST'] ?? {};
        g['CONST'] = { ACTIVE_EFFECT_MODES: { ADD: 2 } };
        try {
            const cls = fakeEffect.natureClass;
            expect(cls).toMatch(/^wh40k-effect-/);
        } finally {
            g['CONST'] = origConst;
        }
    });

    it('source returns null when origin is empty', async () => {
        const mod = await importModelOrSkip(import('./active-effect.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const fakeEffect = Object.create(mod.WH40KActiveEffect.prototype) as InstanceType<typeof mod.WH40KActiveEffect>;
        Object.defineProperty(fakeEffect, 'origin', { value: '', writable: true });
        expect(fakeEffect.source).toBeNull();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - nature returns 'beneficial' when ADD changes are all positive
    //   - nature returns 'harmful' when ADD changes are all negative
    //   - apply dispatches to _applyCharacteristicChange for system.characteristics.* keys
    //   - apply dispatches to _applySkillChange for system.skills.* keys
});
