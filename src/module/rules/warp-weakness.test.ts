import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import { buildWarpWeaknessField, isWarpWeak, WARP_WEAKNESS_FLAG, WARP_WEAKNESS_INPUT_NAME, type WarpWeaknessScene } from './warp-weakness.ts';

/**
 * Scene stub returning `value` for the system's warp-weakness flag only.
 * Typed against the module's own read-surface rather than re-declaring the
 * Foundry signature, so the `unknown` stays behind the one boundary that owns it.
 */
function sceneWithFlag(value: WarpWeaknessFlagValue): WarpWeaknessScene {
    return {
        getFlag: (scope: string, key: string) => (scope === SYSTEM_ID && key === WARP_WEAKNESS_FLAG ? value : undefined),
    };
}

/** The value shapes a scene flag can realistically hold across migrations/hand edits. */
type WarpWeaknessFlagValue = boolean | string | number | null | undefined;

describe('isWarpWeak', () => {
    it('is true only for an explicit boolean true', () => {
        expect(isWarpWeak(sceneWithFlag(true))).toBe(true);
    });

    it.each([[false], [undefined], [null], ['true'], [1], [0], ['']])('rejects the non-true flag value %p', (value) => {
        // A hand-written or migrated flag can hold a truthy string; reading it as
        // enabled would silently turn on the riders for every roll in the scene.
        expect(isWarpWeak(sceneWithFlag(value))).toBe(false);
    });

    it('treats an absent scene as not Warp-weak', () => {
        // Rolls can resolve before the canvas exists (early boot, headless runs).
        expect(isWarpWeak(null)).toBe(false);
        expect(isWarpWeak(undefined)).toBe(false);
    });
});

describe('buildWarpWeaknessField', () => {
    it('names the checkbox so Foundry writes it straight onto the scene flag', () => {
        // Foundry's SceneConfig submits `flags.<scope>.<key>` inputs onto the
        // document. The name IS the wiring — there is no submit handler, so a
        // rename here silently stops the toggle persisting.
        const field = buildWarpWeaknessField(document, { label: 'Warp Weakness', hint: 'hint text' }, false);
        const input = field.querySelector<HTMLInputElement>('input[type="checkbox"]');

        expect(input).not.toBeNull();
        expect(input?.name).toBe(WARP_WEAKNESS_INPUT_NAME);
        expect(WARP_WEAKNESS_INPUT_NAME).toBe(`flags.${SYSTEM_ID}.${WARP_WEAKNESS_FLAG}`);
    });

    it('reflects the current flag state', () => {
        expect(buildWarpWeaknessField(document, { label: 'l', hint: 'h' }, true).querySelector<HTMLInputElement>('input')?.checked).toBe(true);
        expect(buildWarpWeaknessField(document, { label: 'l', hint: 'h' }, false).querySelector<HTMLInputElement>('input')?.checked).toBe(false);
    });

    it('sets label and hint as text, never as markup', () => {
        // Labels come from the langpack; building them into an innerHTML string
        // would make a translation an injection sink.
        const field = buildWarpWeaknessField(document, { label: '<b>Label</b>', hint: '<i>Hint</i>' }, false);

        expect(field.querySelector('label')?.textContent).toBe('<b>Label</b>');
        expect(field.querySelector('b')).toBeNull();
        expect(field.querySelector('.hint')?.textContent).toBe('<i>Hint</i>');
        expect(field.querySelector('i')).toBeNull();
    });
});
