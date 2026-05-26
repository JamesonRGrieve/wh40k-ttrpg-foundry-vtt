import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WH40KBaseActor as WH40KActor } from '../documents/base-actor.ts';
import { GrantsProcessor, type GrantResult } from './grants-processor';

/* eslint-disable no-restricted-syntax -- test boundary: a structural mock of the Foundry actor surface applyGrants() touches (update/system/flags), narrowed to the fields under test */
/** Write a dot-path value into a nested record, creating intermediate objects. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    const last = parts.pop();
    if (last === undefined) return;
    let node: Record<string, unknown> = target;
    for (const key of parts) {
        const next = node[key];
        if (typeof next !== 'object' || next === null) node[key] = {};
        node = node[key] as Record<string, unknown>;
    }
    node[last] = value;
}

/**
 * Minimal in-memory actor whose `update()` mutates its own `system`/`flags`
 * exactly like Foundry's path-keyed update, so we can assert idempotency by
 * comparing actor state after one apply vs. two.
 */
function makeMockActor(): WH40KActor & { readState: () => { wp: number; wounds: number; fate: number } } {
    const root: Record<string, unknown> = {
        system: {
            characteristics: { willpower: { advance: 0 } },
            wounds: { value: 0, max: 0 },
            fate: { value: 0, max: 0, threshold: 0 },
            corruption: { value: 0 },
            insanity: { value: 0 },
        },
        flags: {},
    };
    const actor = {
        get system() {
            return root['system'];
        },
        get flags() {
            return root['flags'];
        },
        items: { some: () => false, filter: () => [], get: () => undefined },
        update: vi.fn(async (payload: Record<string, unknown>) => {
            for (const [path, value] of Object.entries(payload)) setPath(root, path, value);
            return Promise.resolve();
        }),
        createEmbeddedDocuments: vi.fn(async () => Promise.resolve([])),
        readState() {
            const sys = root['system'] as {
                characteristics: { willpower: { advance: number } };
                wounds: { max: number };
                fate: { total?: number; max: number };
            };
            return { wp: sys.characteristics.willpower.advance, wounds: sys.wounds.max, fate: sys.fate.max };
        },
    };
    return actor as unknown as WH40KActor & { readState: () => { wp: number; wounds: number; fate: number } };
}
/* eslint-enable no-restricted-syntax */

function makeResult(overrides: Partial<GrantResult> = {}): GrantResult {
    return {
        characteristics: {},
        itemsToCreate: [],
        skillUpdates: {},
        woundsBonus: 0,
        fateBonus: 0,
        fateThresholdBonus: 0,
        corruptionBonus: 0,
        insanityBonus: 0,
        aptitudes: [],
        notifications: [],
        ...overrides,
    };
}

/**
 * Schema-only regression for the GrantResult shape. The processor itself
 * needs a live Foundry actor + item graph so the integration paths are
 * exercised by the application/story suite. This file pins the addition
 * of `fateThresholdBonus` so a future refactor can't quietly drop it.
 */
describe('GrantResult shape', () => {
    it('declares fateThresholdBonus alongside fateBonus', () => {
        const empty: GrantResult = {
            characteristics: {},
            itemsToCreate: [],
            skillUpdates: {},
            woundsBonus: 0,
            fateBonus: 0,
            fateThresholdBonus: 0,
            corruptionBonus: 0,
            insanityBonus: 0,
            aptitudes: [],
            notifications: [],
        };
        expect(empty.fateThresholdBonus).toBe(0);
        expect(empty.fateBonus).toBe(0);
    });
});

describe('GrantsProcessor.applyGrants idempotency', () => {
    beforeEach(() => {
        // eslint-disable-next-line no-restricted-syntax -- test boundary: stub the Foundry `ui.notifications` global the applier calls
        (globalThis as unknown as { ui: { notifications: { info: () => void } } }).ui = { notifications: { info: vi.fn() } };
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('applying the same origin twice converges to applying it once (with originKey)', async () => {
        const result = makeResult({ characteristics: { willpower: 5 }, woundsBonus: 4, fateBonus: 2 });

        const once = makeMockActor();
        await GrantsProcessor.applyGrants(once, result, { showNotification: false, originKey: 'origin-abc' });
        const afterOnce = once.readState();

        const twice = makeMockActor();
        await GrantsProcessor.applyGrants(twice, result, { showNotification: false, originKey: 'origin-abc' });
        await GrantsProcessor.applyGrants(twice, result, { showNotification: false, originKey: 'origin-abc' });
        const afterTwice = twice.readState();

        expect(afterOnce).toEqual({ wp: 5, wounds: 4, fate: 2 });
        expect(afterTwice).toEqual(afterOnce);
    });

    it('reconciles to the new modifier when the origin result changes', async () => {
        const actor = makeMockActor();
        await GrantsProcessor.applyGrants(actor, makeResult({ characteristics: { willpower: 5 }, woundsBonus: 4 }), {
            showNotification: false,
            originKey: 'origin-abc',
        });
        // Re-apply with a smaller modifier — should net to the new value, not stack.
        await GrantsProcessor.applyGrants(actor, makeResult({ characteristics: { willpower: 2 }, woundsBonus: 1 }), {
            showNotification: false,
            originKey: 'origin-abc',
        });
        expect(actor.readState()).toEqual({ wp: 2, wounds: 1, fate: 0 });
    });

    it('preserves additive behaviour when no originKey is supplied (legacy path)', async () => {
        const actor = makeMockActor();
        const result = makeResult({ characteristics: { willpower: 5 }, woundsBonus: 4 });
        await GrantsProcessor.applyGrants(actor, result, { showNotification: false });
        await GrantsProcessor.applyGrants(actor, result, { showNotification: false });
        // No key → no delta tracking → the two applies stack (the pre-fix behaviour).
        expect(actor.readState()).toEqual({ wp: 10, wounds: 8, fate: 0 });
    });
});
