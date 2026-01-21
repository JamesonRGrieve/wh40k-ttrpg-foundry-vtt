/**
 * @file ArmourModSheet - ApplicationV2 sheet for armour modification items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for armour modification items.
 * Extends ContainerItemSheet to support embedded mods (if needed).
 */
export default class ArmourModSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "sheet", "item", "armour-modification"],
        actions: {
            toggleArmourType: ArmourModSheet.#onToggleArmourType,
            adjustModifier: ArmourModSheet.#onAdjustModifier,
            addProperty: ArmourModSheet.#onAddProperty,
            removeProperty: ArmourModSheet.#onRemoveProperty
        },
        position: {
            width: 620,
            height: 720
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/item/armour-mod-header.hbs"
        },
        tabs: {
            template: "templates/generic/tab-navigation.hbs"
        },
        restrictions: {
            template: "systems/rogue-trader/templates/item/armour-mod-restrictions.hbs",
            scrollable: [""]
        },
        modifiers: {
            template: "systems/rogue-trader/templates/item/armour-mod-modifiers.hbs",
            scrollable: [""]
        },
        properties: {
            template: "systems/rogue-trader/templates/item/armour-mod-properties.hbs",
            scrollable: [""]
        },
        effect: {
            template: "systems/rogue-trader/templates/item/armour-mod-effect.hbs",
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "restrictions", group: "primary", label: "RT.Modification.Restrictions" },
        { tab: "modifiers", group: "primary", label: "RT.Modification.Modifiers" },
        { tab: "properties", group: "primary", label: "RT.Modification.Properties" },
        { tab: "effect", group: "primary", label: "RT.Modification.Effect" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "restrictions"
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add CONFIG reference for template helpers
        context.dh = CONFIG.rt || {};
        
        // Add armour types config for restrictions
        context.armourTypes = CONFIG.rt?.armourTypes || {};
        context.armourTypesArray = Object.entries(context.armourTypes).map(([key, config]) => ({
            key,
            label: game.i18n.localize(config.label),
            selected: this.item.system.restrictions.armourTypes.has(key)
        }));
        
        // Add properties config
        context.armourProperties = CONFIG.rt?.armourProperties || {};
        
        // Prepare added properties array
        context.addedPropertiesArray = Array.from(this.item.system.addedProperties).map(key => {
            const config = context.armourProperties[key];
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : ""
            };
        });
        
        // Prepare removed properties array
        context.removedPropertiesArray = Array.from(this.item.system.removedProperties).map(key => {
            const config = context.armourProperties[key];
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : ""
            };
        });
        
        // Available properties (not yet added or removed)
        const usedKeys = new Set([
            ...this.item.system.addedProperties,
            ...this.item.system.removedProperties
        ]);
        context.availablePropertiesArray = Object.entries(context.armourProperties)
            .filter(([key]) => !usedKeys.has(key))
            .map(([key, config]) => ({
                key,
                label: game.i18n.localize(config.label),
                description: game.i18n.localize(config.description)
            }));
        
        return context;
    }

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
        // Get shared context from _prepareContext
        const sharedContext = await this._prepareContext(options);
        context = { ...sharedContext, ...context };
        
        switch (partId) {
            case "header":
                context.icon = this.item.system.icon;
                context.restrictionsSummary = this.item.system.restrictionsLabelEnhanced;
                context.modifiersSummary = this.item.system.modifierSummary;
                break;
            
            case "restrictions":
                // Already prepared in _prepareContext
                break;
            
            case "modifiers":
                context.modifiers = this.item.system.modifiers;
                break;
            
            case "properties":
                // Already prepared in _prepareContext
                break;
            
            case "effect":
                context.effect = this.item.system.effect || "";
                context.notes = this.item.system.notes || "";
                break;
        }
        
        return context;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle toggling an armour type restriction.
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onToggleArmourType(event, target) {
        const type = target.dataset.type;
        const current = new Set(this.item.system.restrictions.armourTypes);
        
        if (current.has(type)) {
            current.delete(type);
        } else {
            current.add(type);
        }
        
        // If no types selected, default to "any"
        if (current.size === 0) {
            current.add("any");
        }
        
        await this.item.update({
            "system.restrictions.armourTypes": Array.from(current)
        });
    }

    /**
     * Handle adjusting a modifier value.
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onAdjustModifier(event, target) {
        const field = target.dataset.field;
        const delta = parseInt(target.dataset.delta);
        const current = foundry.utils.getProperty(this.item.system, field) || 0;
        
        await this.item.update({
            [`system.${field}`]: current + delta
        });
    }

    /**
     * Handle adding a property.
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onAddProperty(event, target) {
        const property = target.dataset.property;
        const list = target.dataset.list; // "added" or "removed"
        const field = `${list}Properties`;
        const current = new Set(this.item.system[field]);
        
        current.add(property);
        
        await this.item.update({
            [`system.${field}`]: Array.from(current)
        });
    }

    /**
     * Handle removing a property.
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onRemoveProperty(event, target) {
        const property = target.dataset.property;
        const list = target.dataset.list; // "added" or "removed"
        const field = `${list}Properties`;
        const current = new Set(this.item.system[field]);
        
        current.delete(property);
        
        await this.item.update({
            [`system.${field}`]: Array.from(current)
        });
    }
}
