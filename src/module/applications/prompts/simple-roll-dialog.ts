/**
 * @file SimpleRollDialog - V2 dialog for simple skill/characteristic rolls
 */

import type { ActionData } from '../../rolls/action-data.ts';
import { sendActionDataToChat } from '../../rolls/roll-helpers.ts';
import BaseRollDialog from './base-roll-dialog.ts';

/**
 * Dialog for configuring simple skill or characteristic rolls.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog options are passed through to ApplicationV2 super; no narrower type available
type SimpleRollDialogOptions = Record<string, unknown>;

export default class SimpleRollDialog extends BaseRollDialog {
    simpleSkillData: ActionData;

    constructor(simpleSkillData: ActionData, options: SimpleRollDialogOptions = {}) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseRollDialog ctor accepts rollData as Record<string, unknown>; ActionData is the concrete type at call sites
        super(simpleSkillData as unknown as Record<string, unknown>, options);
        this.simpleSkillData = simpleSkillData;
    }

    /* -------------------------------------------- */

    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['simple-roll'],
        position: {
            width: 300,
        },
        window: {
            // eslint-disable-next-line no-restricted-syntax -- i18n: WH40K localization key resolved at runtime; rule fires on any literal in this position
            title: 'WH40K.Dialog.RollModifierTitle',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/prompt/simple-roll-prompt.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */
    /*  Roll Methods                                */
    /* -------------------------------------------- */

    /** @override */
    override async _performRoll(): Promise<void> {
        const form = this.element.querySelector('form') ?? this.element;
        const rollData = this.simpleSkillData.rollData;

        const difficultySelect = form.querySelector<HTMLSelectElement>('#difficulty');
        const modifierInput = form.querySelector<HTMLInputElement>('#modifier');

        rollData.modifiers['difficulty'] = parseInt(difficultySelect?.value ?? '0', 10);
        rollData.modifiers['modifier'] = parseInt(modifierInput?.value ?? '0', 10);

        await rollData.calculateTotalModifiers();
        // eslint-disable-next-line no-restricted-syntax -- boundary: ActionData.calculateSuccessOrFailure exists at runtime but is not declared on the TS type
        await (this.simpleSkillData as unknown as { calculateSuccessOrFailure: () => Promise<void> }).calculateSuccessOrFailure();
        await sendActionDataToChat(this.simpleSkillData);

        await this.close();
    }
}

/* -------------------------------------------- */
/*  Helper Function                             */
/* -------------------------------------------- */

/**
 * Open a simple roll dialog.
 * @param {object} simpleSkillData  The skill data.
 */
export function prepareSimpleRoll(simpleSkillData: ActionData): void {
    const prompt = new SimpleRollDialog(simpleSkillData);
    void prompt.render({ force: true });
}
