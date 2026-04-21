export type AnyApplicationV2 = foundry.applications.api.ApplicationV2.Any;

// TypeScript's mixin support still requires an `any[]` constructor signature.
export type ApplicationV2Ctor<TApplication extends AnyApplicationV2 = AnyApplicationV2> = new (...args: any[]) => TApplication;

export type ConstructorOf<TInstance> = new (...args: any[]) => TInstance;

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
    ContextMenu: typeof ContextMenu;
    TextEditor: { implementation: TextEditorImplementationLike };
}

export type ContextMenuEntryLike = {
    name: string;
    icon?: string;
    callback: () => void | Promise<void>;
    condition?: () => boolean;
    group?: string;
};
