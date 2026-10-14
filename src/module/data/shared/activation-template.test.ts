import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

/**
 * `activationLabelKey` (#194): the activation-type label resolves to a real
 * `WH40K.ActionType.*` langpack key for every schema choice. It used to build
 * `WH40K.Activation.Half-action`, a key that never existed, so the Navigator
 * powers, rituals and psychic powers rows printed the raw key.
 */

vi.mock('../abstract/system-data-model.ts', () => ({ default: class {} }));

const { activationLabelKey } = await import('./activation-template.ts');

const ACTIVATION_TYPES = ['action', 'half-action', 'full-action', 'extended-action', 'reaction', 'free-action', 'passive', 'special'];

interface LangPack {
    WH40K: { ActionType: Record<string, string> };
}

const lang = JSON.parse(readFileSync(resolve(__dirname, '../../../lang/en.json'), 'utf8')) as LangPack;

describe('activationLabelKey', () => {
    it('maps kebab-case activation types to PascalCase ActionType keys', () => {
        expect(activationLabelKey('half-action')).toBe('WH40K.ActionType.HalfAction');
        expect(activationLabelKey('action')).toBe('WH40K.ActionType.Action');
    });

    it('names a langpack entry for every activation type the schema allows', () => {
        const missing = ACTIVATION_TYPES.filter((type) => !(activationLabelKey(type).replace('WH40K.ActionType.', '') in lang.WH40K.ActionType));
        expect(missing).toEqual([]);
    });
});
