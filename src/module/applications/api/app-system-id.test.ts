import { describe, expect, it } from 'vitest';
import { resolveAppSystemId } from './app-system-id.ts';

/**
 * `resolveAppSystemId` is the SSOT resolver that lets `{{themeClassFor}}` (and the
 * `data-wh40k-system` ancestor) theme dialogs/prompts per system when they render
 * outside a sheet root (#422). The priority order matters: a roll prompt's rolling
 * actor (`rollData.sourceActor`) wins over a document handle, and a system-agnostic
 * dialog must resolve to `undefined` so it keeps its base colour rather than pinning
 * to a wrong line.
 */
describe('resolveAppSystemId (#422 dialog theming)', () => {
    it('reads the rolling actor first (rollData.sourceActor)', () => {
        expect(
            resolveAppSystemId({
                rollData: { sourceActor: { system: { gameSystem: 'dw' } } },
                document: { system: { gameSystem: 'dh2' } },
            }),
        ).toBe('dw');
    });

    it('falls back to rollData.actor, then document, then actor, then object', () => {
        expect(resolveAppSystemId({ rollData: { actor: { system: { gameSystem: 'ow' } } } })).toBe('ow');
        expect(resolveAppSystemId({ document: { system: { gameSystem: 'bc' } } })).toBe('bc');
        expect(resolveAppSystemId({ actor: { system: { gameSystem: 'rt' } } })).toBe('rt');
        expect(resolveAppSystemId({ object: { system: { gameSystem: 'im' } } })).toBe('im');
    });

    it('returns undefined for a system-agnostic app (keeps base colour)', () => {
        expect(resolveAppSystemId({})).toBeUndefined();
        expect(resolveAppSystemId({ rollData: null, document: null })).toBeUndefined();
        expect(resolveAppSystemId({ actor: { system: {} } })).toBeUndefined();
    });
});
