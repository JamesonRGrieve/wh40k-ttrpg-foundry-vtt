/**
 * @file PsychicPowerDialog - V2 dialog for psychic power configuration
 */

import BaseRollDialog from './base-roll-dialog.ts';

interface PsychicRollData {
    selectPower?: (name: string) => void;
    update?: () => Promise<void>;
    finalize?: () => Promise<void>;
}

interface PsychicAttackData {
    rollData: PsychicRollData;
    performActionAndSendToChat?: () => Promise<void>;
}

/**
 * Dialog for configuring psychic power uses.
 */
export default class PsychicPowerDialog extends BaseRollDialog {
    declare psychicAttackData: PsychicAttackData;

    /**
     * @param {PsychicAttackData} psychicActionData  The psychic action data.
     * @param {ApplicationV2Config.DefaultOptions} [options={}]                  Dialog options.
     */
    constructor(psychicActionData: PsychicAttackData = { rollData: {} }, options: ApplicationV2Config.DefaultOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog accepts an arbitrary roll-config record
        super(psychicActionData.rollData as Record<string, unknown>, options);
        this.psychicAttackData = psychicActionData;
    }

    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        ...BaseRollDialog.DEFAULT_OPTIONS,
        classes: ['psychic-power'],
        actions: {
            ...BaseRollDialog.DEFAULT_OPTIONS.actions,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself
            selectPower: PsychicPowerDialog.#onSelectPower,
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts untyped context record
    async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up power selection listeners
        this.element.querySelectorAll('.power-select').forEach((el) => {
            el.addEventListener('change', (e) => void this._onPowerSelectChange(e));
        });

        // Set up button listeners
        this.element.querySelector('#power-roll')?.addEventListener('click', (e) => void this._onPowerRoll(e));
        this.element.querySelector('#power-cancel')?.addEventListener('click', (e) => void this._onPowerCancel(e));
    }

    /* -------------------------------------------- */

    /**
     * Handle power selection change.
     * @param {Event} event  The change event.
     * @protected
     */
    async _onPowerSelectChange(event: Event): Promise<void> {
        const data = this.psychicAttackData.rollData;
        if (typeof data.selectPower === 'function') data.selectPower((event.target as HTMLInputElement).name);
        if (typeof data.update === 'function') await data.update();
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
        this.psychicAttackData.rollData.selectPower?.(target.getAttribute('name') ?? '');
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
export function preparePsychicPowerRoll(psychicAttackData: PsychicAttackData): void {
    const prompt = new PsychicPowerDialog(psychicAttackData);
    void prompt.render({ force: true });
}
