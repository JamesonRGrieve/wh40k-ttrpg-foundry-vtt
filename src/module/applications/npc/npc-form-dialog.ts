/**
 * @file npc-form-dialog - Shared ApplicationV2 base for the NPC GM-tool dialogs (#287).
 *
 * The NPC dialogs (batch-create, quick-create, threat-scaler, combat-preset,
 * template-selector, difficulty-calculator, encounter-builder) each re-scaffolded a
 * near-identical `HandlebarsApplicationMixin(ApplicationV2)` `DEFAULT_OPTIONS`: the
 * `wh40k-rpg` root class, a non-minimizable / resizable window with a `standard-form`
 * content class, a single Handlebars PART, and per-dialog id / title / icon / size.
 *
 * {@link makeNpcFormDialog} owns that shell. Each dialog extends `makeNpcFormDialog(config)`
 * and supplies only its deltas (state, `_prepareContext`, handlers). Per-dialog `actions`
 * and `form.handler` are declared in each subclass's own `DEFAULT_OPTIONS` and deep-merge
 * with the base via ApplicationV2's prototype-chain option merge, so the window / position /
 * form-flag scaffolding lives here once.
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Window-chrome deltas a dialog may override on top of the shared defaults. */
interface NpcFormDialogWindow {
    /** Window-title localization key. Omit when the dialog supplies a `get title()`. */
    title?: string;
    /** Font Awesome icon class for the window header. */
    icon?: string;
    /** Whether the window can be minimized (default `false`). */
    minimizable?: boolean;
    /** Whether the window can be resized (default `true`). */
    resizable?: boolean;
    /** Content classes (default `['standard-form']`; pass `[]` to opt out). */
    contentClasses?: string[];
}

/** Form-handling flags. Present only on dialogs that submit a form. */
interface NpcFormDialogForm {
    submitOnChange?: boolean;
    closeOnSubmit?: boolean;
}

/** Configuration for {@link makeNpcFormDialog}. */
export interface NpcFormDialogConfig {
    /** Unique id (may contain the `{id}` placeholder Foundry expands per-instance). */
    id: string;
    /** Root CSS class appended after `wh40k-rpg`. */
    cssClass: string;
    /** Root element tag (`'form'` for submitting dialogs, `'div'` otherwise; default `'form'`). */
    tag?: 'form' | 'div';
    /** Window-chrome overrides. */
    window?: NpcFormDialogWindow;
    /** Window position. */
    position: { width: number; height: number };
    /** PART id (the key under `PARTS`). */
    partId: string;
    /** Handlebars template path for the PART. */
    template: string;
    /** Form-handling flags; omit on non-form dialogs. */
    form?: NpcFormDialogForm;
}

/**
 * Build the shared NPC form-dialog base class from a config. Extend the returned class
 * and add per-dialog `actions` / `form.handler` (which deep-merge with these defaults).
 * The return type is inferred (not widened) so subclasses keep the full
 * HandlebarsApplicationMixin(ApplicationV2) surface and can `override` `_prepareContext`,
 * `_onRender`, `DEFAULT_OPTIONS`, and `PARTS`.
 * @param config - Per-dialog shell configuration.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the emitted base class is meant to be extended; an explicit return type would erase its inferred static (DEFAULT_OPTIONS/PARTS) and Handlebars instance surface
export function makeNpcFormDialog(config: NpcFormDialogConfig) {
    const winConfig = config.window ?? {};
    // Build the window block without spreading explicit `undefined` into optional keys
    // (exactOptionalPropertyTypes TS2375 rejects `title: undefined` on `title?: string`).
    const windowOptions: NonNullable<ApplicationV2Config.DefaultOptions['window']> = {
        minimizable: winConfig.minimizable ?? false,
        resizable: winConfig.resizable ?? true,
        contentClasses: winConfig.contentClasses ?? ['standard-form'],
    };
    if (winConfig.title !== undefined) windowOptions.title = winConfig.title;
    if (winConfig.icon !== undefined) windowOptions.icon = winConfig.icon;

    // Typed as the wide (all-optional) DefaultOptions shape so subclasses can supply
    // partial deltas (`{ actions, form }`) without redeclaring the full shell — the
    // static-side extends check on each subclass is against this type, not a narrow
    // inferred literal.
    const defaultOptions: ApplicationV2Config.DefaultOptions = {
        id: config.id,
        classes: ['wh40k-rpg', config.cssClass],
        tag: config.tag ?? 'form',
        window: windowOptions,
        position: config.position,
        // Form-submitting dialogs get the form-flag defaults; the handler is added per-dialog.
        ...(config.form !== undefined
            ? { form: { submitOnChange: config.form.submitOnChange ?? false, closeOnSubmit: config.form.closeOnSubmit ?? true } }
            : {}),
    };

    class NpcFormDialog extends HandlebarsApplicationMixin(ApplicationV2) {
        static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = defaultOptions;

        static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
            [config.partId]: { template: config.template },
        };
    }

    // V14: factory-returned anonymous classes all report name="" and can collide in
    // registries keyed by class name; set it explicitly (mirrors the registerSheet fix).
    Object.defineProperty(NpcFormDialog, 'name', { value: `NpcFormDialog_${config.cssClass}` });
    return NpcFormDialog;
}
