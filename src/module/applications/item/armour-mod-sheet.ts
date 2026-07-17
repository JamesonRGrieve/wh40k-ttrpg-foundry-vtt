/**
 * @file ArmourModSheet - ApplicationV2 sheet for armour modification items
 */

import SetFieldActionsMixin from '../api/set-field-actions-mixin.ts';
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
export default class ArmourModSheet extends SetFieldActionsMixin(ContainerItemSheet) {
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
    static override TABS = [
        { tab: 'restrictions', group: 'primary', label: 'WH40K.Modification.Restrictions' },
        { tab: 'modifiers', group: 'primary', label: 'WH40K.Modification.Modifiers' },
        { tab: 'properties', group: 'primary', label: 'WH40K.Modification.Properties' },
        { tab: 'effect', group: 'primary', label: 'WH40K.Modification.Effect' },
    ];

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
        // #429: project config option maps into row arrays via the shared mixin helper
        // (which also owns the add/remove mutation side), replacing three hand-rolled
        // Object.entries/Array.from(...).map projections.
        context['armourTypesArray'] = this.projectSetOptions(armourTypes, { selected: system.restrictions.armourTypes });

        // Add properties config
        const armourProperties = (CONFIG.wh40k as { armourProperties?: Record<string, { label: string; description: string }> }).armourProperties ?? {};
        context['armourProperties'] = armourProperties;

        context['addedPropertiesArray'] = this.projectSetOptions(armourProperties, { only: system.addedProperties });
        context['removedPropertiesArray'] = this.projectSetOptions(armourProperties, { only: system.removedProperties });

        // Available properties (not yet added or removed).
        const usedKeys = new Set([...system.addedProperties, ...system.removedProperties]);
        context['availablePropertiesArray'] = this.projectSetOptions(armourProperties, { exclude: usedKeys });

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

        if (partId === 'header') {
            partContext['icon'] = system.icon;
            partContext['restrictionsSummary'] = system.restrictionsLabelEnhanced;
            partContext['modifiersSummary'] = system.modifierSummary;
        } else if (partId === 'modifiers') {
            partContext['modifiers'] = system.modifiers;
        } else if (partId === 'effect') {
            partContext['effect'] = system.effect;
            partContext['notes'] = system.notes;
        }
        // 'restrictions' and 'properties' are already prepared in _prepareContext

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
        const current = this.readSetField('restrictions.armourTypes');

        if (current.has(type)) {
            current.delete(type);
        } else {
            current.add(type);
        }

        // If no types selected, default to "any"
        if (current.size === 0) {
            current.add('any');
        }

        await this.writeSetField('restrictions.armourTypes', current);
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
        await this.addToSetField(`${list}Properties`, property);
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
        await this.removeFromSetField(`${list}Properties`, property);
    }
}
