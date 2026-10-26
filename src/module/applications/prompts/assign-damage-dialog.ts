/**
 * @file AssignDamageDialog - V2 dialog for damage assignment
 */

import { readVehicleDurability } from '../../rolls/vehicle-strike.ts';
import { hitDropdown, vehicleHitDropdown } from '../../rules/hit-locations.ts';
import BaseRollDialog, { type RollDialogFooterSubmit } from './base-roll-dialog.ts';

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

    /** The assignment form, with the base dialog's footer: Apply / Cancel (#698). */
    static override PARTS = {
        ...BaseRollDialog.PARTS,
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
        // A vehicle (content#28) takes its own locations, and shows Structural Integrity in place of wounds.
        const context = await super._prepareContext(options);
        const actor = this.rollData['actor'];
        const vehicle = typeof actor === 'object' && actor !== null && 'system' in actor ? readVehicleDurability(actor.system) : null;
        return { ...context, locations: vehicle === null ? hitDropdown() : vehicleHitDropdown(), vehicle };
    }

    /* -------------------------------------------- */

    /** The footer applies the damage rather than rolling it (#698). */
    override _footerSubmit(): RollDialogFooterSubmit {
        return { labelKey: 'WH40K.Common.Apply', icon: 'fa-check' };
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
