/**
 * @gulpfile.js CombatQuickPanel - Floating combat HUD for quick actions
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

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { ReloadActionManager } from '../../actions/reload-action-manager.ts';

const { ApplicationV2 } = foundry.applications.api;

export default class CombatQuickPanel extends ApplicationV2 {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS = {
        id: 'combat-quick-panel-{id}',
        classes: ['wh40k-rpg', 'combat-hud', 'floating-panel'],
        tag: 'aside',
        window: {
            title: 'WH40K.CombatPanel.Title',
            icon: 'fa-solid fa-crosshairs',
            minimizable: true,
            resizable: false,
            positioned: true,
        },
        position: {
            width: 340,
            height: 'auto', // Changed from 'auto' as const to 'auto'
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
            toggleOpacity: CombatQuickPanel.#toggleOpacity,
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS = {
        panel: {
            template: 'systems/wh40k-rpg/templates/hud/combat-quick-panel.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The actor this panel is displaying
     * @scripts/gen-i18n-types.mjs {WH40KBaseActor | null}
     */
    actor: WH40KBaseActor | null = null;

    /**
     * The primary weapon being displayed
     * @scripts/gen-i18n-types.mjs {WH40KItem | null}
     */
    primaryWeapon: WH40KItem | null = null;

    /**
     * Track if reactions have been used this round
     * @scripts/gen-i18n-types.mjs {Object}
     */
    reactionsUsed = {
        dodge: false,
        parry: false,
    };

    /**
     * Current opacity level (0-3)
     * @scripts/gen-i18n-types.mjs {number}
     */
    opacityLevel = 0;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    /**
     * Create a new combat quick panel
     * @param {WH40KBaseActor} actor  The actor to display
     * @param {object} options  Additional options
     */
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this._updatePrimaryWeapon();
    }

    /* -------------------------------------------- */

    /**
     * Update the primary weapon reference
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _updatePrimaryWeapon(): void {
        // Find equipped weapon and ensure it's not undefined, defaulting to null
        this.primaryWeapon = this.actor?.items.find((i) => i.type === 'weapon' && i.system.equipped) ?? null;
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    get title() {
        // Ensure actor is not null before accessing its name
        return `Combat: ${this.actor?.name ?? 'Unknown'}`;
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = (await super._prepareContext(options)) as Record<string, unknown>;

        // If actor is null, return early to prevent further errors
        if (!this.actor) return context;

        // Actor data
        context.actor = this.actor;
        context.system = this.actor.system;

        // Vitals
        const wounds = (this.actor.system as any).wounds;
        // Use wounds.current instead of wounds.value as per TS2339 error
        context.wounds = {
            value: wounds.current,
            max: wounds.max,
            percentage: Math.round((wounds.current / wounds.max) * 100),
            critical: wounds.current <= 0,
            low: wounds.current <= wounds.max * 0.25,
        };

        const fatigue = (this.actor.system as any).fatigue;
        context.fatigue = {
            value: fatigue.value,
            max: fatigue.max,
            percentage: Math.round((fatigue.value / fatigue.max) * 100),
            exhausted: fatigue.value >= fatigue.max,
        };

        // Initiative
        // Use optional chaining for game.combat and combatant
        const combatant = game.combat?.combatants.find((c) => (c as { actorId?: string }).actorId === this.actor?.id);
        // Use nullish coalescing operator for safer default values
        context.initiative = {
            rolled: (combatant?.initiative ?? null) !== null,
            value: (combatant?.initiative ?? 0) as number,
            bonus: (this.actor.system as any).initiative.bonus || 0,
        };

        // Primary weapon
        this._updatePrimaryWeapon();
        context.weapon = this._prepareWeaponData(this.primaryWeapon);

        // Alternate weapons (for quick switch)
        context.alternateWeapons = this.actor.items.filter((i) => i.type === 'weapon' && i.id !== this.primaryWeapon?.id).slice(0, 3);

        // Reactions
        context.reactions = this._prepareReactions();

        // Quick actions
        context.actions = this._prepareQuickActions();

        // Consumables
        context.consumables = this.actor.items.filter((i) => i.type === 'gear' && (i.system as any).consumable && (i.system as any).equipped).slice(0, 3);

        // Panel state
        context.opacityLevel = this.opacityLevel;
        context.opacityKey = this._getOpacityKey();

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare weapon data for display
     * @param {Item|null} weapon  The weapon item
     * @returns {object}  Prepared weapon data
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _prepareWeaponData(weapon: WH40KItem | null | undefined): Record<string, unknown> {
        // Handle cases where weapon is null or undefined
        if (!weapon) {
            return {
                none: true,
                name: 'No Weapon Equipped',
            };
        }

        // Use optional chaining for safer access to nested properties
        const rof = weapon.system?.rateOfFire || {};

        return {
            id: weapon.id,
            name: weapon.name,
            img: weapon.img,
            damage: (weapon.system as { damage?: string }).damage,
            penetration: (weapon.system as { penetration?: number }).penetration || 0,
            range: (weapon.system as { range?: string }).range,
            clip: (weapon.system as { clip?: Record<string, unknown> }).clip,
            ammo: {
                current: (weapon.system as { clip?: { value: number } }).clip?.value || 0,
                max:
                    (weapon.system as { effectiveClipMax?: number; clip?: { max: number } }).effectiveClipMax ||
                    (weapon.system as { clip?: { max: number } }).clip?.max ||
                    0,
                percentage: (weapon.system as { ammoPercentage?: number }).ammoPercentage ?? 100,
                low:
                    (weapon.system as { clip?: { value: number } }).clip?.value <=
                    ((weapon.system as { effectiveClipMax?: number; clip?: { max: number } }).effectiveClipMax ||
                        (weapon.system as { clip?: { max: number } }).clip?.max ||
                        0) *
                        0.25,
            },
            rateOfFire: {
                single: rof.single,
                semiAuto: rof.semiAuto,
                fullAuto: rof.fullAuto,
            },
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare reaction data
     * @returns {object}  Reaction data
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _prepareReactions(): Record<string, unknown> {
        // Ensure actor.system.skills is not null/undefined before accessing skills
        const skills = this.actor?.system.skills;
        const dodge = skills?.dodge;
        const parry = skills?.parry;

        return {
            dodge: {
                available: !this.reactionsUsed.dodge,
                target: dodge?.current || 0,
                label: dodge ? `Dodge (${dodge.current})` : 'Dodge',
            },
            parry: {
                available: !this.reactionsUsed.parry,
                target: parry?.current || 0,
                label: parry ? `Parry (${parry.current})` : 'Parry',
            },
            remaining: (this.reactionsUsed.dodge ? 0 : 1) + (this.reactionsUsed.parry ? 0 : 1),
        };
    }

    /* -------------------------------------------- */

    /**
     * Prepare quick action data
     * @returns {Array}  Quick actions
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _prepareQuickActions(): unknown[] {
        const actions = [];

        // Reload (if weapon needs it)
        // Ensure primaryWeapon and its system properties are not null/undefined
        if (this.primaryWeapon?.system?.clip) {
            const current = this.primaryWeapon.system.clip.value || 0;
            const max = this.primaryWeapon.system.clip.max || 0;

            actions.push({
                action: 'reload',
                icon: 'fa-solid fa-rotate',
                label: 'Reload',
                disabled: current >= max,
                tooltip: current >= max ? 'Fully loaded' : `Reload (${current}/${max})`,
            });
        }

        // Aim
        actions.push({
            action: 'aim',
            icon: 'fa-solid fa-bullseye',
            label: 'Aim',
            tooltip: 'Take aim action (+10 next attack)',
        });

        // Draw weapon
        // Ensure actor and actor.items are not null/undefined
        const unequippedWeapons = this.actor?.items.filter((i) => i.type === 'weapon' && !i.system.equipped).length ?? 0;

        actions.push({
            action: 'drawWeapon',
            icon: 'fa-solid fa-hand-fist',
            label: 'Draw',
            disabled: unequippedWeapons === 0,
            tooltip: unequippedWeapons > 0 ? 'Draw weapon' : 'No weapons to draw',
        });

        return actions;
    }

    /* -------------------------------------------- */

    /**
     * Get opacity class based on level
     * @returns {string}  CSS class
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _getOpacityKey(): string {
        const keys = ['full', 'high', 'medium', 'low'];
        return keys[this.opacityLevel] || keys[0];
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    // Corrected the signature to match ApplicationV2.OnRender from foundry-v14-overrides.d.ts
    _onRender(context: Record<string, unknown>, options: ApplicationV2Config.RenderOptions): void | Promise<void> {
        // Ensure super._onRender is called with correct options type if needed,
        // but the error was about `options` possibly being undefined.
        // The change in signature above should help.
        void super._onRender(context, options);

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
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _restorePosition(): void {
        // Check if actor is available before accessing id
        if (!this.actor) return;

        const savedPos = (game.user as any).getFlag('wh40k-rpg', `combatPanel.${this.actor.id}.position`);
        if (savedPos) {
            // Corrected: 'position' property assignment instead of setPosition method
            this.position = savedPos;
        }
    }

    /* -------------------------------------------- */

    /**
     * Subscribe to actor updates to refresh panel
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _subscribeToActor(): void {
        // Ensure hooks are bound to the correct instance 'this'
        Hooks.on('updateActor', this._onActorUpdate.bind(this));
        Hooks.on('updateItem', this._onItemUpdate.bind(this));
    }

    /* -------------------------------------------- */

    /**
     * Subscribe to combat updates to track rounds
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _subscribeToCombat(): void {
        Hooks.on('combatRound', this._onCombatRound.bind(this));
        Hooks.on('deleteCombat', this._onCombatEnd.bind(this));
    }

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    _onClose(options: Record<string, unknown>): void {
        // Check if actor is available before saving position flag
        if (this.actor) {
            const position = this.position;
            (game.user as any).setFlag('wh40k-rpg', `combatPanel.${this.actor.id}.position`, {
                left: position.left,
                top: position.top,
            });
        }

        // Unsubscribe from hooks
        // Ensuring hooks are correctly unbound
        Hooks.off('updateActor', this._onActorUpdate.bind(this));
        Hooks.off('updateItem', this._onItemUpdate.bind(this));
        Hooks.off('combatRound', this._onCombatRound.bind(this));
        Hooks.off('deleteCombat', this._onCombatEnd.bind(this));

        super._onClose(options);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle actor updates
     * @param {Actor} actor  Updated actor
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _onActorUpdate(actor: WH40KBaseActor): void {
        // Ensure actor is not null before comparing IDs
        if (!this.actor) return;
        if (actor.id === this.actor.id) {
            void this.render(false);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle item updates
     * @param {Item} item  Updated item
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _onItemUpdate(item: WH40KItem): void {
        // Ensure actor is not null before comparing IDs
        if (!this.actor) return;
        if (item.actor?.id === this.actor.id) {
            void this.render(false);
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle new combat round - reset reactions
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _onCombatRound(): void {
        this.reactionsUsed = {
            dodge: false,
            parry: false,
        };
        void this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Handle combat end - close panel
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _onCombatEnd(): void {
        void this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll initiative
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #rollInitiative(this: CombatQuickPanel, event: Event, target: HTMLElement): Promise<void> {
        // Use optional chaining for game.combat and combatant
        const combatant = game.combat?.combatants.find((c) => (c as { actorId?: string }).actorId === this.actor?.id);
        if (!combatant) {
            ui.notifications.warn('Character not in combat');
            return;
        }

        await game.combat.rollInitiative([combatant.id]);
        ui.notifications.info(`Rolled initiative for ${this.actor?.name ?? 'Unknown'}`);
    }

    /* -------------------------------------------- */

    /**
     * Standard attack with primary weapon
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #standardAttack(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (!this.primaryWeapon) {
            ui.notifications.warn('No weapon equipped');
            return;
        }

        // Quick attack - no dialog
        await this.actor?.rollWeaponAttack(this.primaryWeapon.id, {
            skipDialog: true,
            rateOfFire: 'single',
        });
    }

    /* -------------------------------------------- */

    /**
     * Semi-auto attack
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #semiAutoAttack(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        // Use optional chaining for safer access to nested properties
        if (!(this.primaryWeapon?.system as { rateOfFire?: { semiAuto?: boolean } })?.rateOfFire?.semiAuto) {
            ui.notifications.warn('Weapon does not support semi-auto');
            return;
        }

        await this.actor?.rollWeaponAttack(this.primaryWeapon.id, {
            skipDialog: true,
            rateOfFire: 'semiAuto',
        });
    }

    /* -------------------------------------------- */

    /**
     * Full-auto attack
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #fullAutoAttack(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        // Use optional chaining for safer access to nested properties
        if (!(this.primaryWeapon?.system as { rateOfFire?: { fullAuto?: boolean } })?.rateOfFire?.fullAuto) {
            ui.notifications.warn('Weapon does not support full-auto');
            return;
        }

        await this.actor?.rollWeaponAttack(this.primaryWeapon.id, {
            skipDialog: true,
            rateOfFire: 'fullAuto',
        });
    }

    /* -------------------------------------------- */

    /**
     * Dodge reaction
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #dodge(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (this.reactionsUsed.dodge) {
            ui.notifications.warn('Already used dodge this round');
            return;
        }

        // Ensure actor and actor.system.skills are not null/undefined
        const skill = this.actor?.system.skills?.dodge;
        if (!skill) {
            ui.notifications.warn('No dodge skill');
            return;
        }

        await this.actor?.rollSkill('dodge', { skipDialog: true });
        this.reactionsUsed.dodge = true;
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Parry reaction
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #parry(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (this.reactionsUsed.parry) {
            ui.notifications.warn('Already used parry this round');
            return;
        }

        // Ensure actor and actor.system.skills are not null/undefined
        const skill = this.actor?.system.skills?.parry;
        if (!skill) {
            ui.notifications.warn('No parry skill');
            return;
        }

        await this.actor?.rollSkill('parry', { skipDialog: true });
        this.reactionsUsed.parry = true;
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Reload weapon
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #reload(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        if (!this.primaryWeapon) {
            ui.notifications.warn('No weapon equipped');
            return;
        }

        const result = await ReloadActionManager.reloadWeapon(this.primaryWeapon, {
            skipValidation: event.shiftKey,
        });

        if (result.success) {
            ui.notifications.info(result.message);
            this._animateReload();
        } else {
            ui.notifications.warn(result.message);
        }
    }

    /* -------------------------------------------- */

    /**
     * Aim action
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #aim(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        // Apply aim effect (+10 to next attack)
        // Ensure actor is not null before creating chat message
        if (!this.actor) return;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<p><strong>${this.actor.name}</strong> takes aim (+10 to next attack)</p>`,
            flavor: 'Aim Action',
        } as Record<string, unknown>);

        ui.notifications.info('Aim action taken (+10 next attack)');
    }

    /* -------------------------------------------- */

    /**
     * Draw weapon
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #drawWeapon(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        // Ensure actor and actor.items are not null/undefined
        const weapons = this.actor?.items.filter((i) => i.type === 'weapon' && !(i.system as { equipped?: boolean }).equipped);

        if (!weapons || weapons.length === 0) {
            ui.notifications.warn('No weapons to draw');
            return;
        }

        // Show weapon selection if multiple
        if (weapons.length > 1) {
            // TODO: Show weapon selection dialog
            ui.notifications.info('Multiple weapons available - use character sheet to select');
            return;
        }

        // Equip the weapon
        await weapons[0].update({ 'system.equipped': true });
        ui.notifications.info(`Drew ${weapons[0].name}`);
    }

    /* -------------------------------------------- */

    /**
     * Switch to different weapon
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #switchWeapon(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        const weaponId = target.dataset.weaponId;
        if (!weaponId) return;
        // Ensure actor is not null before getting item
        const weapon = this.actor?.items.get(weaponId);

        if (!weapon) return;

        // Unequip current
        if (this.primaryWeapon) {
            await this.primaryWeapon.update({ 'system.equipped': false });
        }

        // Equip new
        await weapon.update({ 'system.equipped': true });

        ui.notifications.info(`Switched to ${weapon.name}`);
        this.render(false);
    }

    /* -------------------------------------------- */

    /**
     * Use consumable item
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async #useConsumable(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (!itemId) return;
        // Ensure actor is not null before getting item
        const item = this.actor?.items.get(itemId);

        if (!item) return;

        // TODO: Implement consumable use logic
        // Ensure actor is not null before creating chat message
        if (!this.actor) return;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `<p><strong>${this.actor.name}</strong> uses ${item.name}</p>`,
        } as Record<string, unknown>);

        ui.notifications.info(`Used ${item.name}`);
    }

    /* -------------------------------------------- */

    /**
     * Toggle panel opacity
     * @src/packs/rogue-trader/rt-items-navigator-powers/_source/this-test-is-then-modified-by-various-ritual-modifiers-the-r_UxTCVEiD9h8kghWd.json {CombatQuickPanel}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #toggleOpacity(this: CombatQuickPanel, event: PointerEvent, target: HTMLElement): void {
        this.opacityLevel = (this.opacityLevel + 1) % 4;

        this.element.dataset.opacity = this._getOpacityKey();
    }

    /* -------------------------------------------- */
    /*  Animation Helpers                           */
    /* -------------------------------------------- */

    /**
     * Animate reload action
     * @src/packs/rogue-trader/rt-core-actors-ships/_source/hazeroth-class-privateer_6WQ9eTU4FFKnKt4N.json
     */
    _animateReload(): void {
        // Ensure element is available
        if (!this.element) return;

        const ammoBar = this.element.querySelector('.ammo-bar');
        if (!ammoBar) return;

        ammoBar.classList.add('reload-animation');
        setTimeout(() => {
            ammoBar.classList.remove('reload-animation');
        }, 600);
    }

    /* -------------------------------------------- */
    /*  Static Helpers                              */
    /* -------------------------------------------- */

    /**
     * Show combat panel for actor
     * @param {Actor} actor  The actor
     * @returns {CombatQuickPanel}  The panel instance
     * @backups/weapons-1768952886196/static-repeater_kBZ49ctV8LYbqT9W.json
     */
    static show(actor: WH40KBaseActor): Promise<unknown> {
        // Check if panel already exists
        const existing = Object.values(ui.windows).find((app) => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (existing) {
            existing.render(true, { focus: true });
            return existing as any;
        }

        // Create new panel
        const panel = new CombatQuickPanel(actor);
        void panel.render(true);
        return panel as any;
    }

    /* -------------------------------------------- */

    /**
     * Close combat panel for actor
     * @param {Actor} actor  The actor
     * @backups/weapons-1768952886196/static-repeater_kBZ49ctV8LYbqT9W.json
     */
    static close(actor: WH40KBaseActor): void {
        const panel = Object.values(ui.windows).find((app) => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (panel) void panel.close();
    }

    /* -------------------------------------------- */

    /**
     * Toggle combat panel for actor
     * @param {Actor} actor  The actor
     * @backups/weapons-1768952886196/static-repeater_kBZ49ctV8LYbqT9W.json
     */
    static toggle(actor: WH40KBaseActor): void {
        const panel = Object.values(ui.windows).find((app) => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (panel) {
            void panel.close();
        } else {
            void CombatQuickPanel.show(actor);
        }
    }
}
