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

import { ReloadActionManager } from '../../actions/reload-action-manager.ts';
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { t } from '../../i18n/t.ts';

const { ApplicationV2 } = foundry.applications.api;

/** ApplicationV2 action handler bound to a `CombatQuickPanel` instance. */
type ActionHandler = (this: CombatQuickPanel, event: Event, target: HTMLElement) => Promise<void> | void;

/* -------------------------------------------- */
/*  Local adapter types                         */
/* -------------------------------------------- */

/** Persisted panel position (subset of the V2 position struct). */
interface PanelPosition {
    top?: number;
    left?: number;
    width?: number;
    height?: number | 'auto';
}

/** Minimal Combatant view the panel needs. */
interface CombatantView {
    id: string | null;
    actorId?: string;
    initiative: number | null;
}

/**
 * Locate the combatant entry for a given actor id within the current combat.
 * Foundry's `Combatant` exposes `actorId` and `initiative` at runtime but the
 * upstream types under `fvtt-types` don't surface them at the top level; this
 * helper concentrates the boundary cast in a single place.
 */
function findCombatantForActor(actorId: string): CombatantView | null {
    const combatants = game.combat?.combatants;
    if (!combatants) return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Combatant exposes actorId/initiative at runtime; fvtt-types omits them.
    const found = combatants.find((c) => (c as unknown as CombatantView).actorId === actorId) as unknown as CombatantView | undefined;
    return found ?? null;
}

/** Flag-bearing user (game.user) — narrows just the two flag methods we touch. */
interface FlaggableUser {
    getFlag(scope: string, key: string): PanelPosition | undefined;
    setFlag(scope: string, key: string, value: PanelPosition): Promise<void>;
}

/**
 * Read the typed flag accessor view of `game.user`. Foundry's User document
 * exposes `getFlag` / `setFlag` at runtime but the upstream type doesn't
 * thread the per-flag value type through; the boundary is contained here.
 */
function flaggableUser(): FlaggableUser {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry User#getFlag/setFlag exist at runtime; upstream type does not surface them generically.
    return game.user as unknown as FlaggableUser;
}

/** Rate-of-fire descriptor used by the panel. */
interface PanelRateOfFire {
    single?: number | boolean | string;
    semiAuto?: boolean;
    fullAuto?: boolean;
}

/** Weapon system fields read by the panel that aren't on the canonical schema. */
interface PanelWeaponSystem {
    equipped?: boolean;
    damage?: string;
    penetration?: number;
    range?: string | number;
    clip?: { value?: number; max?: number };
    effectiveClipMax?: number;
    ammoPercentage?: number;
    rateOfFire?: PanelRateOfFire;
}

/** Gear/consumable system fields. */
interface PanelGearSystem {
    equipped?: boolean;
    consumable?: boolean;
}

/** Roll-action options bag accepted by the PC/NPC subclasses. */
// eslint-disable-next-line no-restricted-syntax -- boundary: rollWeaponAttack/rollSkill option bag is opaque cross-cutting config consumed by per-system roll dialogs.
type RollOptions = Record<string, unknown>;

/** Subset of WH40KBaseActor that this panel calls into for rolls. The two methods
 *  are defined on the PC/NPC subclasses (acolyte / npc) and may be absent on a
 *  bare base actor; we keep them optional and let the runtime guard at the call
 *  site (`this.actor?.rollWeaponAttack(...)`) preserve original behavior. */
interface CombatPanelActor extends WH40KBaseActor {
    rollWeaponAttack?: (weaponId: string, options: RollOptions) => Promise<void>;
    rollSkill?: (skill: string, options: RollOptions) => Promise<void>;
}

/** Prepared weapon view returned to the template. */
interface PreparedWeaponData {
    none?: boolean;
    id?: string | null;
    name?: string | null;
    img?: string | null;
    damage?: string;
    penetration?: number;
    range?: string | number;
    clip?: { value?: number; max?: number };
    ammo?: { current: number; max: number; percentage: number; low: boolean };
    rateOfFire?: PanelRateOfFire;
}

/** Prepared quick action entry. */
interface QuickAction {
    action: string;
    icon: string;
    label: string;
    disabled?: boolean;
    tooltip: string;
}

