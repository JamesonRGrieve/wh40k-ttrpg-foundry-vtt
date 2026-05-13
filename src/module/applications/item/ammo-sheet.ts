/**
 * @file AmmoSheet - ApplicationV2 sheet for ammunition items
 */

import type AmmunitionData from '../../data/item/ammunition.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import BaseItemSheet from './base-item-sheet.ts';

/** Ammunition item with its system data typed to the AmmunitionData DataModel. */
type AmmoItem = WH40KItemDocument & { system: AmmunitionData };

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_MODIFIERS = 'WH40K.Tabs.Modifiers';
const TAB_LABEL_COMPATIBILITY = 'WH40K.Tabs.Compatibility';
const TAB_LABEL_QUALITIES = 'WH40K.Tabs.Qualities';
const TAB_LABEL_DETAILS = 'WH40K.Tabs.Details';

/**
 * Sheet for ammunition items.
 * Displays modifiers with stat bar and weapon compatibility.
 */
export default class AmmoSheet extends BaseItemSheet {
    /** Narrow the inherited item document to its ammunition DataModel shape. */
    override get item(): AmmoItem {
        return super.item as AmmoItem;
    }

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        ...BaseItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'ammunition'],
        position: {
            width: 580,
            height: 660,
        },
        actions: {
            ...BaseItemSheet.DEFAULT_OPTIONS.actions,
            addQuality: AmmoSheet.#addQuality,
            removeAddedQuality: AmmoSheet.#removeAddedQuality,
            removeRemovedQuality: AmmoSheet.#removeRemovedQuality,
        },
    } satisfies typeof BaseItemSheet.DEFAULT_OPTIONS & Partial<ApplicationV2Config.DefaultOptions>;
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-ammo-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'modifiers', group: 'primary', label: TAB_LABEL_MODIFIERS },
        { tab: 'compatibility', group: 'primary', label: TAB_LABEL_COMPATIBILITY },
        { tab: 'qualities', group: 'primary', label: TAB_LABEL_QUALITIES },
        { tab: 'details', group: 'primary', label: TAB_LABEL_DETAILS },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups: Record<string, string> = {
        primary: 'modifiers',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext returns free-form template context; Record<string, unknown> is the required base shape
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add CONFIG reference for templates
        context['CONFIG'] = CONFIG;

        // Add helper for Set checking
        context['setIncludes'] = (value: string, set: Set<string>) => set.has(value);
        context['setToArray'] = (set: Set<string>) => Array.from(set);

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Add a quality to added or removed list.
     */
    static async #addQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const type = target.dataset['type']; // 'added' or 'removed'
        const input = this.element.querySelector<HTMLInputElement>(`[name="new-${type}-quality"]`);
        const quality = input?.value.trim() ?? '';

        if (quality === '') return;

        const field = type === 'added' ? 'addedQualities' : 'removedQualities';
        const qualities = new Set(this.item.system[field]);
        qualities.add(quality);

        await this.item.update({ [`system.${field}`]: Array.from(qualities) });

        // Clear input
        if (input !== null) input.value = '';
    }

    /**
     * Remove a quality from the added list.
     */
    static async #removeAddedQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const quality = target.dataset['quality'];
        const qualities = new Set(this.item.system.addedQualities);
        if (quality !== undefined) qualities.delete(quality);

        await this.item.update({ 'system.addedQualities': Array.from(qualities) });
    }

    /**
     * Remove a quality from the removed list.
     */
    static async #removeRemovedQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const quality = target.dataset['quality'];
        const qualities = new Set(this.item.system.removedQualities);
        if (quality !== undefined) qualities.delete(quality);

        await this.item.update({ 'system.removedQualities': Array.from(qualities) });
    }
}
