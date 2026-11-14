/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import type ArmourModificationData from '../../data/item/armour-modification.ts';
import type ArmourData from '../../data/item/armour.ts';
import {
    ARMOUR_MOD_CATEGORY_LABELS,
    ARMOUR_MOD_LOCATIONS,
    armourModCategory,
    type InstallVerdict,
    installedEntry,
    installVerdict,
} from '../../rules/armour-modifications.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import type { I18nKey } from '../../types/i18n-keys';
import SetFieldActionsMixin from '../api/set-field-actions-mixin.ts';
import ContainerItemSheet from './container-item-sheet.ts';
import { ARMOUR_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Armour item with its system data typed to the ArmourData DataModel. */
type ArmourItem = WH40KItemDocument & { system: ArmourData };

/** Tab label localization keys, hoisted so the static TABS entries reference identifiers. */
const TAB_LABEL_PROTECTION = 'WH40K.Tabs.Protection';
const TAB_LABEL_MODIFICATIONS = 'WH40K.Tabs.Modifications';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/** Why a dropped modification was not fitted (#730). */
const INSTALL_REFUSED: Record<Exclude<InstallVerdict, 'ok'>, I18nKey> = {
    'duplicate': 'WH40K.Armour.ModAlreadyFitted',
    'wrong-armour-type': 'WH40K.Armour.ModWrongType',
    'no-upgrade-slot': 'WH40K.Armour.NoSlotsAvailable',
    'no-subsystem-slot': 'WH40K.Armour.NoSubsystemSlots',
};

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends SetFieldActionsMixin(ContainerItemSheet<ArmourItem>) {
    /** Stored fields the template lacks, edited through the shared schema rows (#732). */
    static override SCHEMA_LAYOUT = ARMOUR_EXTRA_LAYOUT;

    /** @override */
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
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<HandlebarsContext> {
        const context = await super._prepareContext(options);
        const sys = this.item.system;

        // Add armour-specific context
        context['armourTypes'] = CONFIG.wh40k.armourTypes;
        context['bodyLocations'] = CONFIG.wh40k.bodyLocations;
        context['availableProperties'] = this._getAvailableProperties();
        context['apSummary'] = sys.apSummary;
        context['coverageLabel'] = sys.coverageLabel;
        context['coverageIcons'] = sys.coverageIcons;
        context['propertyLabels'] = sys.propertyLabels;

        // Convert coverage Set to array for template
        context['coverageArray'] = Array.from(sys.coverage);

        // Each property as `{ id, label, description }` — the chips and the remove buttons
        // read those fields; bare ids rendered blank chips that removed nothing (#702).
        context['propertiesArray'] = sys.propertiesArray;

        // Add modifications array for safe template access, each with its category's label (#730)
        context['subsystemsFitted'] = sys.modifications.filter((mod) => armourModCategory(mod.category) === 'subsystem').length;
        context['upgradesFitted'] = sys.modifications.filter((mod) => armourModCategory(mod.category) === 'upgrade').length;
        // The header's per-location AP, with craftsmanship and fitted modifications (#730).
        context['effectiveAP'] = Object.fromEntries(ARMOUR_MOD_LOCATIONS.map((location) => [location, sys.getEffectiveAPForLocation(location)]));
        context['modificationsArray'] = sys.modifications.map((mod) => ({
            ...mod,
            categoryLabel: game.i18n.localize(ARMOUR_MOD_CATEGORY_LABELS[armourModCategory(mod.category)]),
        }));

        return context;
    }

    /**
     * Dropping an armour modification fits it to the suit (#730): it lands in
     * `system.modifications` when the suit's type and free slots allow it, and
     * the GM is told why when they do not. Any other drop is a container drop.
     */
    override async _onDrop(event: DragEvent): Promise<boolean> {
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event) as { type?: string; uuid?: string };
        const uuid = data.type === 'Item' ? data.uuid ?? '' : '';
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns Foundry's untyped document; narrowed by the type check below
        const dropped = uuid === '' ? null : ((await fromUuid(uuid)) as unknown as { type?: string; name?: string; system?: ArmourModificationData } | null);
        if (dropped?.type !== 'armourModification' || dropped.system === undefined) return super._onDrop(event);
        event.preventDefault();
        event.stopPropagation();
        if (!this.isEditable) return false;
        const sys = this.item.system;
        const verdict = installVerdict(sys, uuid, dropped.system);
        if (verdict !== 'ok') {
            ui.notifications.warn(game.i18n.format(INSTALL_REFUSED[verdict], { mod: dropped.name ?? '', armour: this.item.name }));
            return false;
        }
        await this.item.update({ 'system.modifications': [...sys.modifications, installedEntry(uuid, dropped.name ?? '', dropped.system)] });
        return true;
    }

    /**
     * Get available properties with localized labels.
     */
    _getAvailableProperties(): Record<string, { label: string }> {
        // #429: the configured properties, less those already added, projected through the
        // shared mixin helper; the record shape the template consumes is re-collected.
        const rows = this.projectSetOptions(CONFIG.wh40k.armourProperties, { exclude: this.item.system.properties });
        return Object.fromEntries(rows.map((r) => [r.key, { label: r.label }]));
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
    static async #toggleCoverage(this: ArmourSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const location = target.dataset['location'];
        const coverage = this.readSetField('coverage');

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

        await this.writeSetField('coverage', coverage);
    }

    /**
     * Add a special property.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #addProperty(this: ArmourSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const property = this.sheetLocalValue('new-property');
        if (property === '') return;
        await this.addToSetField('properties', property);
        this.clearSheetLocal('new-property');
    }

    /**
     * Remove a special property.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #removeProperty(this: ArmourSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        await this.removeFromSetField('properties', target.dataset['property']);
    }

    /**
     * Add a modification to the armour.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static #addModification(this: ArmourSheet, _event: Event, _target: HTMLElement): void {
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
    static async #editMod(this: ArmourSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        const mod = this.item.system.modifications[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess makes this possibly undefined in strict mode
        if (mod === null || mod === undefined || mod.uuid === '') return;

        // Shared fromUuid → sheet.render idiom (#290).
        await this.viewItemByUuid(mod.uuid);
    }

    /**
     * Remove a modification from the armour.
     * @param {ArmourSheet} this
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #removeMod(this: ArmourSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        const modifications = [...this.item.system.modifications];
        modifications.splice(index, 1);

        await this.item.update({ 'system.modifications': modifications });
    }
}
