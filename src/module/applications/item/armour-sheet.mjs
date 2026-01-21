/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import ContainerItemSheet from './container-item-sheet.mjs';

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'armour'],
        position: {
            width: 560,
            height: 580,
        },
        actions: {
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
            template: 'systems/rogue-trader/templates/item/item-armour-sheet-v2.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'protection', group: 'primary', label: 'Protection' },
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'mods', group: 'primary', label: 'Modifications' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'protection',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add armour-specific context
        context.armourTypes = CONFIG.ROGUE_TRADER?.armourTypes || {};
        context.bodyLocations = CONFIG.ROGUE_TRADER?.bodyLocations || {};
        context.availableProperties = this._getAvailableProperties();
        context.apSummary = this.item.system.apSummary;
        context.coverageLabel = this.item.system.coverageLabel;
        context.coverageIcons = this.item.system.coverageIcons;
        context.propertyLabels = this.item.system.propertyLabels;

        // Convert coverage Set to array for template
        context.coverageArray = Array.from(this.item.system.coverage || []);

        // Add propertiesArray for safe template access
        context.propertiesArray = this.item.system.propertiesArray || [];

        // Add modifications array for safe template access
        context.modificationsArray = this.item.system.modifications || [];

        return context;
    }

    /**
     * Get available properties with localized labels.
     * @returns {Object}
     * @private
     */
    _getAvailableProperties() {
        const props = {};
        const available = ['sealed', 'auto-stabilized', 'hexagrammic', 'blessed', 'camouflage', 'lightweight', 'reinforced', 'agility-bonus', 'strength-bonus'];

        for (const id of available) {
            // Skip already-added properties
            if (this.item.system.properties.has(id)) continue;

            const pascalCase = id
                .split('-')
                .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                .join('');
            props[id] = {
                label: game.i18n.localize(`RT.ArmourProperty.${pascalCase}`),
            };
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle coverage for a body location.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #toggleCoverage(event, target) {
        const location = target.dataset.location;
        const coverage = new Set(this.item.system.coverage || []);

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
        } else {
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
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #addProperty(event, target) {
        const select = this.element.querySelector("[name='new-property']");
        const property = select?.value;
        if (!property) return;

        const properties = new Set(this.item.system.properties || []);
        properties.add(property);

        await this.item.update({ 'system.properties': Array.from(properties) });

        // Reset select
        if (select) select.value = '';
    }

    /**
     * Remove a special property.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #removeProperty(event, target) {
        const property = target.dataset.property;
        const properties = new Set(this.item.system.properties || []);
        properties.delete(property);

        await this.item.update({ 'system.properties': Array.from(properties) });
    }

    /**
     * Add a modification to the armour.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #addModification(event, target) {
        // Check if slots available
        if (this.item.system.availableModSlots <= 0) {
            ui.notifications.warn(game.i18n.localize('RT.Armour.NoSlotsAvailable'));
            return;
        }

        // Open compendium browser or item picker
        ui.notifications.info(game.i18n.localize('RT.Armour.DragModification'));
    }

    /**
     * Edit a modification.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #editMod(event, target) {
        const index = parseInt(target.dataset.modIndex);
        const mod = this.item.system.modifications[index];
        if (!mod?.uuid) return;

        try {
            const item = await fromUuid(mod.uuid);
            if (item) item.sheet.render(true);
        } catch (err) {
            console.error('Failed to open modification:', err);
        }
    }

    /**
     * Remove a modification from the armour.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #removeMod(event, target) {
        const index = parseInt(target.dataset.modIndex);
        const modifications = [...this.item.system.modifications];
        modifications.splice(index, 1);

        await this.item.update({ 'system.modifications': modifications });
    }
}
