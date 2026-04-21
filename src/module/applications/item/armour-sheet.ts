/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import ContainerItemSheet from './container-item-sheet.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { default as ArmourDataModel } from '../../data/item/armour.ts';

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'armour'],
        position: {
            width: 560,
            height: 580,
        },
        actions: {
            ...ContainerItemSheet.DEFAULT_OPTIONS?.actions,
            toggleCoverage: ArmourSheet.#toggleCoverage,
            addProperty: ArmourSheet.#addProperty,
            removeProperty: ArmourSheet.#removeProperty,
            addModification: ArmourSheet.#addModification,
            editMod: ArmourSheet.#editMod,
            removeMod: ArmourSheet.#removeMod,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-armour-sheet-v2.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'protection', group: 'primary', label: 'Protection' },
        { tab: 'mods', group: 'primary', label: 'Modifications' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups: Record<string, string> = {
        primary: 'protection',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const sys = this.item.system as ArmourDataModel;

        // Add armour-specific context
        context.armourTypes = CONFIG.WH40K?.armourTypes || {};
        context.bodyLocations = CONFIG.WH40K?.bodyLocations || {};
        context.availableProperties = this._getAvailableProperties();
        context.apSummary = sys.apSummary;
        context.coverageLabel = sys.coverageLabel;
        context.coverageIcons = sys.coverageIcons;
        context.propertyLabels = sys.propertyLabels;

        // Convert coverage Set to array for template
        context.coverageArray = Array.from(sys.coverage || []);

        // Add propertiesArray for safe template access
        context.propertiesArray = Array.from(sys.properties || []);

        // Add modifications array for safe template access
        context.modificationsArray = sys.modifications || [];

        return context;
    }

    /**
     * Get available properties with localized labels.
     */
    _getAvailableProperties(): Record<string, { label: string }> {
        const props: Record<string, { label: string }> = {};
        const available = ['sealed', 'auto-stabilized', 'hexagrammic', 'blessed', 'camouflage', 'lightweight', 'reinforced', 'agility-bonus', 'strength-bonus'];
        const sys = this.item.system as ArmourDataModel;

        for (const id of available) {
            // Skip already-added properties
            if (sys.properties.has(id)) continue;

            const pascalCase = id
                .split('-')
                .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                .join('');
            props[id] = {
                label: game.i18n.localize(`WH40K.ArmourProperty.${pascalCase}`),
            };
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle coverage for a body location.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #toggleCoverage(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const location = target.dataset.location;
        const sys = this.item.system as ArmourDataModel;
        const coverage = new Set(sys.coverage || []);

        // Handle "all" special case
        if (location === 'all') {
            if (coverage.has('all')) {
                coverage.clear();
                // Add individual locations instead
                ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].forEach((loc) => coverage.add(loc));
            } else {
                coverage.clear();
                coverage.add('all');
            }
        } else if (location) {
            // Remove "all" if present
            coverage.delete('all');

            // Toggle specific location
            if (coverage.has(location)) {
                coverage.delete(location);
            } else {
                coverage.add(location);
            }

            // If all locations are now covered, use "all"
            const allLocations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
            if (allLocations.every((loc) => coverage.has(loc))) {
                coverage.clear();
                coverage.add('all');
            }
        }

        // Ensure at least one location
        if (coverage.size === 0) {
            coverage.add('body');
        }

        await this.item.update({ 'system.coverage': Array.from(coverage) });
    }

    /**
     * Add a special property.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #addProperty(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const select = this.element.querySelector("[name='new-property']") as HTMLSelectElement | null;
        const property = select?.value;
        if (!property) return;

        const sys = this.item.system as ArmourDataModel;
        const properties = new Set(sys.properties || []);
        properties.add(property);

        await this.item.update({ 'system.properties': Array.from(properties) });

        // Reset select
        if (select) select.value = '';
    }

    /**
     * Remove a special property.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #removeProperty(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset.property;
        const sys = this.item.system as ArmourDataModel;
        const properties = new Set(sys.properties || []);
        if (property) properties.delete(property);

        await this.item.update({ 'system.properties': Array.from(properties) });
    }

    /**
     * Add a modification to the armour.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #addModification(this: ArmourSheet, event: Event, target: HTMLElement): void {
        const sys = this.item.system as ArmourDataModel;
        // Check if slots available
        if (sys.availableModSlots <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.Armour.NoSlotsAvailable'));
            return;
        }

        // Open compendium browser or item picker
        ui.notifications.info(game.i18n.localize('WH40K.Armour.DragModification'));
    }

    /**
     * Edit a modification.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #editMod(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.modIndex ?? '', 10);
        const sys = this.item.system as ArmourDataModel;
        const mod = sys.modifications[index];
        if (!mod?.uuid) return;

        try {
            const item = (await fromUuid(mod.uuid)) as any;
            if (item && item.sheet) item.sheet.render(true);
        } catch (err) {
            console.error('Failed to open modification:', err);
        }
    }

    /**
     * Remove a modification from the armour.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #removeMod(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset.modIndex ?? '', 10);
        const sys = this.item.system as ArmourDataModel;
        const modifications = [...sys.modifications];
        modifications.splice(index, 1);

        await this.item.update({ 'system.modifications': modifications });
    }
}
