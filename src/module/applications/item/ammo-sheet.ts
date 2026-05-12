/**
 * @file AmmoSheet - ApplicationV2 sheet for ammunition items
 */

import type AmmunitionData from '../../data/item/ammunition.ts';
import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for ammunition items.
 * Displays modifiers with stat bar and weapon compatibility.
 */
export default class AmmoSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...BaseItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'ammunition'],
        position: {
            width: 580,
            height: 660,
        },
        actions: {
            ...BaseItemSheet.DEFAULT_OPTIONS?.actions,
            addQuality: AmmoSheet.#addQuality,
            removeAddedQuality: AmmoSheet.#removeAddedQuality,
            removeRemovedQuality: AmmoSheet.#removeRemovedQuality,
        },
    } satisfies typeof BaseItemSheet.DEFAULT_OPTIONS & Partial<ApplicationV2Config.DefaultOptions>;

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-ammo-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'modifiers', group: 'primary', label: 'Modifiers' },
        { tab: 'compatibility', group: 'primary', label: 'Compatibility' },
        { tab: 'qualities', group: 'primary', label: 'Qualities' },
        { tab: 'details', group: 'primary', label: 'Details' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups: Record<string, string> = {
        primary: 'modifiers',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add CONFIG reference for templates
        context.CONFIG = CONFIG;

        // Add helper for Set checking
        context.setIncludes = (value: string, set: Set<string>) => set && set.has(value);
        context.setToArray = (set: Set<string>) => Array.from(set || []);

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Add a quality to added or removed list.
     */
    static async #addQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const type = target.dataset.type; // 'added' or 'removed'
        const input = this.element.querySelector<HTMLInputElement>(`[name="new-${type}-quality"]`);
        const quality = input?.value?.trim();

        if (!quality) return;

        const field = type === 'added' ? 'addedQualities' : 'removedQualities';
        const sys = this.item.system as unknown as AmmunitionData;
        const qualities = new Set(sys[field] || []);
        qualities.add(quality);

        await this.item.update({ [`system.${field}`]: Array.from(qualities) });

        // Clear input
        if (input) input.value = '';
    }

    /**
     * Remove a quality from the added list.
     */
    static async #removeAddedQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const quality = target.dataset.quality;
        const sys = this.item.system as unknown as AmmunitionData;
        const qualities = new Set(sys.addedQualities || []);
        if (quality) qualities.delete(quality);

        await this.item.update({ 'system.addedQualities': Array.from(qualities) });
    }

    /**
     * Remove a quality from the removed list.
     */
    static async #removeRemovedQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const quality = target.dataset.quality;
        const sys = this.item.system as unknown as AmmunitionData;
        const qualities = new Set(sys.removedQualities || []);
        if (quality) qualities.delete(quality);

        await this.item.update({ 'system.removedQualities': Array.from(qualities) });
    }
}
