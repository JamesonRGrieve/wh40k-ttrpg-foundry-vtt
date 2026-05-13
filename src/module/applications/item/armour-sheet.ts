/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import type ArmourData from '../../data/item/armour.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import ContainerItemSheet from './container-item-sheet.ts';

/** Armour item with its system data typed to the ArmourData DataModel. */
type ArmourItem = WH40KItemDocument & { system: ArmourData };

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_PROTECTION = 'WH40K.Tabs.Protection';
const TAB_LABEL_MODIFICATIONS = 'WH40K.Tabs.Modifications';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends ContainerItemSheet {
    /** Narrow the inherited item document to its armour DataModel shape. */
    override get item(): ArmourItem {
        return super.item as ArmourItem;
    }

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        ...ContainerItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'armour'],
        position: {
            width: 560,
            height: 580,
        },
        actions: {
            ...ContainerItemSheet.DEFAULT_OPTIONS.actions,
            toggleCoverage: ArmourSheet.#toggleCoverage,
            addProperty: ArmourSheet.#addProperty,
            removeProperty: ArmourSheet.#removeProperty,
            addModification: ArmourSheet.#addModification,
            editMod: ArmourSheet.#editMod,
            removeMod: ArmourSheet.#removeMod,
        },
    } satisfies typeof ContainerItemSheet.DEFAULT_OPTIONS & Partial<ApplicationV2Config.DefaultOptions>;
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-armour-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'protection', group: 'primary', label: TAB_LABEL_PROTECTION },
        { tab: 'mods', group: 'primary', label: TAB_LABEL_MODIFICATIONS },
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups: Record<string, string> = {
        primary: 'protection',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _prepareContext returns free-form template context; Record<string, unknown> is the required base shape
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        const sys = this.item.system;

        // Add armour-specific context
        context['armourTypes'] = CONFIG.WH40K.armourTypes;
        context['bodyLocations'] = CONFIG.WH40K.bodyLocations;
        context['availableProperties'] = this._getAvailableProperties();
        context['apSummary'] = sys.apSummary;
        context['coverageLabel'] = sys.coverageLabel;
        context['coverageIcons'] = sys.coverageIcons;
        context['propertyLabels'] = sys.propertyLabels;

        // Convert coverage Set to array for template
        context['coverageArray'] = Array.from(sys.coverage);

        // Add propertiesArray for safe template access
        context['propertiesArray'] = Array.from(sys.properties);

        // Add modifications array for safe template access
        context['modificationsArray'] = sys.modifications;

        return context;
    }

    /**
     * Get available properties with localized labels.
     */
    _getAvailableProperties(): Record<string, { label: string }> {
        const props: Record<string, { label: string }> = {};
        const available = ['sealed', 'auto-stabilized', 'hexagrammic', 'blessed', 'camouflage', 'lightweight', 'reinforced', 'agility-bonus', 'strength-bonus'];
        const sys = this.item.system;

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
        const location = target.dataset['location'];
        const coverage = new Set(this.item.system.coverage);

        // Handle "all" special case
        if (location === 'all') {
            if (coverage.has('all')) {
                coverage.clear();
                // Add individual locations instead
                for (const loc of ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) {
                    coverage.add(loc);
                }
            } else {
                coverage.clear();
                coverage.add('all');
            }
        } else if (location !== undefined) {
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
        const select = this.element.querySelector<HTMLSelectElement>("[name='new-property']");
        const property = select?.value ?? '';
        if (property === '') return;

        const properties = new Set(this.item.system.properties);
        properties.add(property);

        await this.item.update({ 'system.properties': Array.from(properties) });

        // Reset select
        if (select !== null) select.value = '';
    }

    /**
     * Remove a special property.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #removeProperty(this: ArmourSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
        const property = target.dataset['property'];
        const properties = new Set(this.item.system.properties);
        if (property !== undefined) properties.delete(property);

        await this.item.update({ 'system.properties': Array.from(properties) });
    }

    /**
     * Add a modification to the armour.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #addModification(this: ArmourSheet, event: Event, target: HTMLElement): void {
        // Check if slots available
        if (this.item.system.availableModSlots <= 0) {
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
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        const mod = this.item.system.modifications[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes this possibly undefined in strict mode
        if (mod === null || mod === undefined || mod.uuid === '') return;

        try {
            const doc = await fromUuid(mod.uuid);
            const sheet =
                doc !== null && typeof doc === 'object' && 'sheet' in doc ? (doc as { sheet: { render: (force: boolean) => void } | null }).sheet : null;
            sheet?.render(true);
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
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        const modifications = [...this.item.system.modifications];
        modifications.splice(index, 1);

        await this.item.update({ 'system.modifications': modifications });
    }
}