export default class CombatQuickPanel extends ApplicationV2 {
    /* -------------------------------------------- */
    /*  Configuration                               */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'combat-quick-panel-{id}',
        classes: ['wh40k-rpg', 'combat-hud', 'floating-panel'],
        tag: 'aside',
        window: {
            // eslint-disable-next-line no-restricted-syntax -- boundary: value IS a WH40K.* i18n key, but the ESLint selector flags any literal here.
            title: 'WH40K.CombatPanel.Title',
            icon: 'fa-solid fa-crosshairs',
            minimizable: true,
            resizable: false,
            positioned: true,
        },
        position: {
            width: 340,
            // V2 accepts 'auto' for height but the upstream type is `number`; the
            // string is the documented sentinel for content-driven sizing.
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry V2 accepts the literal 'auto' though the upstream type narrows to number.
            height: 'auto' as unknown as number,
        },
        actions: {
            // eslint-disable-next-line @typescript-eslint/unbound-method
            rollInitiative: CombatQuickPanel.#rollInitiative as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            standardAttack: CombatQuickPanel.#standardAttack as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            semiAutoAttack: CombatQuickPanel.#semiAutoAttack as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            fullAutoAttack: CombatQuickPanel.#fullAutoAttack as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            dodge: CombatQuickPanel.#dodge as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            parry: CombatQuickPanel.#parry as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            reload: CombatQuickPanel.#reload as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            aim: CombatQuickPanel.#aim as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            drawWeapon: CombatQuickPanel.#drawWeapon as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            switchWeapon: CombatQuickPanel.#switchWeapon as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            useConsumable: CombatQuickPanel.#useConsumable as ActionHandler,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            toggleOpacity: CombatQuickPanel.#toggleOpacity as ActionHandler,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        panel: {
            template: 'systems/wh40k-rpg/templates/hud/combat-quick-panel.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    actor: CombatPanelActor | null = null;

    primaryWeapon: WH40KItem | null = null;

    declare setPosition: (pos: PanelPosition) => void;

    reactionsUsed = {
        dodge: false,
        parry: false,
    };

    /** Current opacity level (0-3) */
    opacityLevel = 0;

    /* -------------------------------------------- */
    /*  Construction                                */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 ctor options bag is framework-defined.
    constructor(actor: WH40KBaseActor, options: Record<string, unknown> = {}) {
        super(options);
        this.actor = actor;
        this._updatePrimaryWeapon();
    }

    /* -------------------------------------------- */

    _updatePrimaryWeapon(): void {
        if (!this.actor) return;
        const equipped = this.actor.items.find((i) => {
            if (i.type !== 'weapon') return false;
            const sys = i.system as PanelWeaponSystem;
            return sys.equipped === true;
        });
        this.primaryWeapon = equipped ?? null;
    }

    /* -------------------------------------------- */

    /** @override */
    get title(): string {
        const name = this.actor?.name;
        if (name === undefined || name === '') {
            return t('WH40K.CombatPanel.TitleWithActor', { name: t('WH40K.CombatPanel.UnknownActor') });
        }
        return t('WH40K.CombatPanel.TitleWithActor', { name });
    }

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext signature is framework-defined.
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        if (!this.actor) return context;

        context.actor = this.actor;
        context.system = this.actor.system;

        const wounds = this.actor.system.wounds;
        context.wounds = {
            value: wounds.value,
            max: wounds.max,
            percentage: Math.round((wounds.value / wounds.max) * 100),
            critical: wounds.value <= 0,
            low: wounds.value <= wounds.max * 0.25,
        };

        // eslint-disable-next-line no-restricted-syntax -- boundary: fatigue is declared optional on the shared WH40KActorSystemData (some actor types — vehicles, starships — never carry it); tightening would cascade across 7 systems.
        const fatigue = this.actor.system.fatigue ?? { value: 0, max: 0 };
        context.fatigue = {
            value: fatigue.value,
            max: fatigue.max,
            percentage: fatigue.max > 0 ? Math.round((fatigue.value / fatigue.max) * 100) : 0,
            exhausted: fatigue.value >= fatigue.max,
        };

        // Initiative
        const actorId = this.actor.id;
        const combatant = actorId !== null ? findCombatantForActor(actorId) : null;
        const initiativeBonus = this.actor.system.initiative.bonus;
        const combatantInit = combatant?.initiative ?? null;
        context.initiative = {
            rolled: combatantInit !== null,
            value: combatantInit ?? 0,
            bonus: initiativeBonus,
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
        context.consumables = this.actor.items
            .filter((i) => {
                if (i.type !== 'gear') return false;
                const sys = i.system as PanelGearSystem;
                return sys.consumable === true && sys.equipped === true;
            })
            .slice(0, 3);

        // Panel state
        context.opacityLevel = this.opacityLevel;
        context.opacityKey = this._getOpacityKey();

        return context;
    }

    /* -------------------------------------------- */

    _prepareWeaponData(weapon: WH40KItem | null): PreparedWeaponData {
        if (!weapon) {
            return {
                none: true,
                name: t('WH40K.CombatPanel.NoWeaponEquipped'),
            };
        }

        const sys = weapon.system as PanelWeaponSystem;
        const rof = sys.rateOfFire ?? {};
        const clipValue = sys.clip?.value ?? 0;
        const clipMaxResolved = sys.effectiveClipMax ?? sys.clip?.max ?? 0;

        return {
            id: weapon.id,
            name: weapon.name,
            img: weapon.img,
            damage: sys.damage,
            penetration: sys.penetration ?? 0,
            range: sys.range,
            clip: sys.clip,
            ammo: {
                current: clipValue,
                max: clipMaxResolved,
                percentage: sys.ammoPercentage ?? 100,
                low: clipValue <= clipMaxResolved * 0.25,
            },
            rateOfFire: {
                single: rof.single,
                semiAuto: rof.semiAuto,
                fullAuto: rof.fullAuto,
            },
        };
    }

    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: returned to the Handlebars template context (Record-shaped by template convention).
    _prepareReactions(): Record<string, unknown> {
        const skills = this.actor?.system.skills;
        const dodge = skills?.dodge;
        const parry = skills?.parry;

        return {
            dodge: {
                available: !this.reactionsUsed.dodge,
                target: dodge?.current ?? 0,
                label: dodge !== undefined ? t('WH40K.CombatPanel.DodgeWithRank', { rank: dodge.current }) : t('WH40K.CombatPanel.Dodge'),
            },
            parry: {
                available: !this.reactionsUsed.parry,
                target: parry?.current ?? 0,
                label: parry !== undefined ? t('WH40K.CombatPanel.ParryWithRank', { rank: parry.current }) : t('WH40K.CombatPanel.Parry'),
            },
            remaining: (this.reactionsUsed.dodge ? 0 : 1) + (this.reactionsUsed.parry ? 0 : 1),
        };
    }

    /* -------------------------------------------- */

    _prepareQuickActions(): QuickAction[] {
        const actions: QuickAction[] = [];

        // Reload (if weapon needs it)
        const weaponSys = this.primaryWeapon?.system as PanelWeaponSystem | undefined;
        if (weaponSys?.clip !== undefined) {
            const current = weaponSys.clip.value ?? 0;
            const max = weaponSys.clip.max ?? 0;

            actions.push({
                action: 'reload',
                icon: 'fa-solid fa-rotate',
                label: t('WH40K.CombatPanel.Reload'),
                disabled: current >= max,
                tooltip: current >= max ? t('WH40K.CombatPanel.FullyLoaded') : t('WH40K.CombatPanel.ReloadTooltip', { current, max }),
            });
        }

        // Aim
        actions.push({
            action: 'aim',
            icon: 'fa-solid fa-bullseye',
            label: t('WH40K.CombatPanel.Aim'),
            tooltip: t('WH40K.CombatPanel.AimTooltip'),
        });

        // Draw weapon
        const unequippedItems =
            this.actor?.items.filter((i) => {
                if (i.type !== 'weapon') return false;
                const itemSys = i.system as PanelWeaponSystem;
                return itemSys.equipped !== true;
            }) ?? [];
        const unequippedWeapons = unequippedItems.length;

        actions.push({
            action: 'drawWeapon',
            icon: 'fa-solid fa-hand-fist',
            label: t('WH40K.CombatPanel.Draw'),
            disabled: unequippedWeapons === 0,
            tooltip: unequippedWeapons > 0 ? t('WH40K.CombatPanel.DrawTooltip') : t('WH40K.CombatPanel.NoDrawTooltip'),
        });

        return actions;
    }

    /* -------------------------------------------- */

    _getOpacityKey(): string {
        const keys = ['full', 'high', 'medium', 'low'];
        return keys[this.opacityLevel] ?? keys[0];
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onRender signature is framework-defined.
    _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void {
        void super._onRender(context, options);

        this._restorePosition();
        this._subscribeToActor();
        this._subscribeToCombat();
    }

    /* -------------------------------------------- */

    _restorePosition(): void {
        const actorId = this.actor?.id ?? '';
        const savedPos = flaggableUser().getFlag('wh40k-rpg', `combatPanel.${actorId}.position`);
        if (savedPos !== undefined) {
            this.setPosition(savedPos);
        }
    }

    /* -------------------------------------------- */

    _subscribeToActor(): void {
        Hooks.on('updateActor', this._onActorUpdate.bind(this));
        Hooks.on('updateItem', this._onItemUpdate.bind(this));
    }

    /* -------------------------------------------- */

    _subscribeToCombat(): void {
        Hooks.on('combatRound', this._onCombatRound.bind(this));
        Hooks.on('deleteCombat', this._onCombatEnd.bind(this));
    }

    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _onClose signature is framework-defined.
    _onClose(options: Record<string, unknown>): void {
        const position = this.position;
        const actorId = this.actor?.id ?? '';
        void flaggableUser().setFlag('wh40k-rpg', `combatPanel.${actorId}.position`, {
            left: position.left,
            top: position.top,
        });

        /* eslint-disable @typescript-eslint/unbound-method -- Hooks.off accepts unbound method refs; this mirrors the original wiring (note: bind() created new refs at registration so removal is best-effort). */
        Hooks.off('updateActor', this._onActorUpdate);
        Hooks.off('updateItem', this._onItemUpdate);
        Hooks.off('combatRound', this._onCombatRound);
        Hooks.off('deleteCombat', this._onCombatEnd);
        /* eslint-enable @typescript-eslint/unbound-method */

        super._onClose(options);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    _onActorUpdate(actor: WH40KBaseActor): void {
        if (actor.id === this.actor?.id) {
            void this.render(false);
        }
    }

    /* -------------------------------------------- */

    _onItemUpdate(item: WH40KItem): void {
        if (item.actor?.id === this.actor?.id) {
            void this.render(false);
        }
    }

    /* -------------------------------------------- */

    _onCombatRound(): void {
        this.reactionsUsed = {
            dodge: false,
            parry: false,
        };
        void this.render(false);
    }

    /* -------------------------------------------- */

    _onCombatEnd(): void {
        void this.close();
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    static async #rollInitiative(this: CombatQuickPanel, _event: Event, _target: HTMLElement): Promise<void> {
        const actorId = this.actor?.id;
        if (actorId === undefined || actorId === null) return;
        const combatant = findCombatantForActor(actorId);
        if (combatant === null) {
            ui.notifications.warn(t('WH40K.CombatPanel.NotInCombat'));
            return;
        }

        if (!game.combat || combatant.id === null) return;
        await game.combat.rollInitiative([combatant.id]);
        const actorName = this.actor?.name ?? t('WH40K.CombatPanel.UnknownActor');
        ui.notifications.info(t('WH40K.CombatPanel.RolledInitiative', { name: actorName }));
    }

    /* -------------------------------------------- */

    static async #standardAttack(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        if (!this.primaryWeapon) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoWeapon'));
            return;
        }
        if (this.primaryWeapon.id === null) return;

        await this.actor?.rollWeaponAttack?.(this.primaryWeapon.id, {
            skipDialog: true,
            rateOfFire: 'single',
        });
    }

    /* -------------------------------------------- */

    static async #semiAutoAttack(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const rof = (this.primaryWeapon?.system as PanelWeaponSystem | undefined)?.rateOfFire;
        if (rof?.semiAuto !== true) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoSemiAuto'));
            return;
        }
        const weaponId = this.primaryWeapon?.id;
        if (weaponId === null || weaponId === undefined) return;

