/**
 * @file AddXPDialog - V2 dialog for adding/subtracting XP
 */

import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

interface AddXPContext extends Record<string, unknown> {
    actor: WH40KAcolyte;
    currentTotal: number;
    xpAmount: number;
    newTotal: number;
    isAddition: boolean;
    absAmount: number;
}

/**
 * Dialog for adding or subtracting experience points.
 */
export default class AddXPDialog extends ApplicationV2Mixin(ApplicationV2) {
    actor: WH40KAcolyte;
    xpAmount: number;

    /**
     * @param {WH40KAcolyte} actor  The actor to modify.
     * @param {AddXPDialogOptions} [options={}]       Dialog options.
     */
    constructor(actor: WH40KAcolyte, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.xpAmount = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'add-xp-dialog', 'standard-form'],
        actions: {
            apply: AddXPDialog.#onApply,
            cancel: AddXPDialog.#onCancel,
        },
        form: {
            handler: AddXPDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: {
            width: 400,
        },
        window: {
            title: 'Adjust Total XP',
            minimizable: false,
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/add-xp-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AddXPContext> {
        const context = await super._prepareContext(options);
        const currentTotal = (this.actor.system as any)?.experience?.total ?? 0;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        return {
            ...context,
            actor: this.actor,
            currentTotal,
            xpAmount: this.xpAmount,
            newTotal,
            isAddition: this.xpAmount >= 0,
            absAmount: Math.abs(this.xpAmount),
        } as AddXPContext;
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: AddXPContext, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        const input = this.element.querySelector('input[name="xpAmount"]') as HTMLInputElement | null;
        if (input) {
            input.focus();
            input.select();

            input.addEventListener('focus', (event) => {
                (event.target as HTMLInputElement).select();
            });
        }
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #onFormChange(this: AddXPDialog, event: Event, form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
        const xpAmount = parseInt(formData.object.xpAmount as string) || 0;
        if (this.xpAmount !== xpAmount) {
            this.xpAmount = xpAmount;
            await this.render();
        }
    }

    /* -------------------------------------------- */

    static async #onApply(this: AddXPDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();

        if (this.xpAmount === 0) {
            await this.close();
            return;
        }

        const currentTotal = (this.actor.system as any)?.experience?.total ?? 0;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        await this.actor.update({ 'system.experience.total': newTotal });

        const verb = this.xpAmount > 0 ? 'added' : 'removed';
        ui.notifications.info(`${Math.abs(this.xpAmount)} XP ${verb}. Total: ${newTotal}`);

        await this.close();
    }

    /* -------------------------------------------- */

    static async #onCancel(this: AddXPDialog, event: PointerEvent, target: HTMLElement): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

export function openAddXPDialog(actor: WH40KAcolyte): void {
    const dialog = new AddXPDialog(actor);
    void dialog.render(true);
}
