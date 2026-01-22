/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import ContainerItemSheet from './container-item-sheet.mjs';
import { prepareQualityTooltipData } from '../components/rt-tooltip.mjs';
import { ReloadActionManager } from '../../actions/reload-action-manager.mjs';

/**
 * Sheet for weapon items with support for weapon modifications and ammunition.
 * Redesigned as a single-page layout with FAB action buttons.
 */
export default class WeaponSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'weapon', 'rt-weapon-sheet-v3'],
        actions: {
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
            width: 450,
            height: 400,
        },
        window: {
            resizable: true,
            icon: 'fa-solid fa-gun',
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-weapon-sheet-modern.hbs',
            scrollable: ['.rt-weapon-body'],
        },
    };

    /* -------------------------------------------- */

    /**
     * Track collapsed sections state.
     * @type {Set<string>}
     */
    #collapsedSections = new Set();

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
    prepareQualityTooltip(identifier, level = null) {
        return prepareQualityTooltipData(identifier, level);
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const system = this.item.system;

        // Add CONFIG reference for templates - ensure dropdown options are available
        context.CONFIG = CONFIG;

        // Explicitly pass dropdown options for selectOptions helper
        // Use CONFIG.rt which is the registered config object
        context.weaponClasses = CONFIG.rt?.weaponClasses || {};
        context.weaponTypes = CONFIG.rt?.weaponTypes || {};
        context.damageTypes = CONFIG.rt?.damageTypes || {};
        context.availabilities = CONFIG.rt?.availabilities || {};
        context.craftsmanships = CONFIG.rt?.craftsmanships || {};
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
        context.qualitiesArray = Array.from(system.effectiveSpecial || []).map((q) => {
            // Parse level from quality identifier if present
            const match = q.match(/-(\d+)$/);
            const level = match ? parseInt(match[1]) : null;

            // Get localized label using CONFIG helper (CONFIG.rt not CONFIG.ROGUE_TRADER)
            const label = CONFIG.rt?.getQualityLabel?.(q, level) || q;

            // Get definition for description
            const def = CONFIG.rt?.getQualityDefinition?.(q) || null;

            return {
                identifier: q,
                label,
                description: def?.description || '',
                level,
            };
        });

        // Bind prepareQualityTooltip helper for template
        context.prepareQualityTooltip = this.prepareQualityTooltip.bind(this);

        // Add effective* getters to context for easy template access
        context.effectiveDamageLabel = system.effectiveDamageFormula || system.damageLabel;
        context.effectivePenetration = system.effectivePenetration;
        context.effectiveToHit = system.effectiveToHit;
        context.effectiveWeight = system.effectiveWeight;
        context.fullDamageFormula = system.fullDamageFormula;

        // Prepare modifications data for display
        context.modificationsData = (system.modifications || []).map((mod, index) => ({
            index,
            uuid: mod.uuid,
            name: mod.name,
            active: mod.active ?? true,
            cachedModifiers: mod.cachedModifiers || {},
            effects: this._getModificationEffects(mod),
            hasEffects: this._hasModificationEffects(mod),
            category: mod.category || 'accessory',
            categoryIcon: this._getModificationCategoryIcon(mod.category),
        }));

        // Check if weapon has any modifications affecting stats
        context.hasModificationEffects = system._modificationModifiers && Object.values(system._modificationModifiers).some((v) => v !== 0);

        // Loaded ammunition data
        context.hasLoadedAmmo = system.hasLoadedAmmo;
        context.loadedAmmoLabel = system.loadedAmmoLabel;
        if (system.hasLoadedAmmo) {
            context.loadedAmmoData = {
                name: system.loadedAmmo.name,
                uuid: system.loadedAmmo.uuid,
                modifiers: system.loadedAmmo.modifiers,
                addedQualities: Array.from(system.loadedAmmo.addedQualities || []),
                removedQualities: Array.from(system.loadedAmmo.removedQualities || []),
            };
        }

        // Convenience flags
        context.hasActions = this.isEditable && this.item.actor;

        // FAB state
        context.fabExpanded = this.#fabExpanded;

        // Collapsed sections state
        context.collapsedSections = Object.fromEntries(
            ['combat', 'ranged', 'ammunition', 'acquisition', 'description', 'modifications'].map((s) => [s, this.#collapsedSections.has(s)]),
        );

        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up drag-and-drop visual feedback
        this._setupDragDropFeedback();
    }

    /* -------------------------------------------- */

    /**
     * Set up drag-and-drop visual feedback for modification drop zones.
     * @protected
     */
    _setupDragDropFeedback() {
        const dropZones = this.element.querySelectorAll('[data-drop-zone="modifications"]');
        if (!dropZones.length) return;

        dropZones.forEach((zone) => {
            // Drag enter
            zone.addEventListener('dragenter', async (event) => {
                event.preventDefault();
                event.stopPropagation();

                // Try to get the dragged item data
                const dragData = this._getDragData(event);
                if (!dragData) return;

                // Check if it's a valid modification
                const isValid = await this._isValidModificationDrop(dragData);
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
                if (!zone.contains(event.relatedTarget)) {
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
    _getDragData(event) {
        try {
            // Check if dataTransfer has the data
            const types = event.dataTransfer?.types || [];
            if (!types.includes('text/plain')) return null;

            // For dragenter, we can't access the data due to browser security
            // We'll have to make assumptions based on the drag source
            return { type: 'unknown' };
        } catch (err) {
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
    async _isValidModificationDrop(dragData) {
        // Since we can't access the full data in dragenter due to browser security,
        // we'll optimistically assume it's valid and do full validation on drop
        // This is a UX limitation we have to accept
        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    _canAddItem(item) {
        if (!super._canAddItem(item)) return false;

        // Each modification can only be added once
        if (this.item.items.some((i) => i.name === item.name)) {
            ui.notifications.info(`Weapon can only hold one ${item.name}`);
            return false;
        }

        // Only one ammo type can be loaded
        if (item.type === 'ammunition' && this.item.items.some((i) => i.type === 'ammunition')) {
            ui.notifications.info('Only one type of ammunition can be loaded.');
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
    _getModificationEffects(mod) {
        const effects = [];
        const m = mod.cachedModifiers || {};

        if (m.damage) effects.push(`Damage ${m.damage > 0 ? '+' : ''}${m.damage}`);
        if (m.penetration) effects.push(`Pen ${m.penetration > 0 ? '+' : ''}${m.penetration}`);
        if (m.toHit) effects.push(`To Hit ${m.toHit > 0 ? '+' : ''}${m.toHit}`);
        if (m.range) effects.push(`Range ${m.range > 0 ? '+' : ''}${m.range}m`);
        if (m.weight) effects.push(`Weight ${m.weight > 0 ? '+' : ''}${m.weight}kg`);

        return effects;
    }

    /* -------------------------------------------- */

    /**
     * Check if a modification has any effects.
     * @param {object} mod - Modification data object
     * @returns {boolean}
     * @private
     */
    _hasModificationEffects(mod) {
        const m = mod.cachedModifiers || {};
        return !!(m.damage || m.penetration || m.toHit || m.range || m.weight);
    }

    /**
     * Get the icon class for a modification category.
     * @param {string} category - Modification category
     * @returns {string} - Font Awesome icon class
     * @private
     */
    _getModificationCategoryIcon(category) {
        const icons = {
            sight: 'fa-crosshairs',
            barrel: 'fa-gun',
            stock: 'fa-wrench',
            magazine: 'fa-database',
            accessory: 'fa-cog',
            other: 'fa-tools',
        };
        return icons[category] || 'fa-cog';
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll weapon attack.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollAttack(event, target) {
        const actor = this.item.actor;
        if (!actor) {
            ui.notifications.warn('This weapon must be on an actor to roll.');
            return;
        }

        await actor.rollItem(this.item.id);
    }

    /* -------------------------------------------- */

    /**
     * Roll weapon damage.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollDamage(event, target) {
        const actor = this.item.actor;
        if (!actor) {
            ui.notifications.warn('This weapon must be on an actor to roll.');
            return;
        }

        // Roll damage directly (bypassing attack roll)
        const formula = this.item.system.effectiveDamageFormula;
        const roll = await new Roll(formula).evaluate();

        await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `${this.item.name} - Damage`,
        });
    }

    /* -------------------------------------------- */

    /**
     * Expend one round of ammunition.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #expendAmmo(event, target) {
        const system = this.item.system;

        // Check if weapon uses ammo
        if (!system.usesAmmo) {
            ui.notifications.warn('This weapon does not use ammunition.');
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
    static async #openQuality(event, target) {
        const identifier = target.dataset.identifier;
        if (!identifier) return;

        // Try to find the quality in the weapon qualities compendium
        const pack = game.packs.get('rogue-trader.rt-items-weapon-qualities');
        if (!pack) {
            ui.notifications.warn('Weapon qualities compendium not found.');
            return;
        }

        // Search for the quality by identifier
        const index = await pack.getIndex();
        const qualityEntry = index.find((e) => {
            // Match by identifier (strip level suffix)
            const baseId = identifier.replace(/-\d+$/, '').replace(/-x$/i, '');
            return e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === baseId;
        });

        if (qualityEntry) {
            // Open the quality sheet
            const quality = await pack.getDocument(qualityEntry._id);
            quality?.sheet.render(true);
        } else {
            // Fallback: show tooltip from CONFIG
            const def = CONFIG.rt?.getQualityDefinition?.(identifier);
            if (def) {
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
    static async #nestedItemEdit(event, target) {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const nestedItem = this.item.items.get(itemId);
        if (nestedItem) {
            nestedItem.sheet.render(true);
        }
    }

    /* -------------------------------------------- */

    /**
     * Delete a nested item (modification, ammo).
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #nestedItemDelete(event, target) {
        const itemId = target.dataset.itemId;
        if (!itemId) return;

        const nestedItem = this.item.items.get(itemId);
        if (!nestedItem) return;

        const confirmed = await Dialog.confirm({
            title: `Delete ${nestedItem.name}?`,
            content: `<p>Are you sure you want to remove <strong>${nestedItem.name}</strong> from this weapon?</p>`,
            yes: () => true,
            no: () => false,
        });

        if (confirmed) {
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
    static async #onReload(event, target) {
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
            if (actor) {
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
    static async #onAddModification(event, target) {
        // Open a dialog or compendium browser to add modifications
        // For now, show a notification
        ui.notifications.info('Drag a weapon modification from a compendium to add it.');
    }

    /* -------------------------------------------- */

    /**
     * Toggle a modification's active state.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleModificationActive(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mods = foundry.utils.deepClone(this.item.system.modifications);
        if (index < 0 || index >= mods.length) return;

        mods[index].active = !mods[index].active;

        await this.item.update({ 'system.modifications': mods });

        const mod = mods[index];
        ui.notifications.info(`${mod.name} ${mod.active ? 'activated' : 'deactivated'}.`);
    }

    /* -------------------------------------------- */

    /**
     * View/edit a modification's details.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #viewModification(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        if (!mod) return;

        const modItem = await fromUuid(mod.uuid);
        if (!modItem) {
            ui.notifications.error(`Modification "${mod.name}" not found. It may have been deleted.`);
            return;
        }

        modItem.sheet.render(true);
    }

    /* -------------------------------------------- */

    /**
     * Remove a modification from the weapon.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeModification(event, target) {
        const index = parseInt(target.dataset.modIndex, 10);
        if (isNaN(index)) return;

        const mod = this.item.system.modifications[index];
        if (!mod) return;

        const confirmed = await Dialog.confirm({
            title: 'Remove Modification',
            content: `<p>Remove <strong>${mod.name}</strong> from this weapon?</p>`,
            yes: () => true,
            no: () => false,
        });

        if (!confirmed) return;

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
    async _onDropModification(modItem) {
        // Validate
        if (!this._canAddModification(modItem)) {
            return false;
        }

        // Create modification entry
        const modEntry = {
            uuid: modItem.uuid,
            name: modItem.name,
            active: true,
            category: modItem.system.category || 'accessory',
            cachedModifiers: {
                damage: modItem.system.modifiers?.damage ?? 0,
                penetration: modItem.system.modifiers?.penetration ?? 0,
                toHit: modItem.system.modifiers?.toHit ?? 0,
                range: modItem.system.modifiers?.range ?? 0,
                weight: modItem.system.modifiers?.weight ?? 0,
            },
        };

        // Add to array
        const mods = [...this.item.system.modifications, modEntry];
        await this.item.update({ 'system.modifications': mods });

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
    _canAddModification(modItem) {
        const weapon = this.item.system;
        const restrictions = modItem.system.restrictions;

        // Check weapon class restriction
        if (restrictions?.weaponClasses?.size > 0) {
            if (!restrictions.weaponClasses.has(weapon.class)) {
                ui.notifications.warn(`${modItem.name} cannot be installed on ${weapon.classLabel} weapons.`);
                return false;
            }
        }

        // Check weapon type restriction
        if (restrictions?.weaponTypes?.size > 0) {
            if (!restrictions.weaponTypes.has(weapon.type)) {
                ui.notifications.warn(`${modItem.name} is not compatible with ${weapon.typeLabel} weapons.`);
                return false;
            }
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
    static async #loadAmmo(event, target) {
        const ammoUuid = target.dataset.ammoUuid;
        if (!ammoUuid) return;

        const ammoItem = await fromUuid(ammoUuid);
        if (!ammoItem) {
            ui.notifications.error('Ammunition item not found');
            return;
        }

        await this.item.system.loadAmmo(ammoItem);
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Eject loaded ammunition.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #ejectAmmo(event, target) {
        await this.item.system.ejectAmmo();
        this.render();
    }

    /* -------------------------------------------- */

    /**
     * Toggle the FAB menu open/closed.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleFab(event, target) {
        this.#fabExpanded = !this.#fabExpanded;
        const fab = this.element.querySelector('.rt-fab-container');
        if (fab) {
            fab.classList.toggle('expanded', this.#fabExpanded);
        }
    }

    /* -------------------------------------------- */

    /**
     * Toggle a collapsible section.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static #toggleSection(event, target) {
        const sectionName = target.dataset.section;
        if (!sectionName) return;

        if (this.#collapsedSections.has(sectionName)) {
            this.#collapsedSections.delete(sectionName);
        } else {
            this.#collapsedSections.add(sectionName);
        }

        const section = this.element.querySelector(`[data-section-content="${sectionName}"]`);
        if (section) {
            section.classList.toggle('collapsed', this.#collapsedSections.has(sectionName));
        }

        // Update toggle icon
        const icon = target.querySelector('i');
        if (icon) {
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
    static #toggleBody(event, target) {
        this.#bodyCollapsed = !this.#bodyCollapsed;

        const body = this.element.querySelector('.rt-weapon-body');
        if (body) {
            body.classList.toggle('collapsed', this.#bodyCollapsed);
        }

        // Update toggle icon
        const icon = target.querySelector('.rt-body-toggle__icon');
        if (icon) {
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
    async _onDropAmmunition(ammoItem) {
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
    _canLoadAmmunition(ammoItem) {
        const weapon = this.item.system;

        // Must use ammo
        if (!weapon.usesAmmo) {
            ui.notifications.warn('This weapon does not use ammunition');
            return false;
        }

        // Check weapon type compatibility
        if (ammoItem.system.weaponTypes?.size > 0) {
            if (!ammoItem.system.weaponTypes.has(weapon.type)) {
                ui.notifications.warn(`${ammoItem.name} is not compatible with ${weapon.typeLabel} weapons`);
                return false;
            }
        }

        return true;
    }

    /* -------------------------------------------- */

    /** @override */
    async _onDrop(event) {
        event.preventDefault();

        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData('text/plain'));
        } catch (err) {
            return false;
        }

        if (data.type !== 'Item') return false;

        const droppedItem = await fromUuid(data.uuid);
        if (!droppedItem) return false;

        // Handle weaponModification drops
        if (droppedItem.type === 'weaponModification') {
            return this._onDropModification(droppedItem);
        }

        // Handle ammunition drops
        if (droppedItem.type === 'ammunition') {
            return this._onDropAmmunition(droppedItem);
        }

        // Fallback to parent container behavior for other item types
        return super._onDrop(event);
    }
}
