/**
 * @file CombatQuickPanel - Floating combat HUD for quick actions
 * ApplicationV2 floating window with combat shortcuts
 * 
 * Features:
 * - Draggable, minimizable floating panel
 * - One-click weapon attacks (no dialogs)
 * - Live HP, fatigue, and ammo tracking
 * - Reaction buttons (Dodge, Parry)
 * - Quick actions (Reload, Aim, Draw)
 * - Auto-show on combat start
 * - Position persistence per-user
 * - Gothic 40K themed
 */

const { ApplicationV2 } = foundry.applications.api;

export default class CombatQuickPanel extends ApplicationV2 {

    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: "combat-quick-panel-{id}",
        classes: ["rogue-trader", "combat-hud", "floating-panel"],
        tag: "aside",
        window: {
            title: "RT.CombatPanel.Title",
            icon: "fa-solid fa-crosshairs",
            minimizable: true,
            resizable: false,
            positioned: true
        },
        position: {
            width: 340,
            height: "auto"
        },
        actions: {
            rollInitiative: CombatQuickPanel.#rollInitiative,
            standardAttack: CombatQuickPanel.#standardAttack,
            semiAutoAttack: CombatQuickPanel.#semiAutoAttack,
            fullAutoAttack: CombatQuickPanel.#fullAutoAttack,
            dodge: CombatQuickPanel.#dodge,
            parry: CombatQuickPanel.#parry,
            reload: CombatQuickPanel.#reload,
            aim: CombatQuickPanel.#aim,
            drawWeapon: CombatQuickPanel.#drawWeapon,
            switchWeapon: CombatQuickPanel.#switchWeapon,
            useConsumable: CombatQuickPanel.#useConsumable,
            toggleOpacity: CombatQuickPanel.#toggleOpacity
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        panel: {
            template: "systems/rogue-trader/templates/hud/combat-quick-panel.hbs"
        }
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor this panel is displaying
     * @type {Actor}
     */
    actor = null;

    /**
     * The primary weapon being displayed
     * @type {Item|null}
     */
    primaryWeapon = null;

    /**
     * Track if reactions have been used this round
     * @type {Object}
     */
    reactionsUsed = {
        dodge: false,
        parry: false
    };

    /**
     * Current opacity level (0-3)
     * @type {number}
     */
    opacityLevel = 0;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * Create a new combat quick panel
     * @param {Actor} actor  The actor to display
     * @param {object} options  Additional options
     */
    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this._updatePrimaryWeapon();
    }

    /* -------------------------------------------- */

    /**
     * Update the primary weapon reference
     * @private
     */
    _updatePrimaryWeapon() {
        // Find equipped weapon
        this.primaryWeapon = this.actor.items.find(i => 
            i.type === "weapon" && i.system.equipped
        );
    }

    /* -------------------------------------------- */

