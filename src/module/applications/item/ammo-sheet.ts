/**
 * @gulpfile.js AmmoSheet - ApplicationV2 sheet for ammunition items
 */

import BaseItemSheet from './base-item-sheet.ts';
import type AmmunitionData from '../../data/item/ammunition.ts';

// Explicitly type static members to resolve TS2417.
// This assumes BaseItemSheet follows ApplicationV2 conventions for static members.
// The actual definition of BaseItemSheet is not provided, so we infer types
// from ApplicationV2Config and HandlebarsApplicationV14 in foundry-v14-overrides.d.ts.
// NOTE: The original error `TS2417: Class static side 'typeof AmmoSheet' incorrectly extends base class static side 'typeof BaseItemSheet'`
// suggests a structural incompatibility between the static members of AmmoSheet and BaseItemSheet.
// Without the definition of BaseItemSheet, we are making an educated guess based on standard Foundry VTT V14 application patterns.
// We are explicitly typing the static properties according to their expected structure in ApplicationV2.
// The `as unknown as ...` cast is used for Typescript2352 errors as per instructions.

/**
 * Sheet for ammunition items.
 * Displays modifiers with stat bar and weapon compatibility.
 */
export default class AmmoSheet extends BaseItemSheet {
    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS: ApplicationV2Config.DefaultOptions = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'ammunition'],
        position: {
            width: 580,
            height: 660,
        },
        actions: {
            addQuality: AmmoSheet.#addQuality,
            removeAddedQuality: AmmoSheet.#removeAddedQuality,
            removeRemovedQuality: AmmoSheet.#removeRemovedQuality,
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-ammo-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'modifiers', group: 'primary', label: 'Modifiers' },
        { tab: 'compatibility', group: 'primary', label: 'Compatibility' },
        { tab: 'qualities', group: 'primary', label: 'Qualities' },
        { tab: 'details', group: 'primary', label: 'Details' },
    ];

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    tabGroups: Record<string, string> = {
        primary: 'modifiers',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
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
        const input = this.element.querySelector(`[name="new-${type}-quality"]`) as HTMLInputElement | null;
        const quality = input?.value?.trim();

        if (!quality) return;

        const field = type === 'added' ? 'addedQualities' : 'removedQualities';
        // TS2352: Conversion of type 'WH40KItemSystemData' to type 'AmmunitionData' may be a mistake
        const sys = this.item.system as unknown as AmmunitionData;
        // TS2352: Conversion of type 'Set<string>' to type 'string[]' may be a mistake
        const qualities = new Set((sys[field] as unknown as string[]) || []);
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
        // TS2352: Conversion of type 'WH40KItemSystemData' to type 'AmmunitionData' may be a mistake
        const sys = this.item.system as unknown as AmmunitionData;
        // TS2352: Conversion of type 'Set<string>' to type 'string[]' may be a mistake
        const qualities = new Set((sys.addedQualities as unknown as string[]) || []);
        if (quality) qualities.delete(quality);

        await this.item.update({ 'system.addedQualities': Array.from(qualities) });
    }

    /**
     * Remove a quality from the removed list.
     */
    static async #removeRemovedQuality(this: AmmoSheet, event: Event, target: HTMLElement): Promise<void> {
        const quality = target.dataset.quality;
        // TS2352: Conversion of type 'WH40KItemSystemData' to type 'AmmunitionData' may be a mistake
        const sys = this.item.system as unknown as AmmunitionData;
        // TS2352: Conversion of type 'Set<string>' to type 'string[]' may be a mistake
        const qualities = new Set((sys.removedQualities as unknown as string[]) || []);
        if (quality) qualities.delete(quality);

        await this.item.update({ 'system.removedQualities': Array.from(qualities) });
    }
}
