/**
 * @file PsychicPowerDialog - V2 dialog for psychic power configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring psychic power uses.
 */
export default class PsychicPowerDialog extends BaseRollDialog {
    declare psychicAttackData: Record<string, any>;

    /**
     * @param {Record<string, any>} psychicActionData  The psychic action data.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]                  Dialog options.
     */
    constructor(psychicActionData: Record<string, any> = {}, options: ApplicationV2Config.DefaultOptions = {}) {
        super(psychicActionData.rollData, options);
        this.psychicAttackData = psychicActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        ...BaseRollDialog.DEFAULT_OPTIONS,
        classes: ['psychic-power'],
        actions: {
            ...BaseRollDialog.DEFAULT_OPTIONS.actions,
            selectPower: PsychicPowerDialog.#onSelectPower as unknown as ApplicationV2Config.DefaultOptions['actions'],
        },
        window: {
            title: 'Psychic Power',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/psychic-power-roll-prompt.hbs',
            classes: [],
            scrollable: [],
        },
    };

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up power selection listeners
        this.element.querySelectorAll('.power-select').forEach((el) => {
            el.addEventListener('change', this._onPowerSelectChange.bind(this) as EventListener);
        });

        // Set up button listeners
        this.element.querySelector('#power-roll')?.addEventListener('click', this._onPowerRoll.bind(this) as EventListener);
        this.element.querySelector('#power-cancel')?.addEventListener('click', this._onPowerCancel.bind(this) as EventListener);
    }

    /* -------------------------------------------- */

    /**
     * Handle power selection change.
     * @param {Event} event  The change event.
     * @protected
     */
    async _onPowerSelectChange(event: Event): Promise<void> {
        if (typeof this.rollData.selectPower === 'function') (this.rollData.selectPower as (name: string) => void)((event.target as HTMLInputElement).name);
        if (typeof this.rollData.update === 'function') await (this.rollData.update as () => Promise<void>)();
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Handle power roll button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPowerRoll(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle power cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onPowerCancel(event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle power selection via action.
     */
    static async #onSelectPower(this: PsychicPowerDialog, event: Event, target: HTMLElement): Promise<void> {
        await this.psychicAttackData.rollData.selectPower?.(target.getAttribute('name') ?? '');
        await this.psychicAttackData.rollData.update?.();
        void this.render();
    }

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    async _performRoll(): Promise<void> {
        await this.psychicAttackData.rollData.finalize?.();
        await this.psychicAttackData.performActionAndSendToChat?.();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a psychic power dialog.
 * @param {PsychicActionData} psychicAttackData  The psychic action data.
 */
export function preparePsychicPowerRoll(psychicAttackData) {
    const prompt = new PsychicPowerDialog(psychicAttackData);
    prompt.render(true);
}
