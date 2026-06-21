import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Tests for the shared finalize/select plumbing hoisted into BaseRollDialog (#348).
 *
 * `BaseRollDialog extends ApplicationV2Mixin(ApplicationV2)` is evaluated at
 * module-load, so the Foundry application globals must be installed before the
 * dynamic import. The methods under test (`_performRoll`, `_getRollData`,
 * `_onSelectItem`) only touch `this` members we control, so we pull them off the
 * prototype and invoke them against a minimal stub `this` — no ApplicationV2 boot.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructors; `unknown[]` is rejected.
type Constructor<T = object> = new (...args: any[]) => T;

interface RollDispatch {
    finalize?: () => Promise<void> | void;
    performActionAndSendToChat?: () => Promise<void> | void;
}

// The subset of the BaseRollDialog prototype the tests reach into.
interface BaseRollDialogProto {
    _performRoll(this: RollDialogStub): Promise<void>;
    _getRollData(this: RollDialogStub): RollDispatch;
    _onSelectItem(this: RollDialogStub, rollData: { update?: () => Promise<void> | void }, selectFn: ((name: string) => void) | undefined, name: string): Promise<void>;
}

// The stub `this` the prototype methods run against.
interface RollDialogStub {
    rollData: Record<string, unknown>;
    _validateRoll: () => boolean;
    _getRollData: () => RollDispatch;
    close: () => Promise<void>;
    render: () => Promise<void> | void;
}

function installFoundryStubs(): void {
    Object.assign(globalThis, {
        CONFIG: { wh40k: {} },
        foundry: {
            applications: {
                api: {
                    ApplicationV2: class {},
                    HandlebarsApplicationMixin<T extends Constructor>(base: T): T {
                        return base;
                    },
                },
            },
        },
    });
}

async function loadProto(): Promise<BaseRollDialogProto | undefined> {
    const mod = await importModelOrSkip(import('./base-roll-dialog.ts'));
    if (mod === undefined) return undefined;
    const Ctor = mod.default as unknown as { prototype: BaseRollDialogProto };
    return Ctor.prototype;
}

describe('BaseRollDialog shared roll plumbing (#348)', () => {
    beforeEach(() => {
        installFoundryStubs();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('_getRollData reads the finalize/dispatch contract straight off rollData by default', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const finalize = vi.fn();
        const stub = { rollData: { finalize } } as unknown as RollDialogStub;
        expect(proto._getRollData.call(stub)).toBe(stub.rollData);
    });

    it('_performRoll runs validate -> finalize -> dispatch -> close in order', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const calls: string[] = [];
        const finalize = vi.fn(() => void calls.push('finalize'));
        const performActionAndSendToChat = vi.fn(() => void calls.push('dispatch'));
        const close = vi.fn(() => {
            calls.push('close');
            return Promise.resolve();
        });
        const stub: RollDialogStub = {
            rollData: { finalize, performActionAndSendToChat },
            _validateRoll: () => {
                calls.push('validate');
                return true;
            },
            _getRollData: () => stub.rollData as RollDispatch,
            close,
            render: () => undefined,
        };

        await proto._performRoll.call(stub);

        expect(calls).toEqual(['validate', 'finalize', 'dispatch', 'close']);
    });

    it('_performRoll aborts before finalize/dispatch/close when validation fails', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const finalize = vi.fn();
        const performActionAndSendToChat = vi.fn();
        const close = vi.fn(() => Promise.resolve());
        const stub: RollDialogStub = {
            rollData: { finalize, performActionAndSendToChat },
            _validateRoll: () => false,
            _getRollData: () => stub.rollData as RollDispatch,
            close,
            render: () => undefined,
        };

        await proto._performRoll.call(stub);

        expect(finalize).not.toHaveBeenCalled();
        expect(performActionAndSendToChat).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });

    it('_performRoll still closes when the dispatch hooks are absent', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const close = vi.fn(() => Promise.resolve());
        const stub: RollDialogStub = {
            rollData: {},
            _validateRoll: () => true,
            _getRollData: () => ({}),
            close,
            render: () => undefined,
        };

        await proto._performRoll.call(stub);

        expect(close).toHaveBeenCalledOnce();
    });

    it('_onSelectItem calls the select callback, awaits update, then re-renders', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const calls: string[] = [];
        const selectFn = vi.fn((name: string) => void calls.push(`select:${name}`));
        const update = vi.fn(() => {
            calls.push('update');
            return Promise.resolve();
        });
        const render = vi.fn(() => void calls.push('render'));
        const stub = { render } as unknown as RollDialogStub;

        await proto._onSelectItem.call(stub, { update }, selectFn, 'Bolt Pistol');

        expect(selectFn).toHaveBeenCalledWith('Bolt Pistol');
        expect(calls).toEqual(['select:Bolt Pistol', 'update', 'render']);
    });

    it('_onSelectItem is a no-op-safe when selectFn/update are undefined but still re-renders', async () => {
        const proto = await loadProto();
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the ApplicationV2 runtime is unavailable, not an assertion branch
        if (proto === undefined) return;

        const render = vi.fn();
        const stub = { render } as unknown as RollDialogStub;

        await proto._onSelectItem.call(stub, {}, undefined, 'Anything');

        expect(render).toHaveBeenCalledOnce();
    });
});
