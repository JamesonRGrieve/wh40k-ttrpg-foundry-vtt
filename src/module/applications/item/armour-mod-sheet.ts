/**
 * @file ArmourModSheet - ApplicationV2 sheet for armour modification items
 */

import ContainerItemSheet from './container-item-sheet.ts';

interface ArmourModSystem {
    restrictions: { armourTypes: Set<string> };
    addedProperties: Set<string>;
    removedProperties: Set<string>;
    icon: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: modifiers is a free-form record consumed by templates
    modifiers: Record<string, unknown>;
    effect: string;
    notes: string;
    restrictionsLabelEnhanced: string;
    modifierSummary: string;
}

/**
 * Sheet for armour modification items.
 * Extends ContainerItemSheet to support embedded mods (if needed).
 */
export default class ArmourModSheet extends ContainerItemSheet {
    /** @override */
    static override DEFAULT_OPTIONS = {
        ...ContainerItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'armour-modification'],
        actions: {
            ...ContainerItemSheet.DEFAULT_OPTIONS.actions,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time
            toggleArmourType: ArmourModSheet.#onToggleArmourType,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time
            adjustModifier: ArmourModSheet.#onAdjustModifier,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time
            addProperty: ArmourModSheet.#onAddProperty,
            // eslint-disable-next-line @typescript-eslint/unbound-method -- Foundry V2 actions table receives method references and rebinds `this` to the sheet instance at dispatch time
            removeProperty: ArmourModSheet.#onRemoveProperty,
        },
        position: {
            width: 620,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
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
    /* eslint-disable no-restricted-syntax -- labels are WH40K.* localization keys; rule misfires on string literal form */
    static override TABS = [
        { tab: 'restrictions', group: 'primary', label: 'WH40K.Modification.Restrictions' },
        { tab: 'modifiers', group: 'primary', label: 'WH40K.Modification.Modifiers' },
        { tab: 'properties', group: 'primary', label: 'WH40K.Modification.Properties' },
        { tab: 'effect', group: 'primary', label: 'WH40K.Modification.Effect' },
    ];
    /* eslint-enable no-restricted-syntax */

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'restrictions',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext options/return are framework-defined free-form payloads
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.item.system DataModel doesn't expose ArmourModSystem-shaped properties to TS
        const system = this.item.system as unknown as ArmourModSystem;

        // Add CONFIG reference for template helpers
        context['dh'] = CONFIG.wh40k;

        // Add armour types config for restrictions
        const armourTypes = (CONFIG.wh40k as { armourTypes?: Record<string, { label: string }> }).armourTypes ?? {};
        context['armourTypes'] = armourTypes;
        context['armourTypesArray'] = Object.entries(armourTypes).map(([key, config]) => ({
            key,
            label: game.i18n.localize(config.label),
            selected: system.restrictions.armourTypes.has(key),
        }));

        // Add properties config
        const armourProperties = (CONFIG.wh40k as { armourProperties?: Record<string, { label: string; description: string }> }).armourProperties ?? {};
        context['armourProperties'] = armourProperties;

        // Prepare added properties array
        context['addedPropertiesArray'] = Array.from(system.addedProperties).map((key) => {
            const config = armourProperties[key] as { label: string; description: string } | undefined;
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : '',
            };
        });

        // Prepare removed properties array
        context['removedPropertiesArray'] = Array.from(system.removedProperties).map((key) => {
            const config = armourProperties[key] as { label: string; description: string } | undefined;
            return {
                key,
                label: config ? game.i18n.localize(config.label) : key,
                description: config ? game.i18n.localize(config.description) : '',
            };
        });

        // Available properties (not yet added or removed)
        const usedKeys = new Set([...Array.from(system.addedProperties), ...Array.from(system.removedProperties)]);
        context['availablePropertiesArray'] = Object.entries(armourProperties)
            .filter(([key]) => !usedKeys.has(key))
            .map(([key, config]) => ({
                key,
                label: game.i18n.localize(config.label),
                description: game.i18n.localize(config.description),
            }));

        return context;
    }

    /** @inheritDoc */
    /* eslint-disable no-restricted-syntax -- boundary: ApplicationV2 _preparePartContext context/return are framework-defined free-form payloads */
    override async _preparePartContext(
        partId: string,
        context: Record<string, unknown>,
        options: ApplicationV2Config.RenderOptions,
    ): Promise<Record<string, unknown>> {
        /* eslint-enable no-restricted-syntax */
        // Get shared context from _prepareContext
        const sharedContext = await this._prepareContext(options);
        const partContext = { ...sharedContext, ...context };
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.item.system DataModel doesn't expose ArmourModSystem-shaped properties to TS
        const system = this.item.system as unknown as ArmourModSystem;

        switch (partId) {
            case 'header':
                partContext['icon'] = system.icon;
                partContext['restrictionsSummary'] = system.restrictionsLabelEnhanced;
                partContext['modifiersSummary'] = system.modifierSummary;
                break;

            case 'restrictions':
                // Already prepared in _prepareContext
                break;

            case 'modifiers':
                partContext['modifiers'] = system.modifiers;
                break;

            case 'properties':
                // Already prepared in _prepareContext
                break;

            case 'effect':
                partContext['effect'] = system.effect;
                partContext['notes'] = system.notes;
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
    static async #onToggleArmourType(this: ArmourModSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const type = target.dataset['type'];
        if (type === undefined || type.length === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.item.system DataModel exposes armourTypes as Set but persisted form is array
        const system = this.item.system as unknown as { restrictions: { armourTypes: string[] | Set<string> } };
        const current = new Set(system.restrictions.armourTypes);

        if (current.has(type)) {
            current.delete(type);
        } else {
            current.add(type);
        }

        // If no types selected, default to "any"
        if (current.size === 0) {
            current.add('any');
        }

        await this.item.update({ 'system.restrictions.armourTypes': Array.from(current) });
    }

    /**
     * Handle adjusting a modifier value.
     * @param {ArmourModSheet} this
     * @param {PointerEvent} event  The triggering event
     * @param {HTMLElement} target  The target element
     */
    static async #onAdjustModifier(this: ArmourModSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const field = target.dataset['field'];
        if (field === undefined || field.length === 0) return;
        const delta = parseInt(target.dataset['delta'] ?? '0', 10);
        const current = (foundry.utils.getProperty(this.item.system, field) as number | undefined) ?? 0;

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
    static async #onAddProperty(this: ArmourModSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset['property'];
        const list = target.dataset['list']; // "added" or "removed"
        if (property === undefined || property.length === 0 || list === undefined || list.length === 0) return;
        const field = `${list}Properties` as 'addedProperties' | 'removedProperties';
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.item.system DataModel doesn't expose dynamic property indexing to TS
        const current = new Set((this.item.system as unknown as Record<'addedProperties' | 'removedProperties', string[]>)[field]);

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
    static async #onRemoveProperty(this: ArmourModSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset['property'];
        const list = target.dataset['list']; // "added" or "removed"
        if (property === undefined || property.length === 0 || list === undefined || list.length === 0) return;
        const field = `${list}Properties` as 'addedProperties' | 'removedProperties';
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.item.system DataModel doesn't expose dynamic property indexing to TS
        const current = new Set((this.item.system as unknown as Record<'addedProperties' | 'removedProperties', string[]>)[field]);

        current.delete(property);

        await this.item.update({
            [`system.${field}`]: Array.from(current),
        });
    }
}