        await this.actor?.rollWeaponAttack?.(weaponId, {
            skipDialog: true,
            rateOfFire: 'semiAuto',
        });
    }

    /* -------------------------------------------- */

    static async #fullAutoAttack(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const rof = (this.primaryWeapon?.system as PanelWeaponSystem | undefined)?.rateOfFire;
        if (rof?.fullAuto !== true) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoFullAuto'));
            return;
        }
        const weaponId = this.primaryWeapon?.id;
        if (weaponId === null || weaponId === undefined) return;

        await this.actor?.rollWeaponAttack?.(weaponId, {
            skipDialog: true,
            rateOfFire: 'fullAuto',
        });
    }

    /* -------------------------------------------- */

    static async #dodge(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        if (this.reactionsUsed.dodge) {
            ui.notifications.warn(t('WH40K.CombatPanel.AlreadyDodged'));
            return;
        }

        const skill = this.actor?.system.skills.dodge;
        if (!skill) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoDodge'));
            return;
        }

        await this.actor?.rollSkill?.('dodge', { skipDialog: true });
        this.reactionsUsed.dodge = true;
        void this.render(false);
    }

    /* -------------------------------------------- */

    static async #parry(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        if (this.reactionsUsed.parry) {
            ui.notifications.warn(t('WH40K.CombatPanel.AlreadyParried'));
            return;
        }

        const skill = this.actor?.system.skills.parry;
        if (!skill) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoParry'));
            return;
        }

        await this.actor?.rollSkill?.('parry', { skipDialog: true });
        this.reactionsUsed.parry = true;
        void this.render(false);
    }

    /* -------------------------------------------- */

    static async #reload(this: CombatQuickPanel, event: PointerEvent, _target: HTMLElement): Promise<void> {
        if (!this.primaryWeapon) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoWeapon'));
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

    static async #aim(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.actor is nullable when the panel outlives its actor (post-deletion); fallback is a localized placeholder, not a schema default.
        const actorName = this.actor?.name ?? t('WH40K.CombatPanel.UnknownActor');
        await ChatMessage.create({
            // eslint-disable-next-line no-restricted-syntax -- boundary: getSpeaker accepts Actor | undefined; this.actor is null at the boundary, so coerce nullability away.
            speaker: ChatMessage.getSpeaker({ actor: this.actor ?? undefined }),
            content: t('WH40K.CombatPanel.AimContent', { name: actorName }),
            flavor: t('WH40K.CombatPanel.AimFlavor'),
        });

        ui.notifications.info(t('WH40K.CombatPanel.AimTaken'));
    }

    /* -------------------------------------------- */

    static async #drawWeapon(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        const weapons = this.actor?.items.filter((i: WH40KItem) => {
            if (i.type !== 'weapon') return false;
            const sys = i.system as PanelWeaponSystem;
            return sys.equipped !== true;
        });

        if (!weapons || weapons.length === 0) {
            ui.notifications.warn(t('WH40K.CombatPanel.NoWeaponsToDraw'));
            return;
        }

        if (weapons.length > 1) {
            // TODO: Show weapon selection dialog
            ui.notifications.info(t('WH40K.CombatPanel.MultipleWeapons'));
            return;
        }

        const chosen = weapons[0];
        await chosen.update({ 'system.equipped': true });
        ui.notifications.info(t('WH40K.CombatPanel.DrewWeapon', { name: chosen.name }));
    }

    /* -------------------------------------------- */

    static async #switchWeapon(this: CombatQuickPanel, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const weaponId = target.dataset.weaponId;
        if (weaponId === undefined || weaponId === '') return;
        const weapon = this.actor?.items.get(weaponId);

        if (!weapon) return;

        // Unequip current
        if (this.primaryWeapon) {
            await this.primaryWeapon.update({ 'system.equipped': false });
        }

        // Equip new
        await weapon.update({ 'system.equipped': true });

        ui.notifications.info(t('WH40K.CombatPanel.SwitchedWeapon', { name: weapon.name }));
        void this.render(false);
    }

    /* -------------------------------------------- */

    static async #useConsumable(this: CombatQuickPanel, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const itemId = target.dataset.itemId;
        if (itemId === undefined || itemId === '') return;
        const item = this.actor?.items.get(itemId);

        if (!item) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: this.actor is nullable when the panel outlives its actor (post-deletion); fallback is a localized placeholder, not a schema default.
        const actorName = this.actor?.name ?? t('WH40K.CombatPanel.UnknownActor');
        const itemName = item.name;
        // TODO: Implement consumable use logic
        await ChatMessage.create({
            // eslint-disable-next-line no-restricted-syntax -- boundary: getSpeaker accepts Actor | undefined; this.actor is null at the boundary, so coerce nullability away.
            speaker: ChatMessage.getSpeaker({ actor: this.actor ?? undefined }),
            content: t('WH40K.CombatPanel.ConsumableContent', { name: actorName, item: itemName }),
        });

        ui.notifications.info(t('WH40K.CombatPanel.UsedItem', { name: itemName }));
    }

    /* -------------------------------------------- */

    static #toggleOpacity(this: CombatQuickPanel, _event: PointerEvent, _target: HTMLElement): void {
        this.opacityLevel = (this.opacityLevel + 1) % 4;
        this.element.dataset.opacity = this._getOpacityKey();
    }

    /* -------------------------------------------- */
    /*  Animation Helpers                           */
    /* -------------------------------------------- */

    _animateReload(): void {
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

    static show(actor: WH40KBaseActor): CombatQuickPanel {
        const existing = Object.values(ui.windows).find((app): app is CombatQuickPanel => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (existing) {
            void existing.render(true);
            return existing;
        }

        const panel = new CombatQuickPanel(actor);
        void panel.render(true);
        return panel;
    }

    /* -------------------------------------------- */

    static close(actor: WH40KBaseActor): void {
        const panel = Object.values(ui.windows).find((app): app is CombatQuickPanel => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (panel) void panel.close();
    }

    /* -------------------------------------------- */

    static toggle(actor: WH40KBaseActor): void {
        const panel = Object.values(ui.windows).find((app): app is CombatQuickPanel => app instanceof CombatQuickPanel && app.actor?.id === actor.id);

        if (panel) {
            void panel.close();
        } else {
            void CombatQuickPanel.show(actor);
        }
    }
}
