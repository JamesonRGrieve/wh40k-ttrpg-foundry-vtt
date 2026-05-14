export type AnyApplicationV2 = foundry.applications.api.ApplicationV2.Any;

// TypeScript's mixin support still requires an `any[]` constructor signature.
// biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
export type ApplicationV2Ctor<TApplication extends AnyApplicationV2 = AnyApplicationV2> = new (...args: any[]) => TApplication; // eslint-disable-line @typescript-eslint/no-explicit-any -- boundary: mixin constructor requires any[] per TS mixin rule (TS2545)

// biome-ignore lint/suspicious/noExplicitAny: mixin constructor requires any[] per TS mixin rule (TS2545)
export type ConstructorOf<TInstance> = new (...args: any[]) => TInstance; // eslint-disable-line @typescript-eslint/no-explicit-any -- boundary: mixin constructor requires any[] per TS mixin rule (TS2545)

/* eslint-disable no-restricted-syntax -- boundary: ApplicationV2/Foundry interface shapes use unknown for free-form config payloads */
export interface DialogV2Like {
    wait(config: Record<string, unknown>): Promise<unknown>;
    confirm(config: Record<string, unknown>): Promise<boolean>;
    prompt(config: Record<string, unknown>): Promise<unknown>;
}

export interface TextEditorImplementationLike {
    enrichHTML(content: string, options?: Record<string, unknown>): Promise<string>;
}

export interface FoundryApplicationApiLike {
    HandlebarsApplicationMixin<T extends ApplicationV2Ctor>(base: T): ApplicationV2Ctor;
    DialogV2: DialogV2Like;
}

export interface FoundryApplicationUXLike {
    ContextMenu: typeof foundry.applications.ux.ContextMenu;
    TextEditor: { implementation: TextEditorImplementationLike };
}
/* eslint-enable no-restricted-syntax */

export type ContextMenuEntryLike = {
    name: string;
    icon?: string;
    callback: () => void | Promise<void>;
    condition?: () => boolean;
    group?: string;
};
