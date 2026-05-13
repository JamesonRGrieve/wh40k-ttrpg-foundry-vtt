/**
 * @file AddXPDialog - V2 dialog for adding/subtracting XP
 */

import type { WH40KAcolyte } from '../../documents/acolyte.ts';
import type { ApplicationV2Ctor } from '../api/application-types.ts';
import ApplicationV2Mixin from '../api/application-v2-mixin.ts';

const { ApplicationV2 } = foundry.applications.api;

/** Precise type for ApplicationV2 action handlers bound with a `this` context. */
type ActionHandler = (this: AddXPDialog, event: Event, target: HTMLElement) => Promise<void>;

// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars context is an open bag; Record<string, unknown> matches the mixin's return type
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
// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 global lacks the typed constructor Mixin needs; cast through unknown is the established pattern
export default class AddXPDialog extends ApplicationV2Mixin(ApplicationV2 as unknown as ApplicationV2Ctor) {
    declare actor: WH40KAcolyte;
    declare xpAmount: number;

    /**
     * @param {WH40KAcolyte} actor  The actor to modify.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]       Dialog options.
     */
    constructor(actor: WH40KAcolyte, options: ApplicationV2Config.DefaultOptions = {}) {
        super(options);
        this.actor = actor;
        this.xpAmount = 0;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        tag: 'form',
        classes: ['wh40k-rpg', 'dialog', 'add-xp-dialog', 'standard-form'],
        actions: {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method
            apply: AddXPDialog.#onApply as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/unbound-method
            cancel: AddXPDialog.#onCancel as ActionHandler,
        },
        form: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            handler: AddXPDialog.#onFormChange,
            submitOnChange: true,
            closeOnSubmit: false,
        },
        position: {
            width: 400,
        },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.VitalEditBody.AdjustTotalXPTitle',
            resizable: false,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/add-xp-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<AddXPContext> {
        const context = (await super._prepareContext(options)) as AddXPContext;
        const currentTotal = this.actor.experience.total;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        return {
            ...context,
            actor: this.actor,
            currentTotal,
            xpAmount: this.xpAmount,
            newTotal,
            isAddition: this.xpAmount >= 0,
            absAmount: Math.abs(this.xpAmount),
        };
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    override async _onRender(context: AddXPContext, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        const input = this.element.querySelector<HTMLInputElement>('input[name="xpAmount"]');
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
        const rawXp = formData.object['xpAmount'];
        const xpAmount = typeof rawXp === 'string' || typeof rawXp === 'number' ? parseInt(String(rawXp), 10) || 0 : 0;
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

        const currentTotal = this.actor.experience.total;
        const newTotal = Math.max(0, currentTotal + this.xpAmount);

        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts Record for dotted-path writes
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
    void dialog.render({ force: true });
}
