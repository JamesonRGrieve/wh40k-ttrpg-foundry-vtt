/**
 * @file AssignDamageDialog - V2 dialog for damage assignment
 */

import { hitDropdown } from '../../rules/hit-locations.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for assigning damage to a target.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog options are passed through to ApplicationV2 super; no narrower type available
type AssignDamageDialogOptions = Record<string, unknown>;

export default class AssignDamageDialog extends BaseRollDialog {
    /**
     * @param {object} assignDamageData  The damage assignment data.
     * @param {AssignDamageDialogOptions} [options={}]      Dialog options.
     */
    constructor(assignDamageData = {}, options: AssignDamageDialogOptions = {}) {
        super(assignDamageData, options);
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['assign-damage'],
        window: {
            title: 'WH40K.Dialog.AssignDamageTitle',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/assign-damage-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2._prepareContext must return Record<string,unknown> per framework contract
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // The location dropdown labels are localized at render time, not baked into the damage data.
        return { ...(await super._prepareContext(options)), locations: hitDropdown() };
    }

    /* -------------------------------------------- */
    /*  Event Listeners                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender context/options are untyped Record at the base class level
    override async _onRender(context: Record<string, unknown>, options: Record<string, unknown>): Promise<void> {
        await super._onRender(context, options);

        // Set up button listeners
        this.element.querySelector('#assign-damage')?.addEventListener('click', (e) => {
            void this._onAssignDamage(e);
        });
        this.element.querySelector('#cancel-prompt')?.addEventListener('click', (e) => {
            void this._onCancelPrompt(e);
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle assign damage button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onAssignDamage(event: Event): Promise<void> {
        event.preventDefault();
        await this._performRoll();
    }

    /* -------------------------------------------- */

    /**
     * Handle cancel button click.
     * @param {Event} event  The click event.
     * @protected
     */
    async _onCancelPrompt(event: Event): Promise<void> {
        event.preventDefault();
        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open an assign damage dialog.
 * @param {object} assignDamageData  The damage assignment data.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: assignDamageData is a plain legacy object passed from call sites; no narrower type available
export function prepareAssignDamageRoll(assignDamageData: Record<string, unknown>): void {
    const prompt = new AssignDamageDialog(assignDamageData);
    void prompt.render({ force: true });
}
