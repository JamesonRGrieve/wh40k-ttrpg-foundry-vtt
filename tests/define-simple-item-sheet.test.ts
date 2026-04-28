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

// Stub the BaseItemSheet import surface so the factory can extend a class
// without dragging the full Foundry/ApplicationV2 mixin chain into the test.
vi.mock('../src/module/applications/item/base-item-sheet.ts', () => {
    class FakeBaseItemSheet {
        static DEFAULT_OPTIONS = { tag: 'form' };
        static PARTS = {};
        static TABS = [];
        tabGroups: Record<string, string> = {};
        async _prepareContext(_options: Record<string, unknown>): Promise<Record<string, unknown>> {
            return { fromBase: true };
        }
        async _onRender(_context: Record<string, unknown>, _options: Record<string, unknown>): Promise<void> {
            /* no-op */
        }
    }
    return { default: FakeBaseItemSheet };
});

import defineSimpleItemSheet from '../src/module/applications/item/define-simple-item-sheet.ts';

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

        const opts = (Cls as unknown as { DEFAULT_OPTIONS: Record<string, unknown> }).DEFAULT_OPTIONS;
        expect(opts.classes).toEqual(['wh40k-rpg', 'sheet', 'item', 'test']);
        expect(opts.position).toEqual({ width: 500, height: 400 });

        const parts = (Cls as unknown as { PARTS: Record<string, { template: string; scrollable: string[] }> }).PARTS;
        expect(parts.sheet.template).toBe('systems/wh40k-rpg/templates/item/item-test-sheet.hbs');
        expect(parts.sheet.scrollable).toEqual(['.wh40k-tab-content']);

        const tabs = (Cls as unknown as { TABS: Array<{ tab: string }> }).TABS;
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
        const instance = new (Cls as unknown as new () => { tabGroups: Record<string, string> })();
        expect(instance.tabGroups.primary).toBe('effect');
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
        const opts = (Cls as unknown as { DEFAULT_OPTIONS: Record<string, unknown> }).DEFAULT_OPTIONS;
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
        const opts = (Cls as unknown as { DEFAULT_OPTIONS: { actions: Record<string, unknown> } }).DEFAULT_OPTIONS;
        expect(opts.actions.changeSeverity).toBe(handler);
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
        const instance = new (Cls as unknown as new () => {
            _prepareContext: (o: Record<string, unknown>) => Promise<Record<string, unknown>>;
        })();
        const ctx = await instance._prepareContext({});
        expect(ctx.fromBase).toBe(true);
        expect(ctx.natures).toEqual({ beneficial: 'Beneficial' });
    });

    it('invokes prepareContext callback with the rendered context', async () => {
        const cb = vi.fn(async (_sheet: unknown, ctx: Record<string, unknown>) => {
            ctx.injected = 42;
        });
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
        const instance = new (Cls as unknown as new () => {
            _prepareContext: (o: Record<string, unknown>) => Promise<Record<string, unknown>>;
        })();
        const ctx = await instance._prepareContext({});
        expect(cb).toHaveBeenCalledOnce();
        expect(ctx.injected).toBe(42);
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
        const tabs = (Cls as unknown as { TABS: Array<unknown> }).TABS;
        expect(tabs).toEqual([]);
        const instance = new (Cls as unknown as new () => { tabGroups: Record<string, string> })();
        expect(instance.tabGroups).toEqual({});
        const parts = (Cls as unknown as { PARTS: Record<string, { scrollable: string[] }> }).PARTS;
        expect(parts.sheet.scrollable).toEqual(['.wh40k-item-body']);
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
            async _prepareContext(_o: Record<string, unknown>): Promise<Record<string, unknown>> {
                return { fromCustomBase: true };
            }
            async _onRender(_c: Record<string, unknown>, _o: Record<string, unknown>): Promise<void> {
                /* no-op */
            }
        }
        const Cls = defineSimpleItemSheet({
            className: 'StorageLocationSheet',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            baseClass: CustomBase as any,
            classes: ['wh40k-rpg', 'storage-location'],
            template: 'x.hbs',
            width: 550,
            height: 500,
            tabs: [{ tab: 'contents', group: 'primary', label: 'Contents' }],
            defaultTab: 'contents',
        });
        const instance = new (Cls as unknown as new () => CustomBase)();
        expect(instance).toBeInstanceOf(CustomBase);
        expect(instance.customMarker).toBe('container');
    });
});
