/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["armour"],
        position: {
            width: 520,
            height: 480
        },
        actions: {
            toggleCoverage: ArmourSheet.#toggleCoverage,
            addProperty: ArmourSheet.#addProperty,
            removeProperty: ArmourSheet.#removeProperty
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-armour-sheet-modern.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "protection", group: "primary", label: "Protection" },
        { tab: "description", group: "primary", label: "Description" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "protection"
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
        context.availableProperties = CONFIG.ROGUE_TRADER?.armourProperties || {};
        context.apSummary = this.item.system.apSummary;
        context.coverageLabel = this.item.system.coverageLabel;
        context.coverageIcons = this.item.system.coverageIcons;
        context.propertyLabels = this.item.system.propertyLabels;
        
        // Convert coverage Set to array for template
        context.coverageArray = Array.from(this.item.system.coverage || []);
        
        return context;
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
        if (location === "all") {
            if (coverage.has("all")) {
                coverage.clear();
                // Add individual locations instead
                ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"].forEach(loc => coverage.add(loc));
            } else {
                coverage.clear();
                coverage.add("all");
            }
        } else {
            // Remove "all" if present
            coverage.delete("all");
            
            // Toggle specific location
            if (coverage.has(location)) {
                coverage.delete(location);
            } else {
                coverage.add(location);
            }
            
            // If all locations are now covered, use "all"
            const allLocations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
            if (allLocations.every(loc => coverage.has(loc))) {
                coverage.clear();
                coverage.add("all");
            }
        }
        
        // Ensure at least one location
        if (coverage.size === 0) {
            coverage.add("body");
        }
        
        await this.item.update({ "system.coverage": Array.from(coverage) });
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
        
        await this.item.update({ "system.properties": Array.from(properties) });
        
        // Reset select
        if (select) select.value = "";
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
        
        await this.item.update({ "system.properties": Array.from(properties) });
    }
}
