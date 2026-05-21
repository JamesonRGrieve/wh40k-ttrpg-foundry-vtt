/**
 * Tests for `defineSimpleItemSheet` — the factory that emits simple
 * ApplicationV2 item-sheet classes from a config object.
 *
 * The factory is a pure transform from config to class shape; we validate the
 * shape directly without booting Foundry. The most important assertion is
 * that each emitted class gets a distinct `name` set via Object.defineProperty
 * — V14's DocumentSheetConfig.registerSheet collides on `name=""`, so this is
 * a runtime requirement, not just cosmetics.
 */

import { describe, expect, it, vi } from 'vitest';
import defineSimpleItemSheet from '../src/module/applications/item/define-simple-item-sheet.ts';

// Stub the BaseItemSheet import surface so the factory can extend a class
// without dragging the full Foundry/ApplicationV2 mixin chain into the test.
// These two aliases are framework-boundary shapes for ApplicationV2 _prepareContext/_onRender
// payloads, which Foundry types as untyped objects.
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext options payload is untyped in Foundry
type PrepareContextOptions = Record<string, unknown>;
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 render context is free-form by framework contract
type RenderContext = Record<string, unknown>;

vi.mock('../src/module/applications/item/base-item-sheet.ts', () => {
    class FakeBaseItemSheet {
        static DEFAULT_OPTIONS = { tag: 'form' };
        static PARTS = {};
        static TABS = [];
        tabGroups: Record<string, string> = {};
        // Async signature is the framework contract (ApplicationV2._prepareContext); body is sync.
        async _prepareContext(_options: PrepareContextOptions): Promise<RenderContext> {
            return Promise.resolve({ fromBase: true });
        }
        async _onRender(_context: RenderContext, _options: PrepareContextOptions): Promise<void> {
            return Promise.resolve();
        }
    }
    return { default: FakeBaseItemSheet };
});

/**
 * Local descriptor of the static shape emitted by `defineSimpleItemSheet`.
 * The factory's return type is `typeof BaseItemSheet`, which doesn't expose
 * the override fields we want to assert on — this interface is the test-side
 * mirror of what the factory writes to the class.
 */
interface SimpleItemSheetStatic {
    DEFAULT_OPTIONS: {
        classes?: string[];
        position?: { width: number; height: number };
        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 actions map is an arbitrary handler dictionary
        actions?: Record<string, unknown>;
    };
    PARTS: Record<string, { template: string; scrollable: string[] }>;
    TABS: Array<{ tab: string; group: string; label: string }>;
}

interface SimpleItemSheetInstance {
    tabGroups: Record<string, string>;
    _prepareContext: (o: PrepareContextOptions) => Promise<RenderContext>;
}

/**
 * Narrow a factory-returned class to its concrete emitted static shape. The
 * factory return type is intentionally `typeof BaseItemSheet` (so callers can
 * pass it straight to `DocumentSheetConfig.registerSheet`); the test asserts
 * against the additional fields the factory writes on top, hence the cast.
 */
function asStatic<T>(Cls: T): T & SimpleItemSheetStatic {
    // eslint-disable-next-line no-restricted-syntax -- boundary: factory returns `typeof BaseItemSheet`; this widens to the runtime-emitted static shape
    return Cls as unknown as T & SimpleItemSheetStatic;
}

function instantiate<T>(Cls: T): SimpleItemSheetInstance {
    // eslint-disable-next-line no-restricted-syntax -- boundary: factory returns `typeof BaseItemSheet`; narrow to constructor signature for test instantiation
    const Ctor = Cls as unknown as new () => SimpleItemSheetInstance;
    return new Ctor();
}

