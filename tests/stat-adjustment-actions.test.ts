/**
 * Smoke tests for the extracted stat-adjustment action handlers.
 *
 * These previously lived as #-prefixed static methods on CharacterSheet, duplicating
 * throttle / value-update boilerplate per stat. The tests stub the host-sheet shape
 * (`StatAdjustmentHost`) and verify each handler dispatches the right schema-field
 * write, applies clamping, and respects the toggle-pip semantics (clicking pip N
 * when value is N decrements to N-1).
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatAdjustmentHost } from '../src/module/applications/api/stat-adjustment-actions.ts';

interface I18nStub {
    localize: (k: string) => string;
    format: (k: string) => string;
}
interface UserStub {
    isGM: boolean;
}
interface GameStub {
    i18n: I18nStub;
    user: UserStub;
}
interface FoundryApiStub {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS requires `any[]` rest for mixin-compatible constructor signatures (TS2545); matches Foundry's ApplicationV2.
    ApplicationV2: new (...args: any[]) => object;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS requires `any[]` rest for the HandlebarsApplicationMixin generic constraint (TS2545).
    HandlebarsApplicationMixin: <T extends new (...args: any[]) => object>(Base: T) => T;
}
interface FoundryUtilsStub {
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty returns `unknown` per the framework contract (deep property access).
    getProperty: (obj: Record<string, unknown>, path: string) => unknown;
}
interface FoundryStub {
    applications: { api: FoundryApiStub };
    utils: FoundryUtilsStub;
}

interface GlobalShim {
    game?: GameStub | undefined;
    foundry?: FoundryStub | undefined;
}
const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;
const ORIGINAL_FOUNDRY = G.foundry;

class FakeApplicationV2 {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS requires `any[]` for mixin class constructors (TS error TS2545); `unknown[]` is rejected.
const fakeHandlebarsApplicationMixin = <T extends new (...args: any[]) => object>(Base: T): T => class extends Base {};

G.game = {
    i18n: { localize: (k: string) => k, format: (k: string) => k },
    user: { isGM: true },
};
G.foundry = {
    applications: {
        api: {
            ApplicationV2: FakeApplicationV2,
            HandlebarsApplicationMixin: fakeHandlebarsApplicationMixin,
        },
    },
    utils: {
        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.getProperty takes/returns `unknown` per the framework's deep-property-access contract.
        getProperty: (obj: Record<string, unknown>, path: string): unknown => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: reduce accumulator mirrors getProperty's `unknown` return.
            return path.split('.').reduce<unknown>((acc, key) => {
                if (acc !== null && typeof acc === 'object' && key in acc) {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: walking the framework-shaped property tree; each step yields `unknown`.
                    return (acc as Record<string, unknown>)[key];
                }
                return undefined;
            }, obj);
        },
    },
};

afterAll(() => {
    G.game = ORIGINAL_GAME;
    G.foundry = ORIGINAL_FOUNDRY;
});

const StatActions = await import('../src/module/applications/api/stat-adjustment-actions.ts');

// HostUpdate mirrors the StatAdjustmentHost actor.update(data: Record<string, unknown>)
// payload shape — the Foundry Document.update boundary.
interface HostUpdate {
    // eslint-disable-next-line no-restricted-syntax -- boundary: matches the actor.update payload (Foundry Document.update accepts `Record<string, unknown>`).
    [field: string]: unknown;
}
type HostSystem = StatAdjustmentHost['actor']['system'];

function makeHost(systemOverrides: Partial<HostSystem> = {}): StatAdjustmentHost & {
    _updates: HostUpdate[];
    _notifies: Array<[string, string]>;
} {
    const host = {
        _updates: [] as HostUpdate[],
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
            // eslint-disable-next-line no-restricted-syntax -- boundary: matches StatAdjustmentHost.actor.update — Foundry Document.update returns Promise<unknown>.
            async update(data: Record<string, unknown>): Promise<unknown> {
                host._updates.push(data);
                return Promise.resolve(undefined);
            },
        },
        // eslint-disable-next-line no-restricted-syntax -- boundary: matches StatAdjustmentHost._throttle's framework pass-through signature `(fn: (...args: unknown[]) => unknown, ctx: unknown, args: unknown[]) => Promise<unknown>`.
        async _throttle(_key: string, _wait: number, fn: (...args: unknown[]) => unknown, ctx: unknown, args: unknown[]): Promise<unknown> {
            return Promise.resolve(fn.apply(ctx, args));
        },
        _notify(type: 'info' | 'warning' | 'error', message: string): void {
            host._notifies.push([type, message]);
        },
        // eslint-disable-next-line no-restricted-syntax -- boundary: matches StatAdjustmentHost._updateSystemField(field: string, value: unknown) — value flows into actor.update().
        async _updateSystemField(field: string, value: unknown): Promise<void> {
            host._updates.push({ [field]: value });
            return Promise.resolve();
        },
    };
    return host;
}

function btn(dataset: Record<string, string>): HTMLElement {
    const el = document.createElement('button');
    Object.entries(dataset).forEach(([k, v]) => (el.dataset[k] = v));
    return el;
}

const ev = (): Event => {
    const e = new Event('click');
    vi.spyOn(e, 'stopPropagation');
    return e;
};

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
