/**
 * @file VoidcraftActorSheet - Voidcraft (ship-scale) actor sheet using
 * ApplicationV2 with the PARTS system. Renamed from the former VoidcraftActorSheet;
 * the schema/fields are identical (hullType / voidShields / shipPoints /
 * components / weaponCapacity / …) — only the name changed.
 */

import VoidcraftData, {
    ESSENTIAL_SHIP_SLOTS,
    SHIP_MODIFIER_STAT_KEYS,
    type ShipAppliedModifier,
    type ShipModifierStatKey,
    type ShipStatModifierSource,
    type VoidcraftBuildValidation,
} from '../../data/actor/voidcraft.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KVoidcraft } from '../../documents/voidcraft.ts';
import { RollTableUtils } from '../../utils/roll-table-utils.ts';
import BaseActorSheet from './base-actor-sheet.ts';

/** One ship-action row surfaced in the Extended / Manoeuvre Actions tabs. */
interface ShipActionRow {
    uuid: string;
    id: string;
    name: string;
    img: string;
    skill: string;
    modifier: number;
    duration: string;
    description: string;
    requirements: string;
    typeAndAction: string;
}

/**
 * Chat-card payload shared by the Extended Action and Manoeuvre Action
 * dispatchers. A `type` alias (not an interface) so it carries the implicit
 * index signature `renderTemplate`'s `Record<string, unknown>` param requires.
 */
type ActionCardData = {
    action: {
        name: string | null;
        img: string;
        skill: string;
        modifier: number;
        duration: string;
        requirements: string;
        typeAndAction: string;
        description: string;
    };
    actorName: string | null;
    gameSystem: string;
};

/** Localization key per essential slot for the build panel. */
const ESSENTIAL_SLOT_LABEL_KEY: Record<string, string> = {
    plasmaDrive: 'WH40K.ShipComponent.Type.PlasmaDrive',
    warpDrive: 'WH40K.ShipComponent.Type.WarpDrive',
    gellarField: 'WH40K.ShipComponent.Type.GellarField',
    voidShields: 'WH40K.ShipComponent.Type.VoidShields',
    bridge: 'WH40K.ShipComponent.Type.Bridge',
    lifeSupport: 'WH40K.ShipComponent.Type.LifeSupport',
    quarters: 'WH40K.ShipComponent.Type.Quarters',
    auger: 'WH40K.ShipComponent.Type.Auger',
};

/** Localization key per applied-modifier stat for the Build Summary panel (issue #196). */
const BUILD_STAT_LABEL_KEY: Record<ShipModifierStatKey, string> = {
    speed: 'WH40K.Voidcraft.Build.Stat.Speed',
    manoeuvrability: 'WH40K.Voidcraft.Build.Stat.Manoeuvrability',
    detection: 'WH40K.Voidcraft.Build.Stat.Detection',
    armour: 'WH40K.Voidcraft.Build.Stat.Armour',
    hullIntegrity: 'WH40K.Voidcraft.Build.Stat.HullIntegrity',
    turretRating: 'WH40K.Voidcraft.Build.Stat.TurretRating',
    voidShields: 'WH40K.Voidcraft.Build.Stat.VoidShields',
    morale: 'WH40K.Voidcraft.Build.Stat.Morale',
    crewRating: 'WH40K.Voidcraft.Build.Stat.CrewRating',
    ballisticSkill: 'WH40K.Voidcraft.Build.Stat.BallisticSkill',
    weaponCapacityDorsal: 'WH40K.Voidcraft.Build.Stat.WeaponCapacityDorsal',
    weaponCapacityProw: 'WH40K.Voidcraft.Build.Stat.WeaponCapacityProw',
    weaponCapacityPort: 'WH40K.Voidcraft.Build.Stat.WeaponCapacityPort',
    weaponCapacityStarboard: 'WH40K.Voidcraft.Build.Stat.WeaponCapacityStarboard',
    weaponCapacityKeel: 'WH40K.Voidcraft.Build.Stat.WeaponCapacityKeel',
};

/**
 * Actor sheet for Voidcraft (ship-scale) actors.
 * Uses V2 PARTS system for modular template rendering.
 */
