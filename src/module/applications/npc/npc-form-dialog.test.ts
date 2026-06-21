import { beforeEach, describe, expect, it, vi } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mixin: TS2545 requires `any[]` rest for mixin-class constructors; `unknown[]` is rejected.
type Constructor<T = object> = new (...args: any[]) => T;

/** Stub `foundry.applications.api` so the factory module can evaluate at import time. */
function installFoundryStubs(): void {
    class StubApplicationV2 {
        static DEFAULT_OPTIONS = {};
    }
    Object.assign(globalThis, {
        foundry: {
            applications: {
                api: {
                    ApplicationV2: StubApplicationV2,
                    HandlebarsApplicationMixin<T extends Constructor>(base: T): T {
                        return class extends base {};
                    },
                },
            },
        },
    });
}

interface BakedOptions {
    id: string;
    classes: string[];
    tag: string;
    window: { title?: string; icon?: string; minimizable: boolean; resizable: boolean; contentClasses: string[] };
    position: { width: number; height: number };
    form?: { submitOnChange: boolean; closeOnSubmit: boolean };
}

interface FactoryClass {
    name: string;
    DEFAULT_OPTIONS: BakedOptions;
    PARTS: Record<string, { template: string }>;
}

describe('makeNpcFormDialog', () => {
    beforeEach(() => {
        installFoundryStubs();
        vi.resetModules();
    });

    async function make(config: Parameters<typeof import('./npc-form-dialog.ts').makeNpcFormDialog>[0]): Promise<FactoryClass> {
        const { makeNpcFormDialog } = await import('./npc-form-dialog.ts');
        return makeNpcFormDialog(config) as unknown as FactoryClass;
    }

    it('bakes the shared form-dialog chrome with common defaults', async () => {
        const cls = await make({
            id: 'my-dialog-{id}',
            cssClass: 'my-dialog',
            window: { title: 'WH40K.Test.Title', icon: 'fa-solid fa-x' },
            position: { width: 500, height: 400 },
            partId: 'form',
            template: 'systems/wh40k-rpg/templates/dialogs/my.hbs',
            form: {},
        });

        expect(cls.DEFAULT_OPTIONS.id).toBe('my-dialog-{id}');
        expect(cls.DEFAULT_OPTIONS.classes).toEqual(['wh40k-rpg', 'my-dialog']);
        expect(cls.DEFAULT_OPTIONS.tag).toBe('form');
        expect(cls.DEFAULT_OPTIONS.window.title).toBe('WH40K.Test.Title');
        expect(cls.DEFAULT_OPTIONS.window.minimizable).toBe(false);
        expect(cls.DEFAULT_OPTIONS.window.resizable).toBe(true);
        expect(cls.DEFAULT_OPTIONS.window.contentClasses).toEqual(['standard-form']);
        expect(cls.DEFAULT_OPTIONS.position).toEqual({ width: 500, height: 400 });
        expect(cls.DEFAULT_OPTIONS.form).toEqual({ submitOnChange: false, closeOnSubmit: true });
        expect(cls.PARTS).toEqual({ form: { template: 'systems/wh40k-rpg/templates/dialogs/my.hbs' } });
    });

    it('honours window-chrome and tag overrides for div dialogs', async () => {
        const cls = await make({
            id: 'browser',
            cssClass: 'browser-dialog',
            tag: 'div',
            window: { title: 'WH40K.Test.Browser', icon: 'fa-solid fa-y', minimizable: true, resizable: false, contentClasses: [] },
            position: { width: 700, height: 600 },
            partId: 'content',
            template: 'systems/wh40k-rpg/templates/dialogs/browser.hbs',
        });

        expect(cls.DEFAULT_OPTIONS.tag).toBe('div');
        expect(cls.DEFAULT_OPTIONS.window.minimizable).toBe(true);
        expect(cls.DEFAULT_OPTIONS.window.resizable).toBe(false);
        expect(cls.DEFAULT_OPTIONS.window.contentClasses).toEqual([]);
        // Non-form dialogs get no form-flag block.
        expect(cls.DEFAULT_OPTIONS.form).toBeUndefined();
        expect(cls.PARTS).toEqual({ content: { template: 'systems/wh40k-rpg/templates/dialogs/browser.hbs' } });
    });

    it('sets an explicit class name so V14 sheet registration does not collide', async () => {
        const cls = await make({
            id: 'named',
            cssClass: 'named-dialog',
            position: { width: 300, height: 300 },
            partId: 'form',
            template: 't.hbs',
        });
        expect(cls.name).toBe('NpcFormDialog_named-dialog');
    });
});
