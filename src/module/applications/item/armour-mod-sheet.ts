/**
 * @file ArmourModSheet - ApplicationV2 sheet for armour modification items
 */

import ContainerItemSheet from './container-item-sheet.ts';
import type { WH40KItem } from '../../documents/item.ts';

/**
 * Sheet for armour modification items.
 * Extends ContainerItemSheet to support embedded mods (if needed).
 */
export default class ArmourModSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        ...ContainerItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'armour-modification'],
        actions: {
            ...ContainerItemSheet.DEFAULT_OPTIONS?.actions,
            toggleArmourType: ArmourModSheet.#onToggleArmourType,
            adjustModifier: ArmourModSheet.#onAdjustModifier,
            addProperty: ArmourModSheet.#onAddProperty,
            removeProperty: ArmourModSheet.#onRemoveProperty,
        },
        position: {
            width: 620,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        header: {
            template: 'systems/wh40k-rpg/templates/item/armour-mod-header.hbs',
        },
        tabs: {
            template: 'templates/generic/tab-navigation.hbs',
        },
        restrictions: {
            template: 'systems/wh40k-rpg/templates/item/armour-mod-restrictions.hbs',
            scrollable: [''],
        },
        modifiers: {
            template: 'systems/wh40k-rpg/templates/item/armour-mod-modifiers.hbs',
            scrollable: [''],
        },
        properties: {
            template: 'systems/wh40k-rpg/templates/item/armour-mod-properties.hbs',
            scrollable: [''],
        },
        effect: {
            template: 'systems/wh40k-rpg/templates/item/armour-mod-effect.hbs',
            scrollable: [''],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'restrictions', group: 'primary', label: 'WH40K.Modification.Restrictions' },
        { tab: 'modifiers', group: 'primary', label: 'WH40K.Modification.Modifiers' },
        { tab: 'properties', group: 'primary', label: 'WH40K.Modification.Properties' },
        { tab: 'effect', group: 'primary', label: 'WH40K.Modification.Effect' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'restrictions',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const system = this.item.system as unknown as {
            restrictions: { armourTypes: Set<string> };
            addedProperties: Set<string>;
            removedProperties: Set<string>;
            icon: string;
            modifiers: Record<string, unknown>;
            effect: string;
            notes: string;
            restrictionsLabelEnhanced: string;
            modifierSummary: string;
        };

        // Add CONFIG reference for template helpers
        context.dh = CONFIG.wh40k || {};

        // Add armour types config for restrictions
        const armourTypes = (CONFIG.wh40k as { armourTypes?: Record<string, { label: string }> })?.armourTypes || {};
        context.armourTypes = armourTypes;
        context.armourTypesArray = Object.entries(armourTypes).map(([key, config]) => ({
            key,
            label: game.i18n.localize(config.label),
            selected: system.restrictions.armourTypes.has(key),
        }));

        // Add properties config
        const armourProperties = (CONFIG.wh40k as { armourProperties?: Record<string, { label: string; description: string }> })?.armourProperties || {};
        context.armourProperties = armourProperties;

        // Prepare added properties array
        context.addedPropertiesArray = Array.from(system.addedProperties).map((key) => {
            const config = armourProperties[key];
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : '',
            };
        });

        // Prepare removed properties array
        context.removedPropertiesArray = Array.from(system.removedProperties).map((key) => {
            const config = armourProperties[key];
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : '',
            };
        });

        // Available properties (not yet added or removed)
        const usedKeys = new Set([...Array.from(system.addedProperties), ...Array.from(system.removedProperties)]);
        context.availablePropertiesArray = Object.entries(armourProperties)
            .filter(([key]) => !usedKeys.has(key))
            .map(([key, config]) => ({
                key,
                label: game.i18n.localize(config.label),
                description: game.i18n.localize(config.description),
            }));

        return context;
    }

    /** @inheritDoc */
    async _preparePartContext(partId: string, context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        // Get shared context from _prepareContext
        const sharedContext = await this._prepareContext(options);
        const partContext = { ...sharedContext, ...context };
        const system = this.item.system as unknown as {
            restrictions: { armourTypes: Set<string> };
            addedProperties: Set<string>;
            removedProperties: Set<string>;
            icon: string;
            modifiers: Record<string, unknown>;
            effect: string;
            notes: string;
            restrictionsLabelEnhanced: string;
            modifierSummary: string;
        };

        switch (partId) {
            case 'header':
                partContext.icon = system.icon;
                partContext.restrictionsSummary = system.restrictionsLabelEnhanced;
                partContext.modifiersSummary = system.modifierSummary;
                break;

            case 'restrictions':
                // Already prepared in _prepareContext
                break;

            case 'modifiers':
                partContext.modifiers = system.modifiers;
                break;

            case 'properties':
                // Already prepared in _prepareContext
                break;

            case 'effect':
                partContext.effect = system.effect || '';
                partContext.notes = system.notes || '';
                break;
        }

        return partContext;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle toggling an armour type restriction.
     * @param {ArmourModSheet} this
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onToggleArmourType(this: ArmourModSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const type = target.dataset.type;
        if (!type) return;
        const current = new Set((this.item.system as unknown as { restrictions: { armourTypes: string[] } }).restrictions.armourTypes);

        if (current.has(type)) {
            current.delete(type);
        } else {
            current.add(type);
        }

        // If no types selected, default to "any"
        if (current.size === 0) {
            current.add('any');
        }

        await this.item.update({
            'system.restrictions.armourTypes': Array.from(current),
        } as Record<string, unknown>);
    }

    /**
     * Handle adjusting a modifier value.
     * @param {ArmourModSheet} this
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onAdjustModifier(this: ArmourModSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const field = target.dataset.field;
        if (!field) return;
        const delta = parseInt(target.dataset.delta || '0', 10);
        const current = foundry.utils.getProperty(this.item.system as object, field) || 0;

        await this.item.update({
            [`system.${field}`]: Number(current) + delta,
        });
    }

    /**
     * Handle adding a property.
     * @param {ArmourModSheet} this
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onAddProperty(this: ArmourModSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset.property;
        const list = target.dataset.list; // "added" or "removed"
        if (!property || !list) return;
        const field = `${list}Properties` as 'addedProperties' | 'removedProperties';
        const current = new Set((this.item.system as { [key: string]: string[] })[field]);

        current.add(property);

        await this.item.update({
            [`system.${field}`]: Array.from(current),
        });
    }

    /**
     * Handle removing a property.
     * @param {ArmourModSheet} this
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onRemoveProperty(this: ArmourModSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset.property;
        const list = target.dataset.list; // "added" or "removed"
        if (!property || !list) return;
        const field = `${list}Properties` as 'addedProperties' | 'removedProperties';
        const current = new Set((this.item.system as { [key: string]: string[] })[field]);

        current.delete(property);

        await this.item.update({
            [`system.${field}`]: Array.from(current),
        });
    }
}
