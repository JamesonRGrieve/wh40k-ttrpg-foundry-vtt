/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import ContainerItemSheet from './container-item-sheet.mjs';

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
            const def = CONFIG.ROGUE_TRADER.getQualityDefinition?.(q) || {};
            return {
                identifier: q,
                label: def.label || q,
                description: def.description || '',
            };
        });

        // Add effective* getters to context for easy template access
        context.effectiveDamageLabel = system.effectiveDamageFormula || system.damageLabel;
        context.effectivePenetration = system.effectivePenetration;
        context.effectiveToHit = system.effectiveToHit;
        context.effectiveWeight = system.effectiveWeight;

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
        const def = CONFIG.ROGUE_TRADER.getQualityDefinition?.(identifier);
        if (def) {
            ui.notifications.info(`${def.label}: ${def.description}`);
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
     * @this {WeaponSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #onReload(event, target) {
        await this.item.system.reload();
        ui.notifications.info(`${this.item.name} reloaded.`);
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
}
