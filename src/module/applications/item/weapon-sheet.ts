/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import { ReloadActionManager } from '../../actions/reload-action-manager.ts';
import type { LabelConfig, LabelAbbreviationConfig, LabelModifierConfig } from '../../config.ts';
import type { default as WeaponData } from '../../data/item/weapon.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { applyRollModeWhispers } from '../../rolls/roll-helpers.ts';
import type { WH40KItemDocument } from '../../types/global.d.ts';
import { prepareQualityTooltipData } from '../components/wh40k-tooltip.ts';
import ContainerItemSheet from './container-item-sheet.ts';

// eslint-disable-next-line @typescript-eslint/no-deprecated -- foundry.appv1.api.Dialog is the new namespace; the legacy global still ships and is what we target here
const LegacyDialog = foundry.appv1.api.Dialog;

/** Weapon item document narrowed to its DataModel. */
type WeaponItem = WH40KItemDocument & { system: WeaponData };

/** Speculative drag-preview payload available from the dragenter event (browser security limits us to types only). */
interface DragPreview {
    type: string;
}

/** Shape we read from a weaponModification item when wiring up drag-and-drop. */
interface WeaponModificationItem {
    uuid: string;
    name: string;
    system: {
        category: string;
        modifiers?: { damage?: number; penetration?: number; toHit?: number; range?: number; weight?: number };
        restrictions?: { weaponClasses?: Set<string>; weaponTypes?: Set<string> };
    };
}

/** Shape we read from an ammunition item; matches WeaponData.loadAmmo's parameter. */
interface AmmunitionItem {
    type: string;
    name: string;
    uuid: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update accepts an open data payload
    update: (data: Record<string, unknown>) => Promise<unknown>;
    system: {
        clipModifier?: number;
        quantity?: number;
        modifiers?: { damage?: number; penetration?: number; range?: number };
        addedQualities?: Set<string>;
        removedQualities?: Set<string>;
        weaponTypes?: Set<string>;
    };
}

// eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 context map is heterogeneous and consumed by Handlebars
interface WeaponSheetContext extends Record<string, unknown> {
    system: WeaponData;
    CONFIG: typeof CONFIG;
    weaponClasses: Record<string, LabelConfig>;
    weaponTypes: Record<string, LabelConfig>;
    damageTypes: Record<string, LabelAbbreviationConfig>;
    availabilities: Record<string, LabelModifierConfig>;
    craftsmanships: Record<string, LabelModifierConfig>;
    reloadTimes: Record<string, { label: string }>;
    bodyCollapsed: boolean;
    qualitiesArray: Array<{ identifier: string; label: string; description: string; level: number | null }>;
    prepareQualityTooltip: (identifier: string, level?: number | null) => string;
    effectiveDamageLabel: string;
    effectivePenetration: number;
    effectiveToHit: number;
    effectiveWeight: number;
}

/**
 * Sheet for weapon items with support for weapon modifications and ammunition.
 * Redesigned as a single-page layout with FAB action buttons.
 */
export default class WeaponSheet extends ContainerItemSheet {
    override get item(): WeaponItem {
        return super.item as WeaponItem;
    }

