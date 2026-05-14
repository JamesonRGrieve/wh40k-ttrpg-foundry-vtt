/**
 * @file GearSheet - ApplicationV2 sheet for gear/consumable/drug/tool items
 */

import type GearData from '../../data/item/gear.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import BaseItemSheet from './base-item-sheet.ts';

/** Gear item with its system data typed to the GearData DataModel. */
type GearItem = WH40KItemDocument & { system: GearData };

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
    /** Narrow the inherited item document to its gear DataModel shape. */
    override get item(): GearItem {
        return super.item as GearItem;
    }

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
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
    /* eslint-enable @typescript-eslint/unbound-method */

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
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext returns free-form template context; Record<string, unknown> is the required base shape
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add gear-specific computed properties to context
        context['categoryLabel'] = this.item.system.categoryLabel;
        context['categoryIcon'] = this.item.system.categoryIcon;
        context['hasLimitedUses'] = this.item.system.hasLimitedUses;
        context['usesExhausted'] = this.item.system.usesExhausted;
        context['usesDisplay'] = this.item.system.usesDisplay;

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
    static async #onResetUses(this: GearSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this.item.system.resetUses();
    }

    /**
     * Handle consume use action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onConsumeUse(this: GearSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this.item.system.consume();
    }
}