export default class VoidcraftActorSheet extends BaseActorSheet {
    /** @override */
    static override DEFAULT_OPTIONS: Partial<ApplicationV2Config.DefaultOptions> = {
        ...BaseActorSheet.DEFAULT_OPTIONS,
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 actions accept method references and bind `this` itself */
        actions: {
            ...BaseActorSheet.DEFAULT_OPTIONS.actions,
            fireShipWeapon: VoidcraftActorSheet.#fireShipWeapon,
            rollInitiative: VoidcraftActorSheet.#rollInitiative,
            validateBuild: VoidcraftActorSheet.#validateBuild,
            commitBuild: VoidcraftActorSheet.#commitBuild,
            dispatchExtendedAction: VoidcraftActorSheet.#dispatchExtendedAction,
            dispatchManoeuvreAction: VoidcraftActorSheet.#dispatchManoeuvreAction,
            raiseVoidShield: VoidcraftActorSheet.#raiseVoidShield,
            lowerVoidShield: VoidcraftActorSheet.#lowerVoidShield,
            restoreVoidShields: VoidcraftActorSheet.#restoreVoidShields,
            rollShipCriticalHit: VoidcraftActorSheet.#rollShipCriticalHit,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        classes: ['wh40k-rpg', 'sheet', 'actor', 'voidcraft'],
        position: {
            width: 900,
            height: 700,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'stats', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...((BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS ?? {}),
        header: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/header.hbs',
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tabs.hbs',
        },
        stats: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-stats.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        components: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-components.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        weapons: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-weapons.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        crew: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-crew.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        history: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-history.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        extendedActions: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-extended-actions.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
        manoeuvreActions: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/tab-manoeuvre-actions.hbs',
            container: { classes: ['wh40k-body'], id: 'tab-body' },
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS: HandlebarsApplicationV14.TabDescriptor[] = [
        { tab: 'stats', label: 'WH40K.Voidcraft.Tabs.Stats', group: 'primary', cssClass: 'tab-stats' },
        { tab: 'components', label: 'WH40K.Voidcraft.Tabs.Components', group: 'primary', cssClass: 'tab-components' },
        { tab: 'weapons', label: 'WH40K.Voidcraft.Tabs.Weapons', group: 'primary', cssClass: 'tab-weapons' },
        { tab: 'crew', label: 'WH40K.Voidcraft.Tabs.Crew', group: 'primary', cssClass: 'tab-crew' },
        { tab: 'history', label: 'WH40K.Voidcraft.Tabs.History', group: 'primary', cssClass: 'tab-history' },
        { tab: 'extendedActions', label: 'WH40K.Voidcraft.Tabs.ExtendedActions', group: 'primary', cssClass: 'tab-extended-actions' },
        { tab: 'manoeuvreActions', label: 'WH40K.Voidcraft.Tabs.ManoeuvreActions', group: 'primary', cssClass: 'tab-manoeuvre-actions' },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups: HandlebarsApplicationV14.TabGroupsState = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 _prepareContext returns untyped record
    override async _prepareContext(options: ApplicationV2Config.RenderOptions): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);
        // isGM + dh now come from BaseActorSheet._prepareCommonContext via super.

        // Prepare ship-specific data
        this._prepareShipData(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare starship-specific data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: render context is an untyped Record per ApplicationV2 contract
    _prepareShipData(context: Record<string, unknown>): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const items = actor.items;

        // Get ship components grouped by type
        context['shipComponents'] = items.filter((item: WH40KItem) => item.type === 'shipComponent');
        context['shipWeapons'] = items.filter((item: WH40KItem) => item.type === 'shipWeapon');
        context['shipUpgrades'] = items.filter((item: WH40KItem) => item.type === 'shipUpgrade');
        context['shipRoles'] = items.filter((item: WH40KItem) => item.type === 'shipRole');

        // Power and space are computed authoritatively by the DataModel's
        // prepareEmbeddedData (the same component/weapon/upgrade accumulation,
        // run before render); bind the prepared values rather than re-walking
        // the item list here, so the sheet can never disagree with the model.
        // `generated` / `available` are written at prepare time but live outside
        // the SchemaField type, so the read is through a structural view.
        const shipSystem = this.actor.system as {
            power?: { generated?: number; used?: number; available?: number };
            space?: { used?: number; available?: number };
        };
        context['powerGenerated'] = shipSystem.power?.generated ?? 0;
        context['powerUsed'] = shipSystem.power?.used ?? 0;
        context['spaceUsed'] = shipSystem.space?.used ?? 0;
        context['powerAvailable'] = shipSystem.power?.available ?? 0;
        context['spaceAvailable'] = shipSystem.space?.available ?? 0;

        // SP-budget panel context (issue #190). The DataModel computes
        // `buildValidation` during prepareDerivedData; fall back to a freshly
        // calculated value when the actor was constructed before the schema
        // was extended (legacy worlds prior to migration running).
        const sys = this.actor.system as {
            buildValidation?: VoidcraftBuildValidation;
            shipPoints?: { budget?: number; spent?: number };
        };
        let buildValidation: VoidcraftBuildValidation;
        if (sys.buildValidation) {
            buildValidation = sys.buildValidation;
        } else {
            const budget = sys.shipPoints?.budget ?? 0;
            // eslint-disable-next-line no-restricted-syntax -- boundary: items collection iterates as untyped objects in the legacy fallback path
            const itemViews = [...actor.items].map((it) => ({
                type: it.type,
                system: it.system as { componentType?: string; condition?: string; shipPoints?: number; essential?: boolean },
            }));
            buildValidation = VoidcraftData.validateBuild(budget, itemViews);
        }
        context['buildValidation'] = buildValidation;

        const missing = new Set(buildValidation.missingEssentialSlots);
        context['essentialSlots'] = ESSENTIAL_SHIP_SLOTS.map((slot) => ({
            id: slot,
            labelKey: ESSENTIAL_SLOT_LABEL_KEY[slot] ?? slot,
            filled: !missing.has(slot),
        }));

        // Build Summary rows (issue #196). Walks the live applied-modifier
        // rollup from prepareEmbeddedData; falls back to a freshly-computed
        // rollup when the actor predates the schema extension.
        this._prepareBuildSummary(context, actor);
    }

    /**
     * Populate `buildSummaryRows` + `hasAppliedModifiers` on the render
     * context. Each row pairs a stat's pre-modifier base with the signed total
     * contributed by owned components, upgrades, and roles. Stats with no
     * applied modifiers are filtered out so the panel only shows meaningful
     * contributions.
     *
     * @issue #196
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: render context is an untyped Record per ApplicationV2 contract
    _prepareBuildSummary(context: Record<string, unknown>, actor: WH40KVoidcraft): void {
        const sys = actor.system as {
            appliedModifiers?: Record<ShipModifierStatKey, ShipAppliedModifier>;
            baseStatSnapshot?: Record<ShipModifierStatKey, number>;
        };
        const applied: Record<ShipModifierStatKey, ShipAppliedModifier> = sys.appliedModifiers ?? VoidcraftData._emptyAppliedModifiers();

        // Reconstruct a base snapshot from current stat values when the actor
        // is legacy. The displayed base will then equal the displayed total —
        // technically correct (no modifiers means base == total) without
        // requiring a re-prep pass at render time.
        const sysShape = actor.system as {
            speed?: number;
            manoeuvrability?: number;
            detection?: number;
            armour?: number;
            hullIntegrity?: { max?: number };
            turretRating?: number;
            voidShields?: number;
            crew?: { morale?: { max?: number }; crewRating?: number };
            weaponCapacity?: { dorsal?: number; prow?: number; port?: number; starboard?: number; keel?: number };
        };
        const base: Record<ShipModifierStatKey, number> = sys.baseStatSnapshot ?? {
            speed: sysShape.speed ?? 0,
            manoeuvrability: sysShape.manoeuvrability ?? 0,
            detection: sysShape.detection ?? 0,
            armour: sysShape.armour ?? 0,
            hullIntegrity: sysShape.hullIntegrity?.max ?? 0,
            turretRating: sysShape.turretRating ?? 0,
            voidShields: sysShape.voidShields ?? 0,
            morale: sysShape.crew?.morale?.max ?? 0,
            crewRating: sysShape.crew?.crewRating ?? 0,
            ballisticSkill: sysShape.crew?.crewRating ?? 0,
            weaponCapacityDorsal: sysShape.weaponCapacity?.dorsal ?? 0,
            weaponCapacityProw: sysShape.weaponCapacity?.prow ?? 0,
            weaponCapacityPort: sysShape.weaponCapacity?.port ?? 0,
            weaponCapacityStarboard: sysShape.weaponCapacity?.starboard ?? 0,
            weaponCapacityKeel: sysShape.weaponCapacity?.keel ?? 0,
        };

        type Row = {
            statKey: ShipModifierStatKey;
            labelKey: string;
            base: number;
            modifier: number;
            total: number;
            sources: ShipStatModifierSource[];
        };
        const rows: Row[] = [];
        for (const statKey of SHIP_MODIFIER_STAT_KEYS) {
            const entry = applied[statKey];
            if (entry.sources.length === 0 && entry.total === 0) continue;
            const baseValue = base[statKey];
            rows.push({
                statKey,
                labelKey: BUILD_STAT_LABEL_KEY[statKey],
                base: baseValue,
                modifier: entry.total,
                total: baseValue + entry.total,
                sources: entry.sources,
            });
        }

        context['buildSummaryRows'] = rows;
        context['hasAppliedModifiers'] = rows.length > 0;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    /* eslint-disable no-restricted-syntax -- boundary: ApplicationV2 _preparePartContext signature uses untyped records */
    override async _preparePartContext(
        partId: string,
        context: Record<string, unknown>,
        options: ApplicationV2Config.RenderOptions,
    ): Promise<Record<string, unknown>> {
        /* eslint-enable no-restricted-syntax */
        // eslint-disable-next-line no-restricted-syntax -- boundary: super signature varies between V13/V14 typings
        const partContext = await super._preparePartContext(partId, context, options as unknown as Record<string, unknown>);

        // Add tab metadata for tab parts
        const tabParts = ['stats', 'components', 'weapons', 'crew', 'history', 'extendedActions', 'manoeuvreActions'];
        if (tabParts.includes(partId)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: subclass TABS not on shipped ApplicationV2 ctor type
            const ctor = this.constructor as unknown as { TABS: HandlebarsApplicationV14.TabDescriptor[] };
            const tabConfig = ctor.TABS.find((t: HandlebarsApplicationV14.TabDescriptor) => t.tab === partId);
            const group = tabConfig?.group ?? 'primary';
            partContext['tab'] = {
                id: partId,
                group,
                active: this.tabGroups[group] === partId,
                cssClass: tabConfig?.cssClass ?? '',
            };
        }

        if (partId === 'extendedActions') {
            partContext['extendedActions'] = await this._prepareExtendedActions();
        }

        if (partId === 'manoeuvreActions') {
            partContext['manoeuvreActions'] = await this._prepareManoeuvreActions();
        }

        return partContext;
    }

    /* -------------------------------------------- */

    /**
     * Resolve the list of starship Extended Actions to surface in the sheet.
     *
     * Pulls owned items of type `order` with `shipAction: true` AND any
     * `order` items from the active game system's compendium pack(s) that
     * carry the same flags. This keeps the list correct whether the GM has
     * already imported the compendium entries onto the actor or not — per
     * Direction #7 the source of truth is the compendium pack.
     *
     * @issue #186
     */
    async _prepareExtendedActions(): Promise<ShipActionRow[]> {
        return this._prepareShipActions('shipAction', 'ship-extended-actions');
    }

    /* -------------------------------------------- */

    /**
     * Resolve the list of starship Manoeuvre Actions to surface in the sheet.
     *
     * Mirrors `_prepareExtendedActions` but filters on the
     * `manoeuvreAction: true` flag so the fixed RAW Rogue Trader /
     * Battlefleet Koronus manoeuvre catalogue (Standard Move, Come to New
     * Heading, Hard Brake, Adjust Speed, All Stop, Disengage, Ramming Speed,
     * Evasive Manoeuvres, Burn Retros, Plot Course Change) surfaces as a
     * separate tab from the broader Extended Actions list. Per Direction #7
     * the source of truth is the compendium pack
     * `rt-items-ship-manoeuvre-actions` — content is never hardcoded in
     * `src/`.
     *
     * @issue #185
     */
    async _prepareManoeuvreActions(): Promise<ShipActionRow[]> {
        return this._prepareShipActions('manoeuvreAction', 'ship-manoeuvre-actions');
    }

    /* -------------------------------------------- */

    /**
     * Shared resolver for the Extended / Manoeuvre Actions tabs. Pulls owned
     * `order` items plus the active game system's `wh40k-rpg.<sys>-items-<suffix>`
     * compendium pack, keeping only those whose `filterFlag` is set and whose
     * optional `gameSystems` list admits the active system. Per Direction #7 the
     * compendium pack is the source of truth, so the list is correct whether or
     * not the GM has imported the entries onto the actor.
     */
    async _prepareShipActions(filterFlag: 'shipAction' | 'manoeuvreAction', packSuffix: string): Promise<ShipActionRow[]> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const gameSystemId = (actor.system as { gameSystem: string }).gameSystem;

        const out: ShipActionRow[] = [];
        const seenUuids = new Set<string>();

        const pushItem = (item: WH40KItem, uuid: string): void => {
            if (seenUuids.has(uuid)) return;
            seenUuids.add(uuid);
            const sys = item.system as {
                shipAction?: boolean;
                manoeuvreAction?: boolean;
                gameSystems?: string[];
                skill?: string;
                modifier?: number;
                duration?: string;
                requirements?: string;
                typeAndAction?: string;
                description?: { value?: string };
            };
            if (sys[filterFlag] !== true) return;
            const systems = sys.gameSystems ?? [];
            if (systems.length > 0 && !systems.includes(gameSystemId)) return;
            out.push({
                uuid,
                id: item.id ?? '',
                name: item.name,
                img: item.img ?? '',
                skill: sys.skill ?? '',
                modifier: sys.modifier ?? 0,
                duration: sys.duration ?? '',
                description: sys.description?.value ?? '',
                requirements: sys.requirements ?? '',
                typeAndAction: sys.typeAndAction ?? '',
            });
        };

        // 1. Owned items already on the actor.
        for (const item of actor.items) {
            if (item.type !== 'order') continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem.uuid not in shipped types for our narrow view
            const uuid = (item as unknown as { uuid?: string }).uuid ?? '';
            if (uuid === '') continue;
            pushItem(item, uuid);
        }

        // 2. Compendium pack: wh40k-rpg.<sys>-items-<suffix> (and any future per-system equivalent).
        // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs typing in fvtt-types is loose
        const packs = (globalThis as unknown as { game?: { packs?: { get?: (id: string) => unknown } } }).game?.packs;
        const packId = `wh40k-rpg.${gameSystemId}-items-${packSuffix}`;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry CompendiumCollection narrowed locally
        const pack = packs?.get?.(packId) as undefined | { getDocuments?: () => Promise<Array<WH40KItem & { uuid: string }>> };
        if (pack?.getDocuments !== undefined) {
            try {
                const docs = await pack.getDocuments();
                for (const doc of docs) {
                    if (doc.type !== 'order') continue;
                    pushItem(doc, doc.uuid);
                }
            } catch {
                // Pack unavailable (e.g. during early sheet renders before world ready) — silently skip.
            }
        }

        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle firing a ship weapon (issue #184).
     *
     * Implements the RAW Rogue Trader Battlefleet Koronus resolution:
     *   1. Roll a d100 BS test against the firing officer's BS (crewRating).
     *   2. On success, by weapon class:
     *      • Macrobattery — roll `strength` d6, every die ≥ 6 is one hit; the
     *        weapon's base damage is dealt per hit.
     *      • Lance — automatic single hit; void shields are ignored.
     *      • Other (torpedo, nova-cannon, bombardment, etc.) — fall back to a
     *        single hit pending dedicated resolution (out of scope for #184).
     *   3. For each hit, void shields absorb damage when raised (one shield is
     *      exhausted per macrobattery volley regardless of die count; lances
     *      bypass shields entirely per BFK).
     *   4. Damage that gets through reduces `hullIntegrity.value`.
     *   5. Post a structured chat card with the full breakdown.
     */
    static async #fireShipWeapon(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const weapon = actor.items.get(itemId ?? '');
        if (!weapon) {
            ui.notifications.warn(game.i18n.localize('WH40K.Voidcraft.Combat.NoWeapon'));
            return;
        }

        const sys = weapon.system as {
            weaponType?: string;
            strength?: number;
            damage?: string;
            crit?: number;
            range?: number;
            location?: string;
            special?: Set<string> | string[];
        };

        const crewRating = (actor.system as { crew?: { crewRating?: number } }).crew?.crewRating ?? 30;
        const weaponType = sys.weaponType ?? 'macrobattery';
        const strength = sys.strength ?? 1;
        const damageFormula = sys.damage ?? '1d10';

        // ── BS Test (1d100 vs crewRating) ───────────────────────────────────
        const bsRoll = await new Roll('1d100').evaluate();
        const bsTotal = bsRoll.total;
        const bsSucceeded = bsTotal <= crewRating;
        const dos = bsSucceeded ? Math.max(0, Math.floor((crewRating - bsTotal) / 10)) : 0;

        // ── Hit resolution ──────────────────────────────────────────────────
        let hits = 0;
        let hitsRoll: Roll | undefined;
        let damagePerHit = 0;
        const ignoresShields = weaponType === 'lance';

        if (bsSucceeded) {
            if (weaponType === 'macrobattery') {
                // Roll `strength` d6, count each ≥ 6 as a hit.
                hitsRoll = await new Roll(`${strength}d6cs>=6`).evaluate();
                hits = Number(hitsRoll.total ?? 0);
            } else {
                // Lance / fallback: single hit.
                hits = 1;
            }
        }

        // ── Damage roll (per hit) ───────────────────────────────────────────
        const dmgRolled = await Promise.all(Array.from({ length: hits }, async () => new Roll(damageFormula).evaluate()));
        const damageRolls: { total: number; formula: string }[] = dmgRolled.map((r) => ({
            total: Number(r.total),
            formula: damageFormula,
        }));
        let totalDamage = 0;
        for (const dr of damageRolls) {
            damagePerHit = dr.total;
            totalDamage += dr.total;
        }

        // ── Apply void shields (issue #184 RAW: shields absorb hits) ────────
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KVoidcraftSystemData carries voidShieldsStatus on the concrete subclass not the shared ActorDataModel union; narrow via unknown
        const shieldStatusBefore = (actor.system as unknown as { voidShieldsStatus: { active: number; exhausted: number } }).voidShieldsStatus;
        let shieldsActive = shieldStatusBefore.active;
        let shieldsExhausted = shieldStatusBefore.exhausted;
        let shieldedDamage = 0;
        let appliedDamage = totalDamage;

        if (!ignoresShields && hits > 0 && shieldsActive > 0) {
            // One macrobattery volley exhausts at most one shield (regardless of
            // how many dice came up ≥6); damage that pass through is the rest.
            shieldedDamage = totalDamage; // entire volley absorbed by one shield
            appliedDamage = 0;
            shieldsActive -= 1;
            shieldsExhausted += 1;
        }

        // ── Apply hull damage ───────────────────────────────────────────────
        const hullBefore = (actor.system as { hullIntegrity: { value: number; max: number } }).hullIntegrity;
        const hullCurrentBefore = hullBefore.value;
        const hullCurrentAfter = Math.max(0, hullCurrentBefore - appliedDamage);

        // ── Persist actor state (hull + shield exhaustion) ──────────────────
        // Issue #189 — route hull damage through `applyHullDamage` so the
        // RT Crew Population / Morale economy decrements (and the
        // Hold Fast! / Triage prior-turn snapshot records) automatically.
        // Non-RT hulls still take hull damage but skip the crew/morale tick.
        if (appliedDamage > 0) {
            await actor.applyHullDamage(appliedDamage);
        }
        if (!ignoresShields && hits > 0 && shieldStatusBefore.active !== shieldsActive) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Actor.update signature is untyped at our narrow view
            await (actor as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
                'system.voidShieldsStatus.active': shieldsActive,
                'system.voidShieldsStatus.exhausted': shieldsExhausted,
            });
        }

        // ── Build chat card ─────────────────────────────────────────────────
        const cardData = {
            actor,
            weapon,
            crewRating,
            gameSystem: (actor.system as { gameSystem: string }).gameSystem,
            resolution: {
                weaponType,
                weaponTypeLabel: game.i18n.localize(
                    `WH40K.ShipWeapon.Type.${weaponType
                        .split('-')
                        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                        .join('')}`,
                ),
                location: sys.location ?? 'dorsal',
                strength,
                damageFormula,
                bs: {
                    target: crewRating,
                    total: bsTotal,
                    succeeded: bsSucceeded,
                    dos,
                },
                hits,
                hitsFormula: hitsRoll?.formula ?? '',
                damageRolls,
                totalDamage,
                ignoresShields,
                shieldedDamage,
                appliedDamage,
                shieldsBefore: shieldStatusBefore.active,
                shieldsAfter: ignoresShields ? shieldStatusBefore.active : shieldsActive,
                hullBefore: hullCurrentBefore,
                hullAfter: hullCurrentAfter,
                hullMax: hullBefore.max,
            },
        };
        // Silence "unused-binding" lints; damagePerHit is computed for callers/tests.
        void damagePerHit;

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-weapon-chat.hbs', cardData);

        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KVoidcraft satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        const payload = {
            user: game.user.id,
            speaker,
            content: html,
            rolls: [bsRoll, ...(hitsRoll ? [hitsRoll] : [])],
            // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }

    /* -------------------------------------------- */

    /**
     * Raise one void shield (issue #184). Increments `voidShieldsStatus.active`
     * up to the hull's `voidShields` cap, drawing from the exhausted pool if
     * any are available, otherwise refusing the request (the hull only has so
     * many emitters). Players use this to bring a previously dropped shield
     * back online when the round resets.
     */
    static async #raiseVoidShield(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const sys = actor.system as {
            voidShields?: number;
            voidShieldsStatus?: { active?: number; exhausted?: number };
        };
        const max = sys.voidShields ?? 0;
        const active = sys.voidShieldsStatus?.active ?? 0;
        const exhausted = sys.voidShieldsStatus?.exhausted ?? 0;
        if (active >= max) {
            ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Combat.AllShieldsUp'));
            return;
        }
        if (exhausted <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.Voidcraft.Combat.NoShieldsExhausted'));
            return;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update accepts dotted-path Record
        await (actor as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.voidShieldsStatus.active': active + 1,
            'system.voidShieldsStatus.exhausted': exhausted - 1,
        });
    }

    /* -------------------------------------------- */

    /**
     * Lower one void shield (issue #184). Manually drops an active shield
     * without spending it — used when the captain orders shields lowered (e.g.
     * to vent heat, allow teleportation, or other RAW edge cases). The
     * dropped shield moves to the exhausted pool.
     */
    static async #lowerVoidShield(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const sys = actor.system as {
            voidShieldsStatus?: { active?: number; exhausted?: number };
        };
        const active = sys.voidShieldsStatus?.active ?? 0;
        const exhausted = sys.voidShieldsStatus?.exhausted ?? 0;
        if (active <= 0) {
            ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Combat.AllShieldsDown'));
            return;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update accepts dotted-path Record
        await (actor as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.voidShieldsStatus.active': active - 1,
            'system.voidShieldsStatus.exhausted': exhausted + 1,
        });
    }