    /** @override */
    get title() {
        return `Combat: ${this.actor.name}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Actor data
        context.actor = this.actor;
        context.system = this.actor.system;

        // Vitals
        context.wounds = {
            value: this.actor.system.wounds.value,
            max: this.actor.system.wounds.max,
            percentage: Math.round((this.actor.system.wounds.value / this.actor.system.wounds.max) * 100),
            critical: this.actor.system.wounds.value <= 0,
            low: this.actor.system.wounds.value <= this.actor.system.wounds.max * 0.25
        };

        context.fatigue = {
            value: this.actor.system.fatigue.value,
            max: this.actor.system.fatigue.max,
            percentage: Math.round((this.actor.system.fatigue.value / this.actor.system.fatigue.max) * 100),
            exhausted: this.actor.system.fatigue.value >= this.actor.system.fatigue.max
        };

        // Initiative
        const combatant = game.combat?.combatants.find(c => c.actorId === this.actor.id);
        context.initiative = {
            rolled: combatant?.initiative !== null,
            value: combatant?.initiative || 0,
            bonus: this.actor.system.initiative.bonus || 0
        };

        // Primary weapon
        this._updatePrimaryWeapon();
        context.weapon = this._prepareWeaponData(this.primaryWeapon);

        // Alternate weapons (for quick switch)
        context.alternateWeapons = this.actor.items.filter(i => 
            i.type === "weapon" && i.id !== this.primaryWeapon?.id
        ).slice(0, 3);

        // Reactions
        context.reactions = this._prepareReactions();

        // Quick actions
        context.actions = this._prepareQuickActions();

        // Consumables
        context.consumables = this.actor.items.filter(i => 
            i.type === "gear" && i.system.consumable && i.system.equipped
        ).slice(0, 3);

        // Panel state
        context.opacityLevel = this.opacityLevel;
        context.opacityClass = this._getOpacityClass();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare weapon data for display
     * @param {Item|null} weapon  The weapon item
     * @returns {object}  Prepared weapon data
     * @private
     */
    _prepareWeaponData(weapon) {
        if (!weapon) {
            return {
                none: true,
                name: "No Weapon Equipped"
            };
        }

        const rof = weapon.system.rateOfFire || {};
        
        return {
            id: weapon.id,
            name: weapon.name,
            img: weapon.img,
            damage: weapon.system.damage,
            penetration: weapon.system.penetration || 0,
            range: weapon.system.range,
            clip: weapon.system.clip,
            ammo: {
                current: weapon.system.clip?.value || 0,
                max: weapon.system.clip?.max || 0,
                percentage: weapon.system.clip?.max ? 
                    Math.round((weapon.system.clip.value / weapon.system.clip.max) * 100) : 100,
                low: weapon.system.clip?.value <= (weapon.system.clip?.max * 0.25)
            },
            rateOfFire: {
                single: rof.single,
                semiAuto: rof.semiAuto,
                fullAuto: rof.fullAuto
            }
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare reaction data
     * @returns {object}  Reaction data
     * @private
     */
    _prepareReactions() {
        const dodge = this.actor.system.skills?.dodge;
        const parry = this.actor.system.skills?.parry;

        return {
            dodge: {
                available: !this.reactionsUsed.dodge,
                target: dodge?.current || 0,
                label: dodge ? `Dodge (${dodge.current})` : "Dodge"
            },
            parry: {
                available: !this.reactionsUsed.parry,
                target: parry?.current || 0,
                label: parry ? `Parry (${parry.current})` : "Parry"
            },
            remaining: (this.reactionsUsed.dodge ? 0 : 1) + (this.reactionsUsed.parry ? 0 : 1)
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare quick action data
     * @returns {Array}  Quick actions
     * @private
     */
    _prepareQuickActions() {
        const actions = [];

        // Reload (if weapon needs it)
        if (this.primaryWeapon && this.primaryWeapon.system.clip) {
            const current = this.primaryWeapon.system.clip.value || 0;
            const max = this.primaryWeapon.system.clip.max || 0;
            
            actions.push({
                action: "reload",
                icon: "fa-solid fa-rotate",
                label: "Reload",
                disabled: current >= max,
                tooltip: current >= max ? "Fully loaded" : `Reload (${current}/${max})`
            });
        }

        // Aim
        actions.push({
            action: "aim",
            icon: "fa-solid fa-bullseye",
            label: "Aim",
            tooltip: "Take aim action (+10 next attack)"
        });

        // Draw weapon
        const unequippedWeapons = this.actor.items.filter(i => 
            i.type === "weapon" && !i.system.equipped
        ).length;

        actions.push({
            action: "drawWeapon",
            icon: "fa-solid fa-hand-fist",
            label: "Draw",
            disabled: unequippedWeapons === 0,
            tooltip: unequippedWeapons > 0 ? "Draw weapon" : "No weapons to draw"
        });

        return actions;
    }

    /* -------------------------------------------- */

    /**
     * Get opacity class based on level
     * @returns {string}  CSS class
     * @private
     */
    _getOpacityClass() {
        const levels = ["opacity-full", "opacity-high", "opacity-medium", "opacity-low"];
        return levels[this.opacityLevel] || levels[0];
    }

    /* -------------------------------------------- */

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Apply saved position
        this._restorePosition();

        // Subscribe to actor updates
        this._subscribeToActor();

        // Subscribe to combat updates
        this._subscribeToCombat();
    }

    /* -------------------------------------------- */

    /**
     * Restore saved panel position
     * @private
     */
    _restorePosition() {
        const savedPos = game.user.getFlag("rogue-trader", `combatPanel.${this.actor.id}.position`);
        if (savedPos) {
            this.setPosition(savedPos);
        }
    }

    /* -------------------------------------------- */

    /**
     * Subscribe to actor updates to refresh panel
     * @private
     */
    _subscribeToActor() {
        Hooks.on("updateActor", this._onActorUpdate.bind(this));
        Hooks.on("updateItem", this._onItemUpdate.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Subscribe to combat updates to track rounds
     * @private
     */
    _subscribeToCombat() {
        Hooks.on("combatRound", this._onCombatRound.bind(this));
        Hooks.on("deleteCombat", this._onCombatEnd.bind(this));
    }

    /* -------------------------------------------- */

    /** @override */
    _onClose(options) {
        // Save position
        const position = this.position;
        game.user.setFlag("rogue-trader", `combatPanel.${this.actor.id}.position`, {
            left: position.left,
            top: position.top
        });

        // Unsubscribe from hooks
        Hooks.off("updateActor", this._onActorUpdate);
        Hooks.off("updateItem", this._onItemUpdate);
        Hooks.off("combatRound", this._onCombatRound);
        Hooks.off("deleteCombat", this._onCombatEnd);

        super._onClose(options);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle actor updates
     * @param {Actor} actor  Updated actor
     * @private
     */
    _onActorUpdate(actor) {
        if (actor.id === this.actor.id) {
            this.render(false);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle item updates
     * @param {Item} item  Updated item
     * @private
     */
    _onItemUpdate(item) {
        if (item.actor?.id === this.actor.id) {
            this.render(false);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle new combat round - reset reactions
     * @private
     */
    _onCombatRound() {
        this.reactionsUsed = {
            dodge: false,
            parry: false
        };
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Handle combat end - close panel
     * @private
     */
    _onCombatEnd() {
        this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll initiative
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #rollInitiative(event, target) {
        const combatant = game.combat?.combatants.find(c => c.actorId === this.actor.id);
        if (!combatant) {
            ui.notifications.warn("Character not in combat");
            return;
        }

        await game.combat.rollInitiative([combatant.id]);
        ui.notifications.info(`Rolled initiative for ${this.actor.name}`);
    }

    /* -------------------------------------------- */

    /**
     * Standard attack with primary weapon
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #standardAttack(event, target) {
        if (!this.primaryWeapon) {
            ui.notifications.warn("No weapon equipped");
            return;
        }

        // Quick attack - no dialog
        await this.actor.rollWeaponAttack(this.primaryWeapon.id, { 
            skipDialog: true,
            rateOfFire: "single"
        });
    }

    /* -------------------------------------------- */

    /**
     * Semi-auto attack
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #semiAutoAttack(event, target) {
        if (!this.primaryWeapon?.system.rateOfFire?.semiAuto) {
            ui.notifications.warn("Weapon does not support semi-auto");
            return;
        }

        await this.actor.rollWeaponAttack(this.primaryWeapon.id, { 
            skipDialog: true,
            rateOfFire: "semiAuto"
        });
    }

    /* -------------------------------------------- */

    /**
     * Full-auto attack
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #fullAutoAttack(event, target) {
        if (!this.primaryWeapon?.system.rateOfFire?.fullAuto) {
            ui.notifications.warn("Weapon does not support full-auto");
            return;
        }

        await this.actor.rollWeaponAttack(this.primaryWeapon.id, { 
            skipDialog: true,
            rateOfFire: "fullAuto"
        });
    }

    /* -------------------------------------------- */

    /**
     * Dodge reaction
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #dodge(event, target) {
        if (this.reactionsUsed.dodge) {
            ui.notifications.warn("Already used dodge this round");
            return;
        }

        const skill = this.actor.system.skills?.dodge;
        if (!skill) {
            ui.notifications.warn("No dodge skill");
            return;
        }

        await this.actor.rollSkill("dodge", { skipDialog: true });
        this.reactionsUsed.dodge = true;
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Parry reaction
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #parry(event, target) {
        if (this.reactionsUsed.parry) {
            ui.notifications.warn("Already used parry this round");
            return;
        }

        const skill = this.actor.system.skills?.parry;
        if (!skill) {
            ui.notifications.warn("No parry skill");
            return;
        }

        await this.actor.rollSkill("parry", { skipDialog: true });
        this.reactionsUsed.parry = true;
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Reload weapon
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #reload(event, target) {
        if (!this.primaryWeapon) {
            ui.notifications.warn("No weapon equipped");
            return;
        }

        const clip = this.primaryWeapon.system.clip;
        if (!clip) {
            ui.notifications.warn("Weapon does not use ammunition");
            return;
        }

        if (clip.value >= clip.max) {
            ui.notifications.warn("Weapon is fully loaded");
            return;
        }

        // Reload to max
        await this.primaryWeapon.update({ "system.clip.value": clip.max });
        
        ui.notifications.info(`Reloaded ${this.primaryWeapon.name}`);
        
        // Play reload animation
        this._animateReload();
    }

    /* -------------------------------------------- */

    /**
     * Aim action
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #aim(event, target) {
        // Apply aim effect (+10 to next attack)
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<p><strong>${this.actor.name}</strong> takes aim (+10 to next attack)</p>`,
            flavor: "Aim Action"
        });

        ui.notifications.info("Aim action taken (+10 next attack)");
    }

    /* -------------------------------------------- */

    /**
     * Draw weapon
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #drawWeapon(event, target) {
        const weapons = this.actor.items.filter(i => i.type === "weapon" && !i.system.equipped);
        
        if (weapons.length === 0) {
            ui.notifications.warn("No weapons to draw");
            return;
        }

        // Show weapon selection if multiple
        if (weapons.length > 1) {
            // TODO: Show weapon selection dialog
            ui.notifications.info("Multiple weapons available - use character sheet to select");
            return;
        }

        // Equip the weapon
        await weapons[0].update({ "system.equipped": true });
        ui.notifications.info(`Drew ${weapons[0].name}`);
    }

    /* -------------------------------------------- */

    /**
     * Switch to different weapon
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #switchWeapon(event, target) {
        const weaponId = target.dataset.weaponId;
        const weapon = this.actor.items.get(weaponId);
        
        if (!weapon) return;

        // Unequip current
        if (this.primaryWeapon) {
            await this.primaryWeapon.update({ "system.equipped": false });
        }

        // Equip new
        await weapon.update({ "system.equipped": true });
        
        ui.notifications.info(`Switched to ${weapon.name}`);
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Use consumable item
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #useConsumable(event, target) {
        const itemId = target.dataset.itemId;
        const item = this.actor.items.get(itemId);
        
        if (!item) return;

        // TODO: Implement consumable use logic
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<p><strong>${this.actor.name}</strong> uses ${item.name}</p>`
        });

        ui.notifications.info(`Used ${item.name}`);
    }

    /* -------------------------------------------- */

    /**
     * Toggle panel opacity
     * @this {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #toggleOpacity(event, target) {
        this.opacityLevel = (this.opacityLevel + 1) % 4;
        
        // Apply opacity class
        const panel = this.element;
        panel.classList.remove("opacity-full", "opacity-high", "opacity-medium", "opacity-low");
        panel.classList.add(this._getOpacityClass());
    }

    /* -------------------------------------------- */
    /*  Animation Helpers                           */
    /* -------------------------------------------- */

    /**
     * Animate reload action
     * @private
     */
    _animateReload() {
        const ammoBar = this.element.querySelector(".ammo-bar");
        if (!ammoBar) return;

        ammoBar.classList.add("reload-animation");
        setTimeout(() => {
            ammoBar.classList.remove("reload-animation");
        }, 600);
    }

    /* -------------------------------------------- */
    /*  Static Helpers                              */
    /* -------------------------------------------- */

    /**
     * Show combat panel for actor
     * @param {Actor} actor  The actor
     * @returns {CombatQuickPanel}  The panel instance
     * @static
     */
    static show(actor) {
        // Check if panel already exists
        const existing = Object.values(ui.windows).find(app => 
            app instanceof CombatQuickPanel && app.actor.id === actor.id
        );

        if (existing) {
            existing.render(true, { focus: true });
            return existing;
        }

        // Create new panel
        const panel = new CombatQuickPanel(actor);
        panel.render(true);
        return panel;
    }

    /* -------------------------------------------- */

    /**
     * Close combat panel for actor
     * @param {Actor} actor  The actor
     * @static
     */
    static close(actor) {
        const panel = Object.values(ui.windows).find(app => 
            app instanceof CombatQuickPanel && app.actor.id === actor.id
        );

        if (panel) panel.close();
    }

    /* -------------------------------------------- */

    /**
     * Toggle combat panel for actor
     * @param {Actor} actor  The actor
     * @static
     */
    static toggle(actor) {
        const panel = Object.values(ui.windows).find(app => 
            app instanceof CombatQuickPanel && app.actor.id === actor.id
        );

        if (panel) {
            panel.close();
        } else {
            CombatQuickPanel.show(actor);
        }
    }
}
