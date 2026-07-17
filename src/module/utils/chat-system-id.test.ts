import { describe, expect, it } from 'vitest';
import { firstSystemId } from './chat-system-id.ts';

describe('firstSystemId (#422 chat theming)', () => {
    it('returns the first handle carrying a game system', () => {
        expect(firstSystemId({ system: { gameSystem: 'dw' } })).toBe('dw');
        expect(firstSystemId(null, undefined, { system: { gameSystem: 'ow' } })).toBe('ow');
    });

    it('prefers the most-specific handle (earlier arg wins)', () => {
        expect(firstSystemId({ system: { gameSystem: 'dh2' } }, { system: { gameSystem: 'rt' } })).toBe('dh2');
    });

    it('skips handles with no resolvable system', () => {
        expect(firstSystemId({ system: null }, { system: {} }, { system: { gameSystem: 'im' } })).toBe('im');
    });

    it('returns undefined when nothing carries a system (keeps base colour)', () => {
        expect(firstSystemId()).toBeUndefined();
        expect(firstSystemId(null, undefined, { system: {} })).toBeUndefined();
    });
});