    /* -------------------------------------------- */

    /**
     * Restore all exhausted shields at end of round (issue #184). Resets
     * `voidShieldsStatus` so `active` equals the configured `voidShields` max
     * and `exhausted` returns to zero. Called by the GM at round refresh.
     */
    static async #restoreVoidShields(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const max = (actor.system as { voidShields: number }).voidShields;
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update accepts dotted-path Record
        await (actor as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
            'system.voidShieldsStatus.active': max,
            'system.voidShieldsStatus.exhausted': 0,
        });
        ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Combat.ShieldsRestored'));
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {VoidcraftActorSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollInitiative is defined on Starship document; not on Actor.Implementation
        const a = this.actor as unknown as { rollInitiative?: () => Promise<void> };
        await a.rollInitiative?.();
    }

    /* -------------------------------------------- */

    /**
     * Returns the current `VoidcraftBuildValidation` for this starship and
     * surfaces it to the player via `ui.notifications`. Used by the
     * "Validate Build" button in the SP-budget panel (issue #190).
     *
     * Pure helper: does not mutate the actor. The commit-button enabled state
     * is already wired against the same `buildValidation` in the template.
     */
    static #validateBuild(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): void {
        const validation = this.computeBuildValidation();
        const i18n = game.i18n;
        if (validation.isValid) {
            ui.notifications.info(i18n.localize('WH40K.Voidcraft.Build.NotifyValid'));
        } else {
            const parts: string[] = [];
            if (validation.isOverBudget) {
                parts.push(
                    i18n.format('WH40K.Voidcraft.Build.NotifyOverBudgetBy', {
                        amount: String(validation.spent - validation.budget),
                    }),
                );
            }
            if (validation.missingEssentialSlots.length > 0) {
                parts.push(
                    i18n.format('WH40K.Voidcraft.Build.NotifyMissingSlots', {
                        count: String(validation.missingEssentialSlots.length),
                    }),
                );
            }
            ui.notifications.warn(parts.join(' — '));
        }
    }

    /* -------------------------------------------- */

    /**
     * Block-the-commit handler. Refuses to "save" the build when the validation
     * fails and otherwise notifies success. The actual persistence of the build
     * happens through the existing item add/remove flow — this handler exists
     * so the template can wire `data-action="commitBuild"` to a single point
     * that enforces the invariant. (Issue #190 explicitly requires that the
     * build cannot be saved with missing essentials or an over-budget total.)
     */
    static #commitBuild(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): void {
        const validation = this.computeBuildValidation();
        if (!validation.isValid) {
            ui.notifications.error(game.i18n.localize('WH40K.Voidcraft.Build.NotifyCannotCommit'));
            return;
        }
        ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Build.NotifyCommitted'));
    }

    /* -------------------------------------------- */

    /**
     * Compute and return the build validation result for this actor. Prefers
     * the live `system.buildValidation` populated by `prepareDerivedData`; if
     * absent (legacy world pre-migration), reconstructs it from owned items.
     */
    computeBuildValidation(): VoidcraftBuildValidation {
        const sys = this.actor.system as {
            buildValidation?: VoidcraftBuildValidation;
            shipPoints?: { budget?: number };
        };
        if (sys.buildValidation) return sys.buildValidation;
        const budget = sys.shipPoints?.budget ?? 0;
        // eslint-disable-next-line no-restricted-syntax -- boundary: items collection iterates as untyped Foundry CollectionEntries
        const a = this.actor as unknown as { items: Iterable<{ type: string; system: unknown }> };
        const itemViews = [...a.items].map((it) => ({
            type: it.type,
            system: it.system as { componentType?: string; condition?: string; shipPoints?: number; essential?: boolean },
        }));
        return VoidcraftData.validateBuild(budget, itemViews);
    }

    /* -------------------------------------------- */

    /**
     * Resolve a starship action item from a clicked control: `data-action-uuid`
     * (compendium/world) first, then `data-action-id` (owned). Warns with the
     * given langpack key and returns undefined when neither resolves. Shared by
     * the Extended Action and Manoeuvre Action dispatchers.
     */
    async #resolveActionItem(target: HTMLElement, actor: WH40KVoidcraft, emptyKey: string): Promise<WH40KItem | undefined> {
        const uuid = target.dataset['actionUuid'] ?? '';
        const itemId = target.dataset['actionId'] ?? '';

        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.utils.fromUuid is loosely typed in fvtt-types
        const fromUuidFn = (globalThis as unknown as { fromUuid?: (uuid: string) => Promise<unknown> }).fromUuid;
        let item: WH40KItem | undefined;
        if (uuid !== '' && fromUuidFn !== undefined) {
            try {
                item = (await fromUuidFn(uuid)) as WH40KItem | undefined;
            } catch {
                item = undefined;
            }
        }
        if (item === undefined && itemId !== '') {
            item = actor.items.get(itemId);
        }
        if (item === undefined) {
            ui.notifications.warn(game.i18n.localize(emptyKey));
        }
        return item;
    }

    /* -------------------------------------------- */

    /** Build the shared chat-card payload both action dispatchers render. */
    #buildActionCardData(item: WH40KItem, actor: WH40KVoidcraft): ActionCardData {
        const sys = item.system as {
            skill?: string;
            modifier?: number;
            duration?: string;
            requirements?: string;
            typeAndAction?: string;
            description?: { value?: string };
        };
        return {
            action: {
                name: item.name,
                img: item.img ?? '',
                skill: sys.skill ?? '',
                modifier: sys.modifier ?? 0,
                duration: sys.duration ?? '',
                requirements: sys.requirements ?? '',
                typeAndAction: sys.typeAndAction ?? '',
                description: sys.description?.value ?? '',
            },
            actorName: actor.name,
            gameSystem: (actor.system as { gameSystem: string }).gameSystem,
        };
    }

    /* -------------------------------------------- */

    /** Render an action chat-card template and post it under the actor's speaker. */
    async #postActionCard(actor: WH40KVoidcraft, template: string, cardData: ActionCardData): Promise<void> {
        const html = await foundry.applications.handlebars.renderTemplate(template, cardData);
        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KVoidcraft satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        const payload = { user: game.user.id, speaker, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }

    /* -------------------------------------------- */

    /**
     * Dispatch a starship Extended Action to chat (issue #186).
     *
     * Locates the action either by `data-action-uuid` (compendium or world)
     * or `data-action-id` (owned), renders the chat card template, and posts
     * it to the chat log. Mechanical resolution (rolls, modifiers, success
     * effects) is intentionally out of scope at this stage and is a follow-up.
     */
    static async #dispatchExtendedAction(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const item = await this.#resolveActionItem(target, actor, 'WH40K.Voidcraft.ExtendedAction.Empty');
        if (item === undefined) return;

        const cardData = this.#buildActionCardData(item, actor);

        // Issue #189 — route content-agnostic shipActionEffect tags into the
        // RT Crew/Morale economy. Compendium-side, Hold Fast! / Triage opt-in
        // via `system.shipActionEffect = 'cancelPriorTurnDamage'`; replenish
        // helpers opt in via `'replenishMorale'`. No name string-matching.
        const effectSys = item.system as { shipActionEffect?: string };
        const effect = effectSys.shipActionEffect ?? '';
        if (effect === 'cancelPriorTurnDamage') {
            const restored = await actor.cancelPriorTurnDamage();
            const i18n = game.i18n;
            if (restored.hullRestored > 0 || restored.crewRestored > 0 || restored.moraleRestored > 0) {
                ui.notifications.info(
                    i18n.format('WH40K.Voidcraft.Crew.NotifyCancelled', {
                        hull: String(restored.hullRestored),
                        crew: String(restored.crewRestored),
                        morale: String(restored.moraleRestored),
                    }),
                );
            } else {
                ui.notifications.info(i18n.localize('WH40K.Voidcraft.Crew.NotifyNothingToCancel'));
            }
        } else if (effect === 'replenishMorale') {
            await actor.replenishBetweenCombat();
            ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Crew.NotifyReplenished'));
        }

        await this.#postActionCard(actor, 'systems/wh40k-rpg/templates/chat/extended-action-chat.hbs', cardData);
    }

    /* -------------------------------------------- */

    /**
     * Roll on the Rogue Trader Critical Hit chart (issue #187).
     *
     * Per RAW (Battlefleet Koronus), when hull integrity damage triggers a
     * critical hit the ship rolls 1d5 on the Critical Hit chart. Each result
     * (1–5) applies a persistent status that lasts until cleared by an
     * Emergency Repair or Quick Repair extended action.
     *
     * Resolution order, mirroring the divination roll in issue #199:
     *   1. world `RollTable.getName("Critical Hit")` — GM-imported copy;
     *   2. `wh40k-rpg.rt-core-rolltables-ship-combat` compendium pack;
     *   3. fallback to a bare 1d5 with the `WH40K.Voidcraft.Critical.TableUnavailable`
     *      message — the player still gets a result and the GM is told to
     *      apply the corresponding effect by hand.
     *
     * The drawn result is appended to `system.shipStatuses` (a typed array
     * on `VoidcraftData`) AND posted to chat via the
     * `ship-critical-hit-chat.hbs` template.
     */
    static async #rollShipCriticalHit(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const i18n = game.i18n;

        // Resolve the Critical Hit table via the shared util: world tables
        // first, then the RT ship-combat compendium pack (scoped so a shared
        // "Critical Hit" name can't mis-resolve across systems), with the util's
        // out-of-range clamp. The d5 fallback below remains the last branch.
        let rolled = 0;
        let resultText = '';
        const draw = await RollTableUtils.rollTable('Critical Hit', {
            displayChat: false,
            pack: 'wh40k-rpg.rt-core-rolltables-ship-combat',
        });
        if (draw !== null) {
            rolled = draw.roll.total ?? 0;
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's RollTable result Collection is untyped; reading the drawn result's display text
            const first = (draw.results as unknown as Array<{ text?: string }>)[0];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json has the flag off, but tsc (flag on) types the array index as possibly-undefined and requires this optional chain
            resultText = first?.text ?? '';
        }

        // Fallback — bare 1d5 with table-unavailable message.
        if (resultText === '') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Roll typings vary between versions
            const RollCtor = (globalThis as unknown as { Roll?: new (formula: string) => { evaluate: () => Promise<{ total: number }>; total?: number } }).Roll;
            if (RollCtor !== undefined) {
                try {
                    const roll = new RollCtor('1d5');
                    const result = await roll.evaluate();
                    rolled = result.total;
                } catch {
                    rolled = Math.floor(Math.random() * 5) + 1;
                }
            } else {
                rolled = Math.floor(Math.random() * 5) + 1;
            }
            resultText = i18n.format('WH40K.Voidcraft.Critical.TableUnavailable', { rolled: String(rolled) });
        }

        // Map 1d5 result → stable status id + localized label.
        const STATUS_IDS = ['vacuum', 'fire', 'bridge', 'drive', 'crew'] as const;
        const STATUS_LABEL_KEYS = [
            'WH40K.Voidcraft.Critical.Effect.Vacuum',
            'WH40K.Voidcraft.Critical.Effect.Fire',
            'WH40K.Voidcraft.Critical.Effect.Bridge',
            'WH40K.Voidcraft.Critical.Effect.Drive',
            'WH40K.Voidcraft.Critical.Effect.Crew',
        ] as const;
        const idx = Math.min(Math.max(rolled, 1), 5) - 1;
        const statusId = STATUS_IDS[idx] ?? 'vacuum';
        const statusLabel = i18n.localize(STATUS_LABEL_KEYS[idx] ?? STATUS_LABEL_KEYS[0]);

        // Append to system.shipStatuses (persistent until cleared by a repair action).
        const sys = actor.system as { shipStatuses?: Array<{ id: string; rolled: number; text: string; appliedAt: number }> };
        const existing = Array.isArray(sys.shipStatuses) ? sys.shipStatuses : [];
        const next = [...existing, { id: statusId, rolled, text: resultText, appliedAt: Date.now() }];
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update payload is a Foundry framework boundary
            await (actor as unknown as { update: (data: Record<string, unknown>) => Promise<unknown> }).update({
                'system.shipStatuses': next,
            });
        } catch {
            // Update may fail in test / mock contexts — chat card still posts.
        }

        // Render and post chat card.
        const cardData = {
            actorName: actor.name,
            resultName: statusLabel,
            resultText,
            statusLabel,
            rolled,
            rollLabel: i18n.format('WH40K.Voidcraft.Critical.RollLabel', { rolled: String(rolled) }),
            image: 'icons/svg/explosion.svg',
            gameSystem: (actor.system as { gameSystem: string }).gameSystem,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ship-critical-hit-chat.hbs', cardData);

        const speaker = ChatMessage.getSpeaker({
            // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KVoidcraft satisfies Actor.Implementation but typings widen
            actor: actor as unknown as Actor.Implementation,
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload not in shipped types for our card shape
        const payload = { user: game.user.id, speaker, content: html } as unknown as Parameters<typeof ChatMessage.create>[0];
        void ChatMessage.create(payload);
    }

    /* -------------------------------------------- */

    /**
     * Dispatch a starship Manoeuvre Action to chat (issue #185).
     *
     * Locates the manoeuvre action either by `data-action-uuid` (compendium
     * or world) or `data-action-id` (owned), renders the manoeuvre-action
     * chat card template, and posts it to the chat log. Mechanical
     * resolution (Pilot (Spacecraft) Tests, Manoeuvrability modifiers,
     * heading updates) is intentionally out of scope at this stage and
     * remains a follow-up.
     */
    static async #dispatchManoeuvreAction(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const item = await this.#resolveActionItem(target, actor, 'WH40K.Voidcraft.ManoeuvreAction.Empty');
        if (item === undefined) return;

        const cardData = this.#buildActionCardData(item, actor);
        await this.#postActionCard(actor, 'systems/wh40k-rpg/templates/chat/manoeuvre-action-chat.hbs', cardData);
    }
}
