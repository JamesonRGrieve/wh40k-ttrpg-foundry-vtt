/**
 * @file defineSimpleItemSheet — factory for simple ApplicationV2 item sheets.
 *
 * Many item sheets are 95% identical: they declare classes, a template path,
 * a position size, a tab list, and a default tab — and nothing else. This
 * factory replaces ~40-90 LOC of boilerplate per sheet with a single config
 * object.
 *
 * The emitted class extends `BaseItemSheet` by default, but any subclass of it
 * may be supplied via `baseClass` (e.g. `ContainerItemSheet` for storage
 * locations). Sheets that need additional context, custom actions, or
 * `_onRender` behavior pass optional callbacks; the factory wires them into
 * the emitted class.
 *
 * Foundry V14 gotcha: factory-emitted anonymous classes all get `name=""` and
 * collide inside `DocumentSheetConfig.registerSheet`. We set `name` explicitly
 * via `Object.defineProperty` on the emitted class.
 */

import BaseItemSheet from './base-item-sheet.ts';

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

/** Tab descriptor matching the V14 `static TABS` shape used by `BaseItemSheet`. */
export interface SimpleItemSheetTab {
    tab: string;
    group: string;
    label: string;
    condition?: (document: unknown) => boolean;
}

/** Action handler matching the V14 ApplicationV2 action shape. */
export type SimpleItemSheetAction = (this: BaseItemSheet, event: Event, target: HTMLElement) => unknown | Promise<unknown>;

/** Subset of the V14 `static PARTS.sheet` shape we let callers override. */
export interface SimpleItemSheetPartOverrides {
    /** CSS selectors that should be scrollable inside the rendered part. */
    scrollable?: string[];
}

/** Constructor type for any base class derived from `BaseItemSheet`. */
export type BaseItemSheetCtor = typeof BaseItemSheet;

/**
 * Config for {@link defineSimpleItemSheet}. The factory's only job is to wire
 * these fields into the static side of the emitted class — it is not a
 * runtime extension point. Per-sheet-instance behavior comes from the optional
 * callbacks (`prepareContext`, `onRender`).
 */
export interface DefineSimpleItemSheetOptions<TBase extends BaseItemSheetCtor = BaseItemSheetCtor> {
    /** Class name set on the emitted class. Required so V14 sheet registration does not collide. */
    className: string;
    /** Base class to extend. Defaults to `BaseItemSheet`. */
    baseClass?: TBase;
    /** Value for `static DEFAULT_OPTIONS.classes`. Foundry V14 sheets need `'sheet'` in this array. */
    classes: string[];
    /** Handlebars template path for the `sheet` part. */
    template: string;
    /** Sheet width in pixels. */
    width: number;
    /** Sheet height in pixels. */
    height: number;
    /** Optional override of the `sheet` part properties beyond `template`. */
    partOverrides?: SimpleItemSheetPartOverrides;
    /** Static action map. Merged with the base class's actions. */
    actions?: Record<string, SimpleItemSheetAction>;
    /** Tab descriptors. Omit (or pass `[]`) for tabless sheets like `SkillSheet`. */
    tabs?: SimpleItemSheetTab[];
    /** Initially active tab in the `primary` group. Required when `tabs` is non-empty. */
    defaultTab?: string;
    /**
     * Static context fields merged into every render. Use this for enum
     * label maps and other constants — it avoids needing a `prepareContext`
     * callback for the common case.
     */
    extraContext?: Record<string, unknown>;
    /** Optional async hook to extend the rendered context. Called after the base class's `_prepareContext`. */
    prepareContext?: (sheet: BaseItemSheet, context: Record<string, unknown>) => void | Promise<void>;
    /** Optional async hook called after the base class's `_onRender`. */
    onRender?: (sheet: BaseItemSheet, context: Record<string, unknown>, options: Record<string, unknown>) => void | Promise<void>;
}

/* -------------------------------------------- */
/*  Factory                                     */
/* -------------------------------------------- */

/**
 * Build a simple item sheet class from a config object.
 *
 * @param opts Sheet configuration. See {@link DefineSimpleItemSheetOptions}.
 * @returns A class suitable for `DocumentSheetConfig.registerSheet`.
 */
export default function defineSimpleItemSheet<TBase extends BaseItemSheetCtor = BaseItemSheetCtor>(opts: DefineSimpleItemSheetOptions<TBase>): TBase {
    const Base = (opts.baseClass ?? BaseItemSheet) as TBase;
    const tabs = opts.tabs ?? [];
    const hasTabs = tabs.length > 0;

    if (hasTabs && !opts.defaultTab) {
        throw new Error(`defineSimpleItemSheet(${opts.className}): defaultTab is required when tabs is non-empty.`);
    }

    // V14 TS2417: subclassing `BaseItemSheet` with new static fields trips
    // strict static-side inheritance checking. The existing hand-written
    // sheets all `@ts-expect-error` this; we encapsulate the suppression here
    // so call sites are clean.
    // @ts-expect-error - TS2417 static side inheritance
    const Cls = class extends Base {
        static override DEFAULT_OPTIONS = {
            classes: opts.classes,
            position: {
                width: opts.width,
                height: opts.height,
            },
            ...(opts.actions ? { actions: opts.actions } : {}),
        };

        static override PARTS = {
            sheet: {
                template: opts.template,
                scrollable: opts.partOverrides?.scrollable ?? ['.wh40k-tab-content'],
            },
        };

        static override TABS = tabs;

        override tabGroups: Record<string, string> = hasTabs ? { primary: opts.defaultTab as string } : {};

        override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const context = await (super._prepareContext as any).call(this, options);

            if (opts.extraContext) {
                Object.assign(context, opts.extraContext);
            }

            if (opts.prepareContext) {
                await opts.prepareContext(this, context);
            }

            return context;
        }

        override async _onRender(context: Record<string, unknown>, renderOptions: Record<string, unknown>): Promise<void> {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (super._onRender as any).call(this, context, renderOptions);
            if (opts.onRender) {
                await opts.onRender(this, context, renderOptions);
            }
        }
    };

    // V14: factory-returned anonymous classes default to `name=""` and collide
    // inside DocumentSheetConfig.registerSheet. Set the class name explicitly.
    Object.defineProperty(Cls, 'name', { value: opts.className, configurable: true });

    return Cls;
}
