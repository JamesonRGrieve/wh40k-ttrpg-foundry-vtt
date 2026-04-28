/**
 * Smoke tests for the extracted stat-adjustment action handlers.
 *
 * These previously lived as #-prefixed static methods on CharacterSheet, duplicating
 * throttle / value-update boilerplate per stat. The tests stub the host-sheet shape
 * (`StatAdjustmentHost`) and verify each handler dispatches the right schema-field
 * write, applies clamping, and respects the toggle-pip semantics (clicking pip N
 * when value is N decrements to N-1).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;
const ORIGINAL_FOUNDRY = (globalThis as Record<string, unknown>).foundry;

beforeAll(() => {
    (globalThis as Record<string, unknown>).game = {
        i18n: { localize: (k: string) => k, format: (k: string) => k },
        user: { isGM: true },
    };
    (globalThis as Record<string, unknown>).foundry = {
        utils: {
            getProperty: (obj: Record<string, unknown>, path: string) => {
                return path.split('.').reduce<unknown>((acc, key) => {
                    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
                        return (acc as Record<string, unknown>)[key];
                    }
                    return undefined;
                }, obj);
            },
        },
    };
});

afterAll(() => {
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
    (globalThis as Record<string, unknown>).foundry = ORIGINAL_FOUNDRY;
});

import * as StatActions from '../src/module/applications/api/stat-adjustment-actions.ts';
import type { StatAdjustmentHost } from '../src/module/applications/api/stat-adjustment-actions.ts';

function makeHost(systemOverrides: Record<string, unknown> = {}): StatAdjustmentHost & { _updates: Record<string, unknown>[]; _notifies: Array<[string, string]> } {
    const host = {
        _updates: [] as Record<string, unknown>[],
        _notifies: [] as Array<[string, string]>,
        actor: {
            id: 'a1',
            name: 'Acolyte',
            system: {
                wounds: { value: 8, max: 12, critical: 0 },
                fatigue: { value: 0, max: 4 },
                fate: { value: 2, max: 4 },
                corruption: 12,
                insanity: 5,
                ...systemOverrides,
            },
            update: async (data: Record<string, unknown>) => {
                host._updates.push(data);
            },
        },
        async _throttle(_key: string, _wait: number, fn: (...args: unknown[]) => unknown, ctx: unknown, args: unknown[]): Promise<unknown> {
            return await (fn as (...a: unknown[]) => unknown).apply(ctx, args);
        },
        _notify(type: 'info' | 'warning' | 'error', message: string) {
            host._notifies.push([type, message]);
        },
        async _updateSystemField(field: string, value: unknown) {
            host._updates.push({ [field]: value });
        },
    };
    return host as unknown as StatAdjustmentHost & { _updates: Record<string, unknown>[]; _notifies: Array<[string, string]> };
}

function btn(dataset: Record<string, string>): HTMLElement {
    const el = document.createElement('button');
    Object.entries(dataset).forEach(([k, v]) => (el.dataset[k] = v));
    return el;
}

const ev = () => ({ stopPropagation: vi.fn() }) as unknown as Event;

describe('increment / decrement / adjustStat', () => {
    let host: ReturnType<typeof makeHost>;
    beforeEach(() => {
        host = makeHost();
    });

    it('increment bumps a value by 1', async () => {
        await StatActions.increment.call(host, ev(), btn({ field: 'system.wounds.value' }));
        expect(host._updates).toEqual([{ 'system.wounds.value': 9 }]);
    });

    it('increment clamps to data-max when exceeded', async () => {
        host.actor.system.wounds = { value: 12, max: 12, critical: 0 };
        await StatActions.increment.call(host, ev(), btn({ field: 'system.wounds.value', max: '12' }));
        expect(host._updates).toEqual([]);
    });

    it('decrement clamps to data-min', async () => {
        host.actor.system.wounds = { value: 0, max: 12, critical: 0 };
        await StatActions.decrement.call(host, ev(), btn({ field: 'system.wounds.value', min: '0' }));
        expect(host._updates).toEqual([]);
    });

    it('adjustStat with data-delta applies the delta', async () => {
        await StatActions.adjustStat.call(host, ev(), btn({ field: 'system.corruption', delta: '5', max: '100' }));
        expect(host._updates).toEqual([{ 'system.corruption': 17 }]);
    });

    it('adjustStat clear-fatigue special action zeros fatigue.value', async () => {
        host.actor.system.fatigue = { value: 3, max: 4 };
        await StatActions.adjustStat.call(host, ev(), btn({ field: 'system.fatigue.value', statAction: 'clear-fatigue' }));
        expect(host._updates).toEqual([{ 'system.fatigue.value': 0 }]);
    });

    it('increment auto-derives max from sibling .max field when data-max is omitted', async () => {
        host.actor.system.wounds = { value: 12, max: 12, critical: 0 };
        await StatActions.increment.call(host, ev(), btn({ field: 'system.wounds.value' }));
        // value already at max=12, sibling auto-derived → no update
        expect(host._updates).toEqual([]);
    });
});

describe('pip toggles', () => {
    it('setCriticalPip toggles down to N-1 when clicking the current value', async () => {
        const host = makeHost({ wounds: { value: 8, max: 12, critical: 5 } });
        await StatActions.setCriticalPip.call(host, ev(), btn({ critLevel: '5' }));
        expect(host._updates).toEqual([{ 'system.wounds.critical': 4 }]);
    });

    it('setCriticalPip sets to N when clicking a different pip', async () => {
        const host = makeHost({ wounds: { value: 8, max: 12, critical: 5 } });
        await StatActions.setCriticalPip.call(host, ev(), btn({ critLevel: '7' }));
        expect(host._updates).toEqual([{ 'system.wounds.critical': 7 }]);
    });

    it('setFateStar clamps to fate.max', async () => {
        const host = makeHost();
        host.actor.system.fate = { value: 2, max: 4 };
        await StatActions.setFateStar.call(host, ev(), btn({ fateIndex: '99' }));
        expect(host._updates).toEqual([{ 'system.fate.value': 4 }]);
    });

    it('setFatigueBolt clamps to fatigue.max', async () => {
        const host = makeHost();
        host.actor.system.fatigue = { value: 0, max: 4 };
        await StatActions.setFatigueBolt.call(host, ev(), btn({ fatigueIndex: '99' }));
        expect(host._updates).toEqual([{ 'system.fatigue.value': 4 }]);
    });
});

describe('direct value setters', () => {
    it('setCorruption rejects out-of-range values via _notify', async () => {
        const host = makeHost();
        await StatActions.setCorruption.call(host, ev(), btn({ value: '150' }));
        expect(host._updates).toEqual([]);
        expect(host._notifies[0][0]).toBe('error');
    });

    it('setCorruption accepts in-range values', async () => {
        const host = makeHost();
        await StatActions.setCorruption.call(host, ev(), btn({ value: '50' }));
        expect(host._updates).toEqual([{ 'system.corruption': 50 }]);
    });

    it('setInsanity rejects negative values', async () => {
        const host = makeHost();
        await StatActions.setInsanity.call(host, ev(), btn({ value: '-1' }));
        expect(host._updates).toEqual([]);
        expect(host._notifies[0][0]).toBe('error');
    });
});

describe('restoreFate', () => {
    it('sets fate.value to fate.max and notifies', async () => {
        const host = makeHost();
        host.actor.system.fate = { value: 1, max: 4 };
        await StatActions.restoreFate.call(host, ev(), btn({}));
        expect(host._updates).toEqual([{ 'system.fate.value': 4 }]);
        expect(host._notifies[0][0]).toBe('info');
    });
});