    /** @override */
    /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
    static override DEFAULT_OPTIONS = {
        ...ContainerItemSheet.DEFAULT_OPTIONS,
        classes: ['wh40k-rpg', 'sheet', 'item', 'weapon', 'wh40k-weapon-sheet-v3'],
        actions: {
            ...ContainerItemSheet.DEFAULT_OPTIONS.actions,
            reload: WeaponSheet.#onReload,
            addModification: WeaponSheet.#onAddModification,
            rollAttack: WeaponSheet.#rollAttack,
            rollDamage: WeaponSheet.#rollDamage,
            expendAmmo: WeaponSheet.#expendAmmo,
            openQuality: WeaponSheet.#openQuality,
            nestedItemEdit: WeaponSheet.#nestedItemEdit,
            nestedItemDelete: WeaponSheet.#nestedItemDelete,
            toggleModificationActive: WeaponSheet.#toggleModificationActive,
            viewModification: WeaponSheet.#viewModification,
            removeModification: WeaponSheet.#removeModification,
            loadAmmo: WeaponSheet.#loadAmmo,
            ejectAmmo: WeaponSheet.#ejectAmmo,
            toggleFab: WeaponSheet.#toggleFab,
            toggleSection: WeaponSheet.#toggleSection,
            toggleBody: WeaponSheet.#toggleBody,
        },
        position: {
            width: 500,
            height: 300,
        },
        window: {
            resizable: true,
            icon: 'fa-solid fa-gun',
        },
    } satisfies typeof ContainerItemSheet.DEFAULT_OPTIONS & Partial<ApplicationV2Config.DefaultOptions>;
    /* eslint-enable @typescript-eslint/unbound-method */

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-weapon-sheet.hbs',
            scrollable: ['.wh40k-weapon-body'],
        },
    };

    /* -------------------------------------------- */

    /**
     * Track collapsed sections state.
     * @type {Set<string>}
     */
    readonly #collapsedSections = new Set<string>();

    /**
     * Track FAB expanded state.
     * @type {boolean}
     */
    #fabExpanded = false;

    /**
     * Track body collapsed state (starts collapsed by default).
     * @type {boolean}
     */
    #bodyCollapsed = true;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Prepare weapon quality tooltip data.
     * @param {string} identifier
     * @param {number|null} level
     * @returns {string}
     */
    prepareQualityTooltip(identifier: string, level: number | null = null): string {
        return prepareQualityTooltipData(identifier, level);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<WeaponSheetContext> {
        const context = (await super._prepareContext(options)) as WeaponSheetContext;
        const system = this.item.system;
        context.system = system;

        // Add CONFIG reference for templates - ensure dropdown options are available
        context.CONFIG = CONFIG;

        // Explicitly pass dropdown options for selectOptions helper
        // Use CONFIG.wh40k which is the registered config object
        context.weaponClasses = CONFIG.wh40k.weaponClasses;
        context.weaponTypes = CONFIG.wh40k.weaponTypes;
        context.damageTypes = CONFIG.wh40k.damageTypes;
        context.availabilities = CONFIG.wh40k.availabilities;
        context.craftsmanships = CONFIG.wh40k.craftsmanships;
        context.reloadTimes = {
            '-': { label: '—' },
            'free': { label: 'Free Action' },
            'half': { label: 'Half Action' },
            'full': { label: 'Full Action' },
            '2-full': { label: '2 Full Actions' },
            '3-full': { label: '3 Full Actions' },
        };

        // Body collapse state - start collapsed by default
        context.bodyCollapsed = this.#bodyCollapsed;

        // Prepare qualities array for clickable tags
        context.qualitiesArray = Array.from(system.effectiveSpecial).map((q: string) => {
            // Parse level from quality identifier if present
            const match = /-(\d+)$/.exec(q);
            const level = match?.[1] != null ? parseInt(match[1], 10) : null;

            // Get localized label using CONFIG helper (CONFIG.wh40k not CONFIG.WH40K)
            const label = CONFIG.wh40k.getQualityLabel(q, level);

            // Get definition for description
            const def = CONFIG.wh40k.getQualityDefinition(q);

            return {
                identifier: q,
                label,
                description: def?.description ?? '',
                level,
            };
        });

        // Bind prepareQualityTooltip helper for template
        context.prepareQualityTooltip = this.prepareQualityTooltip.bind(this);

        // Add effective* getters to context for easy template access
        context.effectiveDamageLabel = system.effectiveDamageFormula !== '' ? system.effectiveDamageFormula : system.damageLabel;
        context.effectivePenetration = system.effectivePenetration;
        context.effectiveToHit = system.effectiveToHit;
        context.effectiveWeight = system.effectiveWeight;
        context['fullDamageFormula'] = system.fullDamageFormula;

        // Prepare modifications data for display
        context['modificationsData'] = system.modifications.map((mod, index) => ({
            index,
            uuid: mod.uuid,
            name: mod.name,
            active: mod.active,
            cachedModifiers: mod.cachedModifiers,
            effects: this._getModificationEffects(mod),
            hasEffects: this._hasModificationEffects(mod),
            category: mod.category !== '' ? mod.category : 'accessory',
            categoryIcon: this._getModificationCategoryIcon(mod.category),
        }));

        // Check if weapon has any modifications affecting stats
        context['hasModificationEffects'] = Object.values(system._modificationModifiers).some((v) => v !== 0);

        // Loaded ammunition data
        context['hasLoadedAmmo'] = system.hasLoadedAmmo;
        context['loadedAmmoLabel'] = system.loadedAmmoLabel;
        if (system.hasLoadedAmmo) {
            context['loadedAmmoData'] = {
                name: system.loadedAmmo.name,
                uuid: system.loadedAmmo.uuid,
                modifiers: system.loadedAmmo.modifiers,
                addedQualities: Array.from(system.loadedAmmo.addedQualities),
                removedQualities: Array.from(system.loadedAmmo.removedQualities),
            };
        }

        // Convenience flags
        context['hasActions'] = this.isEditable && this.item.actor !== null;

        // FAB state
        context['fabExpanded'] = this.#fabExpanded;

        // Collapsed sections state
        context['collapsedSections'] = Object.fromEntries(
            ['combat', 'ranged', 'ammunition', 'acquisition', 'description', 'modifications'].map((s) => [s, this.#collapsedSections.has(s)]),
        );

        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender accepts the untyped context record
    override async _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): Promise<void> {
        await super._onRender(context, options);

        // Set up drag-and-drop visual feedback
        this._setupDragDropFeedback();

        // Iconic stat hover: burst-pulse on __shape
        this.element.querySelectorAll<HTMLElement>('.wh40k-iconic-stat').forEach((stat) => {
            stat.addEventListener('mouseenter', () => {
                const shape = stat.querySelector<HTMLElement>('.wh40k-iconic-stat__shape');
                if (!shape) return;
                shape.classList.remove('tw-animate-burst-pulse');
                void shape.offsetWidth;
                shape.classList.add('tw-animate-burst-pulse');
                shape.addEventListener('animationend', () => shape.classList.remove('tw-animate-burst-pulse'), { once: true });
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Set up drag-and-drop visual feedback for modification drop zones.
     * @protected
     */
    _setupDragDropFeedback(): void {
        const dropZones = this.element.querySelectorAll('[data-drop-zone="modifications"]');
        if (dropZones.length === 0) return;

        dropZones.forEach((zone) => {
            // Drag enter
            zone.addEventListener('dragenter', (event) => {
                event.preventDefault();
                event.stopPropagation();

                // Try to get the dragged item data
                const dragData = this._getDragData(event);
                if (dragData === null) return;

                // Check if it's a valid modification
                const isValid = this._isValidModificationDrop(dragData);
                zone.classList.add(isValid ? 'drag-over' : 'drag-invalid');
            });

            // Drag over (required to allow drop)
            zone.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.stopPropagation();
            });

            // Drag leave
            zone.addEventListener('dragleave', (event) => {
                event.preventDefault();
                event.stopPropagation();

                // Only remove highlight if leaving the drop zone entirely
                if (!zone.contains((event as MouseEvent).relatedTarget as Node | null)) {
                    zone.classList.remove('drag-over', 'drag-invalid');
                }
            });

            // Drop
            zone.addEventListener('drop', (event) => {
                event.preventDefault();
                event.stopPropagation();
                zone.classList.remove('drag-over', 'drag-invalid');
            });
        });
    }

    /* -------------------------------------------- */

    /**
     * Get drag data from a drag event.
     * @param {DragEvent} event - The drag event
     * @returns {object|null} - The drag data or null
     * @private
     */
    _getDragData(event: Event): DragPreview | null {
        try {
            // Check if dataTransfer has the data
            const types = (event as DragEvent).dataTransfer?.types ?? [];
            if (!types.includes('text/plain')) return null;

            // For dragenter, we can't access the data due to browser security
            // We'll have to make assumptions based on the drag source
            return { type: 'unknown' };
        } catch {
            return null;
        }
    }

    /* -------------------------------------------- */

    /**
     * Check if a dragged item is a valid modification for this weapon.
     * @param {object} dragData - The drag data
     * @returns {Promise<boolean>}
     * @private
     */
    _isValidModificationDrop(_dragData: DragPreview): boolean {
        // Since we can't access the full data in dragenter due to browser security,
        // we'll optimistically assume it's valid and do full validation on drop
        // This is a UX limitation we have to accept
        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    override _canAddItem(item: WH40KItem): boolean {
        if (!super._canAddItem(item)) return false;

        // Each modification can only be added once
        if (this.item.items.some((i) => i.name === item.name)) {
            ui.notifications.info(`Weapon can only hold one ${item.name}`);
            return false;
        }

        // Only one ammo type can be loaded
        if (item.type === 'ammunition' && this.item.items.some((i) => i.type === 'ammunition')) {
            ui.notifications.info(game.i18n.localize('WH40K.WeaponSheet.OnlyOneAmmoType'));
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /**
     * Get a list of modification effects for display.
     * @param {object} mod - Modification data object
     * @returns {string[]} - Array of effect descriptions
     * @private
     */
    _getModificationEffects(mod: { cachedModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number } }): string[] {
        const effects: string[] = [];
        const m = mod.cachedModifiers;

        if (m.damage !== 0) effects.push(`Damage ${m.damage > 0 ? '+' : ''}${m.damage}`);
        if (m.penetration !== 0) effects.push(`Pen ${m.penetration > 0 ? '+' : ''}${m.penetration}`);
        if (m.toHit !== 0) effects.push(`To Hit ${m.toHit > 0 ? '+' : ''}${m.toHit}`);
        if (m.range !== 0) effects.push(`Range ${m.range > 0 ? '+' : ''}${m.range}m`);
        if (m.weight !== 0) effects.push(`Weight ${m.weight > 0 ? '+' : ''}${m.weight}kg`);

        return effects;
    }

    /* -------------------------------------------- */

    /**
     * Check if a modification has any effects.
     * @param {object} mod - Modification data object
     * @returns {boolean}
     * @private
     */
    _hasModificationEffects(mod: { cachedModifiers: { damage: number; penetration: number; toHit: number; range: number; weight: number } }): boolean {
        const m = mod.cachedModifiers;
        return m.damage !== 0 || m.penetration !== 0 || m.toHit !== 0 || m.range !== 0 || m.weight !== 0;
    }

    /**
     * Get the icon class for a modification category.
     * @param {string} category - Modification category
     * @returns {string} - Font Awesome icon class
     * @private
     */
    _getModificationCategoryIcon(category: string): string {
        const icons: Record<string, string> = {
            sight: 'fa-crosshairs',
            barrel: 'fa-gun',
            stock: 'fa-wrench',
            magazine: 'fa-database',
            accessory: 'fa-cog',
            other: 'fa-tools',
        };
        return icons[category] ?? 'fa-cog';
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll weapon attack.
     * @this {WeaponSheet}
     * @param {PointerEvent} event         Triggering click event.
     * @param {HTMLButtonElement} target  Button that was clicked.
     */
    static async #rollAttack(this: WeaponSheet, _event: PointerEvent, _target: HTMLButtonElement): Promise<void> {
        const actor = this.item.actor;
        if (actor === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.WeaponSheet.MustBeOnActor'));
            return;
        }

        const id = this.item.id;
        if (id !== null) await actor.rollItem(id);
    }

    /* -------------------------------------------- */

    /**
     * Roll weapon damage.
     * @this {WeaponSheet}
     * @param {PointerEvent} event         Triggering click event.
     * @param {HTMLButtonElement} target  Button that was clicked.
     */
    static async #rollDamage(this: WeaponSheet, _event: PointerEvent, _target: HTMLButtonElement): Promise<void> {
        const actor = this.item.actor;
        if (actor === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.WeaponSheet.MustBeOnActor'));
            return;
        }

        const weapon = this.item;
        const weaponSystem = weapon.system;
        const formula = weaponSystem.effectiveDamageFormula;
        const damageRoll = await new Roll(formula).evaluate();

        const hit = {
            location: 'Body',
            damageRoll: { formula: damageRoll.formula, result: damageRoll.result },
            totalDamage: damageRoll.total,
            damageType: weaponSystem.damage.type,
            totalPenetration: weaponSystem.effectivePenetration,
            modifiers: {},
            effects: [],
            righteousFury: [],
        };

        const templateData = {
            weaponName: weapon.name,
            hits: [hit],
            targetActor: null,
        };

        const template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';
        const html = await foundry.applications.handlebars.renderTemplate(template, templateData);
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an open data payload; applyRollModeWhispers mutates the same record
        const chatData: Record<string, unknown> = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: actor }),
            rollMode: game.settings.get('core', 'rollMode'),
            content: html,
            rolls: [damageRoll],
        };
        applyRollModeWhispers(chatData);
        await ChatMessage.create(chatData);
    }

    /* -------------------------------------------- */

    /**
     * Expend one round of ammunition.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #expendAmmo(this: WeaponSheet, _event: Event, _target: HTMLElement): Promise<void> {
        const system = this.item.system;

        // Check if weapon uses ammo
        if (!system.usesAmmo) {
            ui.notifications.warn(game.i18n.localize('WH40K.WeaponSheet.DoesNotUseAmmo'));
            return;
        }

        // Check if there's ammo to spend
        if (system.clip.value <= 0) {
            ui.notifications.warn(`${this.item.name} is out of ammunition!`);
            return;
        }

        // Decrement ammo by 1
        const newValue = system.clip.value - 1;
        await this.item.update({ 'system.clip.value': newValue });

        // Show feedback
        if (newValue === 0) {
            ui.notifications.warn(`${this.item.name} is now empty!`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Open a weapon quality compendium entry.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openQuality(this: WeaponSheet, _event: Event, target: HTMLElement): Promise<void> {
        const identifier = target.dataset['identifier'];
        if (identifier === undefined || identifier === '') return;

        // Try to find the quality in the weapon qualities compendium
        const pack = game.packs.get('wh40k-rpg.wh40k-items-weapon-qualities');
        if (pack === undefined) {
            ui.notifications.warn(game.i18n.localize('WH40K.WeaponSheet.QualitiesCompendiumMissing'));
            return;
        }

        // Search for the quality by identifier
        const index = await pack.getIndex();
        const baseId = identifier.replace(/-\d+$/, '').replace(/-x$/i, '');
        const qualityEntry = index.find((e) => (e.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-') === baseId);

        if (qualityEntry !== undefined) {
            // Open the quality sheet
            // eslint-disable-next-line no-restricted-syntax -- boundary: CompendiumCollection.getDocument returns a broad Document union; we only need the sheet handle
            const quality = (await pack.getDocument(qualityEntry._id)) as { sheet?: { render: (force: boolean) => unknown } | null } | null;
            if (quality?.sheet !== undefined && quality.sheet !== null) {
                void quality.sheet.render(true);
            }
        } else {
            // Fallback: show tooltip from CONFIG
            const def = CONFIG.wh40k.getQualityDefinition(identifier);
            if (def !== null) {
                const label = game.i18n.localize(def.label);
                const description = game.i18n.localize(def.description);
                ui.notifications.info(`${label}: ${description}`);
            } else {
                ui.notifications.warn(`Quality "${identifier}" not found.`);
            }
        }
    }

    /* -------------------------------------------- */

    /**
     * Edit a nested item (modification, ammo).
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #nestedItemEdit(this: WeaponSheet, _event: Event, target: HTMLElement): void {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const nestedItem = this.item.items.get(itemId);
        if (nestedItem !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- V2 sheet?.render usage still consumes deprecated V1 boolean signature
            void nestedItem.sheet?.render(true);
        }
    }

    /* -------------------------------------------- */

    /**
     * Delete a nested item (modification, ammo).
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #nestedItemDelete(this: WeaponSheet, _event: Event, target: HTMLElement): Promise<void> {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;

        const nestedItem = this.item.items.get(itemId);
        if (nestedItem === undefined) return;

        const confirmed = await LegacyDialog.confirm({
            title: game.i18n.format('WH40K.WeaponSheet.ConfirmDeleteTitle', { name: nestedItem.name }),
            content: game.i18n.format('WH40K.WeaponSheet.ConfirmDeleteContent', { name: nestedItem.name }),
            yes: () => true,
            no: () => false,
        });

        if (confirmed === true) {
            await nestedItem.delete();
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle reload button click.
     * Uses the ReloadActionManager to validate and perform reload.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onReload(this: WeaponSheet, event: PointerEvent, _target: HTMLButtonElement): Promise<void> {
        const actor = this.item.actor;

        // Perform reload with validation
        const skipValidation = event.shiftKey; // Hold Shift to skip validation
        const result = await ReloadActionManager.reloadWeapon(this.item, {
            skipValidation,
        });

        // Show result notification
        if (result.success) {
            ui.notifications.info(result.message);

            // Send to chat if actor is present
            if (actor !== null) {
                await ReloadActionManager.sendReloadToChat(actor, this.item, result);
            }
        } else {
            ui.notifications.warn(result.message);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle add modification button click.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #onAddModification(this: WeaponSheet, _event: Event, _target: HTMLElement): void {
        // Open a dialog or compendium browser to add modifications
        // For now, show a notification
        ui.notifications.info(game.i18n.localize('WH40K.WeaponSheet.DragModificationHint'));
    }

    /* -------------------------------------------- */

    /**
     * Toggle a modification's active state.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleModificationActive(this: WeaponSheet, _event: PointerEvent, target: HTMLButtonElement): Promise<void> {
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        if (isNaN(index)) return;

        const mods = foundry.utils.deepClone(this.item.system.modifications);
        if (index < 0 || index >= mods.length) return;

        const mod = mods[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: noUncheckedIndexedAccess widens array element type to T | undefined
        if (mod === undefined) return;
        mod.active = !mod.active;

        await this.item.update({ 'system.modifications': mods });

        ui.notifications.info(`${mod.name} ${mod.active ? 'activated' : 'deactivated'}.`);
    }

    /* -------------------------------------------- */

    /**
     * View/edit a modification's details.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #viewModification(this: WeaponSheet, _event: PointerEvent, target: HTMLButtonElement): Promise<void> {
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: index might exceed array
        if (mod === undefined) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns the broad Foundry document union; we only need the sheet handle
        const modItem = (await fromUuid(mod.uuid)) as { sheet?: { render: (force: boolean) => unknown } | null } | null;
        if (modItem === null) {
            ui.notifications.error(`Modification "${mod.name}" not found. It may have been deleted.`);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-deprecated -- V2 sheet?.render usage still consumes deprecated V1 boolean signature
        void modItem.sheet?.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Remove a modification from the weapon.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeModification(this: WeaponSheet, _event: Event, target: HTMLElement): Promise<void> {
        const index = parseInt(target.dataset['modIndex'] ?? '', 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: index might exceed array
        if (mod === undefined) return;

        const confirmed = await LegacyDialog.confirm({
            title: game.i18n.localize('WH40K.WeaponSheet.ConfirmRemoveModificationTitle'),
            content: game.i18n.format('WH40K.WeaponSheet.ConfirmRemoveModificationContent', { name: mod.name }),
            yes: () => true,
            no: () => false,
        });

        if (confirmed !== true) return;

        const mods = this.item.system.modifications.filter((_, i) => i !== index);
        await this.item.update({ 'system.modifications': mods });

        ui.notifications.info(`${mod.name} removed.`);
    }

    /* -------------------------------------------- */

    /**
     * Handle dropping a weaponModification onto the weapon.
     * @param {Item} modItem - The modification item
     * @returns {Promise<boolean>}
     * @private
     */
    async _onDropModification(modItem: WeaponModificationItem): Promise<boolean> {
        // Validate
        if (!this._canAddModification(modItem)) {
            return false;
        }

        // Create modification entry
        const mods = modItem.system.modifiers;
        const modEntry = {
            uuid: modItem.uuid,
            name: modItem.name,
            active: true,
            category: modItem.system.category !== '' ? modItem.system.category : 'accessory',
            cachedModifiers: {
                damage: mods?.damage ?? 0,
                penetration: mods?.penetration ?? 0,
                toHit: mods?.toHit ?? 0,
                range: mods?.range ?? 0,
                weight: mods?.weight ?? 0,
            },
        };

        // Add to array
        const updated = [...this.item.system.modifications, modEntry];
        await this.item.update({ 'system.modifications': updated });

        ui.notifications.info(`${modItem.name} installed.`);
        return true;
    }

    /* -------------------------------------------- */

    /**
     * Check if a modification can be added to this weapon.
     * @param {Item} modItem - The modification item
     * @returns {boolean}
     * @private
     */
    _canAddModification(modItem: WeaponModificationItem): boolean {
        const weapon = this.item.system;
        const restrictions = modItem.system.restrictions;

        // Check weapon class restriction
        const classRestrictions = restrictions?.weaponClasses;
        if (classRestrictions !== undefined && classRestrictions.size > 0 && !classRestrictions.has(weapon.class)) {
            ui.notifications.warn(`${modItem.name} cannot be installed on ${weapon.classLabel} weapons.`);
            return false;
        }

        // Check weapon type restriction
        const typeRestrictions = restrictions?.weaponTypes;
        if (typeRestrictions !== undefined && typeRestrictions.size > 0 && !typeRestrictions.has(weapon.type)) {
            ui.notifications.warn(`${modItem.name} is not compatible with ${weapon.typeLabel} weapons.`);
            return false;
        }

        // Check for duplicates
        if (weapon.modifications.some((m) => m.uuid === modItem.uuid)) {
            ui.notifications.info(`${modItem.name} is already installed.`);
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /**
     * Load ammunition into weapon.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #loadAmmo(this: WeaponSheet, _event: Event, target: HTMLElement): Promise<void> {
        const ammoUuid = target.dataset['ammoUuid'];
        if (ammoUuid === undefined || ammoUuid === '') return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns the broad Foundry document union; weapon.system.loadAmmo expects the ammo shape, which the WeaponData method validates internally
        const ammoItem = (await fromUuid(ammoUuid)) as Parameters<WeaponData['loadAmmo']>[0] | null;
        if (ammoItem === null) {
            ui.notifications.error(game.i18n.localize('WH40K.WeaponSheet.AmmoNotFound'));
            return;
        }

        await this.item.system.loadAmmo(ammoItem);
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Eject loaded ammunition.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #ejectAmmo(this: WeaponSheet, _event: Event, _target: HTMLElement): Promise<void> {
        await this.item.system.ejectAmmo();
        void this.render();
    }

    /* -------------------------------------------- */

    /**
     * Toggle the FAB menu open/closed.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleFab(this: WeaponSheet, _event: Event, _target: HTMLElement): void {
        this.#fabExpanded = !this.#fabExpanded;
        const fab = this.element.querySelector('.wh40k-fab-container');
        if (fab !== null) {
            fab.classList.toggle('expanded', this.#fabExpanded);
            const fabItems = (fab as HTMLElement).querySelectorAll<HTMLElement>('.wh40k-fab-actions .wh40k-fab');
            const delays = [0.05, 0.1, 0.15];
            fabItems.forEach((item: HTMLElement, i: number) => {
                if (this.#fabExpanded) {
                    item.classList.add('tw-animate-[slide-in-up_0.3s_ease-out_backwards]');
                    item.style.animationDelay = `${delays[i] ?? (i + 1) * 0.05}s`;
                } else {
                    item.classList.remove('tw-animate-[slide-in-up_0.3s_ease-out_backwards]');
                    item.style.animationDelay = '';
                }
            });
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle a collapsible section.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleSection(this: WeaponSheet, _event: Event, target: HTMLElement): void {
        const sectionName = target.dataset['section'];
        if (sectionName === undefined || sectionName === '') return;

        if (this.#collapsedSections.has(sectionName)) {
            this.#collapsedSections.delete(sectionName);
        } else {
            this.#collapsedSections.add(sectionName);
        }

        const section = this.element.querySelector(`[data-section-content="${sectionName}"]`);
        if (section !== null) {
            section.classList.toggle('collapsed', this.#collapsedSections.has(sectionName));
        }

        // Update toggle icon
        const icon = target.querySelector('i');
        if (icon !== null) {
            icon.classList.toggle('fa-chevron-down', !this.#collapsedSections.has(sectionName));
            icon.classList.toggle('fa-chevron-right', this.#collapsedSections.has(sectionName));
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle the main body section collapsed/expanded.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleBody(this: WeaponSheet, _event: Event, target: HTMLElement): void {
        this.#bodyCollapsed = !this.#bodyCollapsed;

        const body = this.element.querySelector('.wh40k-weapon-body');
        if (body !== null) {
            body.classList.toggle('collapsed', this.#bodyCollapsed);
        }

        // Update toggle icon
        const icon = target.querySelector('.wh40k-body-toggle__icon');
        if (icon !== null) {
            icon.classList.toggle('fa-chevron-down', !this.#bodyCollapsed);
            icon.classList.toggle('fa-chevron-up', this.#bodyCollapsed);
        }

        // Adjust window height
        const expandedHeight = 700;
        const collapsedHeight = 450;
        const newHeight = this.#bodyCollapsed ? collapsedHeight : expandedHeight;
        this.setPosition({ height: newHeight });
    }

    /* -------------------------------------------- */

    /**
     * Handle dropping ammunition onto the weapon.
     * @param {Item} ammoItem - The ammunition item
     * @returns {Promise<boolean>}
     * @private
     */
    async _onDropAmmunition(ammoItem: AmmunitionItem): Promise<boolean> {
        // Validate ammunition compatibility
        if (!this._canLoadAmmunition(ammoItem)) {
            return false;
        }

        // Load ammunition
        await this.item.system.loadAmmo(ammoItem);
        return true;
    }

    /* -------------------------------------------- */

    /**
     * Check if ammunition can be loaded into this weapon.
     * @param {Item} ammoItem - The ammunition item
     * @returns {boolean}
     * @private
     */
    _canLoadAmmunition(ammoItem: AmmunitionItem): boolean {
        const weapon = this.item.system;

        // Must use ammo
        if (!weapon.usesAmmo) {
            ui.notifications.warn(game.i18n.localize('WH40K.WeaponSheet.DoesNotUseAmmo'));
            return false;
        }

        // Check weapon type compatibility
        const ammoTypes = ammoItem.system.weaponTypes;
        if (ammoTypes !== undefined && ammoTypes.size > 0 && !ammoTypes.has(weapon.type)) {
            ui.notifications.warn(`${ammoItem.name} is not compatible with ${weapon.typeLabel} weapons`);
            return false;
        }

        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    override async _onDrop(event: DragEvent): Promise<boolean> {
        event.preventDefault();

        // eslint-disable-next-line no-restricted-syntax -- boundary: dataTransfer payload is raw JSON authored by drag source
        let data: { type?: string; uuid?: string };
        try {
            data = JSON.parse(event.dataTransfer?.getData('text/plain') ?? '') as { type?: string; uuid?: string };
        } catch {
            return false;
        }

        if (data.type !== 'Item') return false;

        const droppedItem = await fromUuid(data.uuid ?? '');
        if (droppedItem === null) return false;

        // Handle weaponModification drops
        if ((droppedItem as { type?: string }).type === 'weaponModification') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns a broad Foundry document union; _onDropModification narrows via its WeaponModificationItem shape
            return this._onDropModification(droppedItem as unknown as WeaponModificationItem);
        }

        // Handle ammunition drops
        if ((droppedItem as { type?: string }).type === 'ammunition') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns a broad Foundry document union; _onDropAmmunition narrows via its AmmunitionItem shape
            return this._onDropAmmunition(droppedItem as unknown as AmmunitionItem);
        }

        // Fallback to parent container behavior for other item types
        return super._onDrop(event);
    }
}
