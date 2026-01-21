/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import ContainerItemSheet from './container-item-sheet.mjs';
import { ReloadActionManager } from '../../actions/reload-action-manager.mjs';

/**
 * Sheet for weapon items with support for weapon modifications and ammunition.
 */
export default class WeaponSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'weapon', 'rt-weapon-sheet-v2'],
        actions: {
            reload: WeaponSheet.#onReload,
            addModification: WeaponSheet.#onAddModification,
            toggleEditMode: WeaponSheet.#toggleEditMode,
            rollAttack: WeaponSheet.#rollAttack,
            rollDamage: WeaponSheet.#rollDamage,
            openQuality: WeaponSheet.#openQuality,
            nestedItemEdit: WeaponSheet.#nestedItemEdit,
            nestedItemDelete: WeaponSheet.#nestedItemDelete,
            toggleModificationActive: WeaponSheet.#toggleModificationActive,
            viewModification: WeaponSheet.#viewModification,
            removeModification: WeaponSheet.#removeModification,
            loadAmmo: WeaponSheet.#loadAmmo,
            ejectAmmo: WeaponSheet.#ejectAmmo,
        },
        position: {
            width: 650,
            height: 700,
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
            scrollable: ['.rt-weapon-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'overview', group: 'primary', label: 'RT.Tabs.Overview' },
        { tab: 'properties', group: 'primary', label: 'RT.Tabs.Properties' },
        { tab: 'effects', group: 'primary', label: 'RT.Tabs.Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Instance Properties                         */
    /* -------------------------------------------- */

    /**
     * Whether the sheet is in edit mode (for actor-owned weapons).
     * Compendium items are always in view mode.
     * @type {boolean}
     */
    #editMode = false;

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Whether this weapon is owned by an actor (editable copy).
     * @type {boolean}
     */
    get isOwnedByActor() {
        return !!this.item.actor;
    }

    /**
     * Whether this weapon is from a compendium (read-only).
     * @type {boolean}
     */
    get isCompendiumItem() {
        return this.item.pack !== null;
    }

    /**
     * Whether the sheet should show edit controls.
     * @type {boolean}
     */
    get canEdit() {
        // Compendium items are always read-only
        if (this.isCompendiumItem) return false;
        // Must be editable by user
        return this.isEditable;
    }

    /**
     * Whether the sheet is currently in edit mode.
     * @type {boolean}
     */
    get inEditMode() {
        // Compendium items are never in edit mode
        if (this.isCompendiumItem) return false;
        // For actor-owned items, use toggle state
        // For world items, always allow editing if editable
        if (!this.isOwnedByActor) return this.isEditable;
        return this.#editMode && this.isEditable;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const system = this.item.system;

        // Add CONFIG reference for templates
        context.CONFIG = CONFIG;

        // Edit mode state
        context.canEdit = this.canEdit;
        context.inEditMode = this.inEditMode;
        context.isOwnedByActor = this.isOwnedByActor;
        context.isCompendiumItem = this.isCompendiumItem;

        // Tab state
        context.tabs = this._getTabs();
        context.activeTab = this.tabGroups.primary;

        // Prepare qualities array for clickable tags
        context.qualitiesArray = Array.from(system.effectiveSpecial || []).map((q) => {
            const def = CONFIG.ROGUE_TRADER?.getQualityDefinition?.(q) || null;
            return {
                identifier: q,
                label: def?.label || q,
                description: def?.description || '',
            };
        });

        // Add effective* getters to context for easy template access
        context.effectiveDamageLabel = system.effectiveDamageFormula || system.damageLabel;
        context.effectivePenetration = system.effectivePenetration;
        context.effectiveToHit = system.effectiveToHit;
        context.effectiveWeight = system.effectiveWeight;

        // Prepare modifications data for display
        context.modificationsData = (system.modifications || []).map((mod, index) => ({
            index,
            uuid: mod.uuid,
            name: mod.name,
            active: mod.active ?? true,
            cachedModifiers: mod.cachedModifiers || {},
            effects: this._getModificationEffects(mod),
            hasEffects: this._hasModificationEffects(mod),
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

        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    async _onRender(context, options) {
        await super._onRender(context, options);

        // Set up tab listeners for the weapon-specific tabs
        this._setupWeaponTabs();
    }

    /* -------------------------------------------- */

    /**
     * Set up tab click listeners for weapon sheet tabs.
     * @protected
     */
    _setupWeaponTabs() {
        const tabs = this.element.querySelectorAll('.rt-weapon-tabs .rt-weapon-tab');
        const switchTab = (tabName) => {
            if (!tabName) return;

            // Update active tab button
            tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tabName));

            // Show/hide panels
            const panels = this.element.querySelectorAll('.rt-weapon-panel');
            panels.forEach((panel) => {
                panel.classList.toggle('active', panel.dataset.tab === tabName);
            });

            // Update tab group state
            this.tabGroups.primary = tabName;
        };

        // Tab button clicks
        tabs.forEach((tab) => {
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                switchTab(tab.dataset.tab);
            });
        });
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

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Toggle edit mode for owned weapons.
     * @this {WeaponSheet}
     * @param {PointerEvent} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #toggleEditMode(event, target) {
        if (!this.canEdit) return;
        this.#editMode = !this.#editMode;
        this.render();
    }

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
     * Open a weapon quality compendium entry.
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #openQuality(event, target) {
        const identifier = target.dataset.identifier;
        if (!identifier) return;

        // Try to find the quality in compendiums
        // For now, show a tooltip with the description
        const def = CONFIG.ROGUE_TRADER?.getQualityDefinition?.(identifier);
        if (def) {
            ui.notifications.info(`${def.label}: ${def.description}`);
        } else {
            ui.notifications.warn(`Quality "${identifier}" not found.`);
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