describe('defineSimpleItemSheet', () => {
    it('sets static DEFAULT_OPTIONS, PARTS, and TABS from config', () => {
        const Cls = defineSimpleItemSheet({
            className: 'TestSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'test'],
            template: 'systems/wh40k-rpg/templates/item/item-test-sheet.hbs',
            width: 500,
            height: 400,
            tabs: [
                { tab: 'details', group: 'primary', label: 'Details' },
                { tab: 'description', group: 'primary', label: 'Description' },
            ],
            defaultTab: 'details',
        });

        // V14 collision fix: emitted class must carry an explicit name.
        expect(Cls.name).toBe('TestSheet');

        const opts = asStatic(Cls).DEFAULT_OPTIONS;
        expect(opts.classes).toEqual(['wh40k-rpg', 'sheet', 'item', 'test']);
        expect(opts.position).toEqual({ width: 500, height: 400 });

        const parts = asStatic(Cls).PARTS;
        expect(parts['sheet'].template).toBe('systems/wh40k-rpg/templates/item/item-test-sheet.hbs');
        expect(parts['sheet'].scrollable).toEqual(['.wh40k-tab-content']);

        const tabs = asStatic(Cls).TABS;
        expect(tabs).toHaveLength(2);
        expect(tabs[0].tab).toBe('details');
    });

    it('seeds tabGroups.primary from defaultTab', () => {
        const Cls = defineSimpleItemSheet({
            className: 'WeaponQualitySheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'weapon-quality'],
            template: 'x.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 'effect', group: 'primary', label: 'Effect' }],
            defaultTab: 'effect',
        });
        const instance = instantiate(Cls);
        expect(instance.tabGroups['primary']).toBe('effect');
    });

    it('produces distinct class names so V14 registerSheet does not collide', () => {
        const A = defineSimpleItemSheet({
            className: 'AlphaSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'a'],
            template: 'a.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 't', group: 'primary', label: 'T' }],
            defaultTab: 't',
        });
        const B = defineSimpleItemSheet({
            className: 'BetaSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'b'],
            template: 'b.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 't', group: 'primary', label: 'T' }],
            defaultTab: 't',
        });
        expect(A.name).toBe('AlphaSheet');
        expect(B.name).toBe('BetaSheet');
        expect(A.name).not.toBe(B.name);
    });

    it('omits actions from DEFAULT_OPTIONS when none supplied', () => {
        const Cls = defineSimpleItemSheet({
            className: 'NoActionsSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'na'],
            template: 'x.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 't', group: 'primary', label: 'T' }],
            defaultTab: 't',
        });
        const opts = asStatic(Cls).DEFAULT_OPTIONS;
        expect('actions' in opts).toBe(false);
    });

    it('forwards a custom action map onto DEFAULT_OPTIONS.actions', () => {
        const handler = vi.fn();
        const Cls = defineSimpleItemSheet({
            className: 'CriticalInjurySheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'critical-injury'],
            template: 'x.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 'details', group: 'primary', label: 'Details' }],
            defaultTab: 'details',
            actions: { changeSeverity: handler },
        });
        const opts = asStatic(Cls).DEFAULT_OPTIONS;
        expect(opts.actions).toBeDefined();
        expect(opts.actions['changeSeverity']).toBe(handler);
    });

    it('merges extraContext into _prepareContext output', async () => {
        const Cls = defineSimpleItemSheet({
            className: 'ConditionSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'condition'],
            template: 'x.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 'details', group: 'primary', label: 'Details' }],
            defaultTab: 'details',
            extraContext: {
                natures: { beneficial: 'Beneficial' },
            },
        });
        const instance = instantiate(Cls);
        const ctx = await instance._prepareContext({});
        expect(ctx['fromBase']).toBe(true);
        expect(ctx['natures']).toEqual({ beneficial: 'Beneficial' });
    });

    it('invokes prepareContext callback with the rendered context', async () => {
        // The factory's `prepareContext` callback signature is `(this, ctx) => Promise<void>`,
        // so the wrapper here is `async` to match the framework type even though the body is sync.
        const cb = vi.fn(
            // eslint-disable-next-line no-restricted-syntax -- boundary: prepareContext callback receives the sheet instance untyped at this layer (ApplicationV2 framework type).
            async (_sheet: unknown, innerCtx: RenderContext): Promise<void> => {
                innerCtx['injected'] = 42;
                return Promise.resolve();
            },
        );
        const Cls = defineSimpleItemSheet({
            className: 'WithCallbackSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'cb'],
            template: 'x.hbs',
            width: 1,
            height: 1,
            tabs: [{ tab: 'details', group: 'primary', label: 'Details' }],
            defaultTab: 'details',
            prepareContext: cb,
        });
        const instance = instantiate(Cls);
        const ctx = await instance._prepareContext({});
        expect(cb).toHaveBeenCalledOnce();
        expect(ctx['injected']).toBe(42);
    });

    it('supports tabless sheets (e.g. SkillSheet)', () => {
        const Cls = defineSimpleItemSheet({
            className: 'SkillSheet',
            classes: ['wh40k-rpg', 'sheet', 'item', 'skill'],
            template: 'x.hbs',
            width: 600,
            height: 700,
            partOverrides: { scrollable: ['.wh40k-item-body'] },
        });
        const tabs = asStatic(Cls).TABS;
        expect(tabs).toEqual([]);
        const instance = instantiate(Cls);
        expect(instance.tabGroups).toEqual({});
        const parts = asStatic(Cls).PARTS;
        expect(parts['sheet'].scrollable).toEqual(['.wh40k-item-body']);
    });

    it('throws if tabs is non-empty but defaultTab is missing', () => {
        expect(() =>
            defineSimpleItemSheet({
                className: 'BrokenSheet',
                classes: ['wh40k-rpg', 'sheet', 'item', 'x'],
                template: 'x.hbs',
                width: 1,
                height: 1,
                tabs: [{ tab: 'a', group: 'primary', label: 'A' }],
            }),
        ).toThrow(/defaultTab is required/);
    });

    it('extends a custom baseClass when supplied', () => {
        class CustomBase {
            static DEFAULT_OPTIONS = {};
            static PARTS = {};
            static TABS = [];
            tabGroups: Record<string, string> = {};
            customMarker = 'container';
            async _prepareContext(_o: PrepareContextOptions): Promise<RenderContext> {
                return Promise.resolve({ fromCustomBase: true });
            }
            async _onRender(_c: RenderContext, _o: PrepareContextOptions): Promise<void> {
                return Promise.resolve();
            }
        }
        const Cls = defineSimpleItemSheet({
            className: 'StorageLocationSheet',
            // The factory's `TBase extends BaseItemSheetCtor` constraint is too narrow
            // for an arbitrary fake base class authored only for this test, but the
            // factory only uses the base via `extends`, so a runtime-correct cast
            // through `unknown` to the constructor shape is the boundary.
            // eslint-disable-next-line no-restricted-syntax -- boundary: test custom base class does not satisfy BaseItemSheetCtor static shape but is structurally compatible
            baseClass: CustomBase as unknown as Parameters<typeof defineSimpleItemSheet>[0]['baseClass'],
            classes: ['wh40k-rpg', 'storage-location'],
            template: 'x.hbs',
            width: 550,
            height: 500,
            tabs: [{ tab: 'contents', group: 'primary', label: 'Contents' }],
            defaultTab: 'contents',
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: factory returns `typeof BaseItemSheet`; narrow to the custom base class for this test
        const Ctor = Cls as unknown as new () => CustomBase;
        const instance = new Ctor();
        expect(instance).toBeInstanceOf(CustomBase);
        expect(instance.customMarker).toBe('container');
    });
});
