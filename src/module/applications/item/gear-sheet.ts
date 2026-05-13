/**
 * @file GearSheet - ApplicationV2 sheet for gear/consumable/drug/tool items
 */

import BaseItemSheet from './base-item-sheet.ts';

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_OVERVIEW = 'WH40K.Tabs.Overview';
const TAB_LABEL_USAGE = 'WH40K.Tabs.Usage';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/**
 * Sheet for gear items (consumables, drugs, tools, etc.).
 */
// @ts-expect-error - TS2417 static side inheritance
export default class GearSheet extends BaseItemSheet {
    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'gear'],
        actions: {
            resetUses: GearSheet.#onResetUses,
            consumeUse: GearSheet.#onConsumeUse,
        },
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-gear-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'overview', group: 'primary', label: TAB_LABEL_OVERVIEW },
        { tab: 'usage', group: 'primary', label: TAB_LABEL_USAGE },
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add gear-specific computed properties to context
        context['categoryLabel'] = this.item.system['categoryLabel'];
        context['categoryIcon'] = this.item.system['categoryIcon'];
        context['hasLimitedUses'] = this.item.system['hasLimitedUses'];
        context['usesExhausted'] = this.item.system['usesExhausted'];
        context['usesDisplay'] = this.item.system['usesDisplay'];

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle reset uses action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary: ApplicationV2 static action handler `this` type is not known statically
    static async #onResetUses(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.item.system.resetUses();
    }

    /**
     * Handle consume use action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- boundary: ApplicationV2 static action handler `this` type is not known statically
    static async #onConsumeUse(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.item.system.consume();
    }
}
