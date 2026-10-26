/**
 * @file VoidcraftActorSheet - Voidcraft (ship-scale) actor sheet using
 * ApplicationV2 with the PARTS system. Renamed from the former VoidcraftActorSheet;
 * the schema/fields are identical (hullType / voidShields / shipPoints /
 * components / weaponCapacity / …) — only the name changed.
 */

import VoidcraftData, {
    CRIPPLED_SOURCE_TYPE,
    ESSENTIAL_SHIP_SLOTS,
    SHIP_MODIFIER_STAT_KEYS,
    type ShipAppliedModifier,
    type ShipModifierStatKey,
    type ShipStatModifierSource,
    type VoidcraftBuildValidation,
} from '../../data/actor/voidcraft.ts';
import type OrderData from '../../data/item/order.ts';
import type ShipWeaponData from '../../data/item/ship-weapon.ts';
import type { WH40KItem } from '../../documents/item.ts';
import type { WH40KVoidcraft } from '../../documents/voidcraft.ts';
import { pluralKey } from '../../i18n/plural.ts';
import { collectShipModifierComponents } from '../../rules/ship-action-effects.ts';
import { shipActionRows, toShipActionRow, type ShipActionKind, type ShipActionOrderView, type ShipActionRow } from '../../rules/ship-actions.ts';
import type { ShipTestComponent } from '../../rules/ship-assault.ts';
import { criticalRollLabelKey, shipConditionView } from '../../rules/ship-crippled.ts';
import { shipWeaponClass } from '../../rules/ship-weapon-fire.ts';
import type { I18nKey } from '../../types/i18n-keys';
import { firstSystemId } from '../../utils/chat-system-id.ts';
import { isLineOrHomebrewPack, queryItemIndex } from '../../utils/compendium-query.ts';
import { voidcraftHullTypeOptions } from '../../utils/ship-choices.ts';
import { openShipActionDialog } from '../ship-action/ship-action-dialog.ts';
import { shipActionModifierRows, type ShipActionModifierRow } from '../ship-action/ship-action-flow.ts';
import { openShipAssaultDialog } from '../ship-assault/ship-assault-dialog.ts';
import { foundryLocalize, type ShipAssaultTab } from '../ship-assault/ship-assault-flow.ts';
import { attachShipAssaults, findShipAssault, shipAssaultButtons, type ShipAssaultButton } from '../ship-assault/ship-assault-registry.ts';
import { createShipWeaponFireFlow, type ShipWeaponFireCompanion } from '../ship-assault/ship-weapon-fire-flow.ts';
import BaseActorSheet from './base-actor-sheet.ts';
import { SIDEBAR_CONTAINER } from './sidebar-container.ts';

/**
 * Chat-card payload shared by the Extended Action and Manoeuvre Action
 * dispatchers. A `type` alias (not an interface) so it carries the implicit
 * index signature `renderTemplate`'s `Record<string, unknown>` param requires.
 */
type ActionCardData = {
    action: ShipActionRow;
    actorName: string | null;
    gameSystem: string;
    _gameSystemId?: string | undefined;
};

/** An `order` item, its system typed to the OrderData DataModel. */
type OrderItem = WH40KItem & { system: OrderData };

/** A `shipWeapon` item, its system typed to the ShipWeaponData DataModel. */
type ShipWeaponItem = WH40KItem & { system: ShipWeaponData };

/** An `order` item viewed through the fields a ship-action row reads. */
function shipActionOrderView(item: WH40KItem): ShipActionOrderView {
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem.uuid not in shipped types for our narrow view
    const uuid = (item as unknown as { uuid?: string }).uuid ?? '';
    const order = item as OrderItem;
    return { uuid, id: item.id ?? '', name: item.name, img: item.img ?? '', system: order.system };
}

/**
 * The `order` items in a game line's own and homebrew Item packs. Found by
 * pack index (`type`), so no pack name is assumed; an unavailable pack (early
 * render before the world is ready) contributes nothing.
 */
async function loadLineOrders(line: string): Promise<ShipActionOrderView[]> {
    try {
        const uuids = await queryItemIndex(
            [],
            (entry) => (entry.type === 'order' ? entry.uuid : undefined),
            true,
            (packId) => isLineOrHomebrewPack(packId, line),
        );
        const docs = await Promise.all(uuids.map(async (uuid) => fromUuid(uuid)));
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns Foundry's untyped document union; the index already filtered to `order` Items
        return docs.filter((doc) => doc !== null).map((doc) => shipActionOrderView(doc as unknown as WH40KItem));
    } catch {
        return [];
    }
}

/** One Critical Hit the Stats tab lists: its table name, the roll and the rules text. */
interface ShipCriticalRow {
    index: number;
    label: string;
    rolled: number;
    /** How the result was rolled, as the Damage Control row prints it. */
    rollLabel: string;
    text: string;
}

/**
 * The ship's recorded Critical Hits (#187) as Stats-tab rows. A status saved
 * before statuses carried the drawn result's name is labelled by its roll.
 */
function shipCriticalRows(statuses: readonly { name: string; rolled: number; text: string; pastArmour: boolean }[]): ShipCriticalRow[] {
    return statuses.map((status, index) => ({
        index,
        label: status.name !== '' ? status.name : game.i18n.format('WH40K.Voidcraft.Critical.ResultLabel', { rolled: String(status.rolled) }),
        rolled: status.rolled,
        // A weapon's 1d5, or a Crippled ship's damage past its Armour (#187).
        rollLabel: game.i18n.format(criticalRollLabelKey(status.pastArmour), { rolled: String(status.rolled) }),
        text: status.text,
    }));
}

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
            removeShipStatus: VoidcraftActorSheet.#removeShipStatus,
            openShipAssault: VoidcraftActorSheet.#openShipAssault,
            rollShipAction: VoidcraftActorSheet.#rollShipAction,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
        // `player` opts into the shared sidebar + body grid (dark window body) the
        // character and craft sheets use; without it the canvas showed through.
        classes: ['wh40k-rpg', 'sheet', 'actor', 'player', 'voidcraft'],
        position: {
            width: 1000,
            height: 800,
        },
        tabs: [{ navSelector: 'nav.wh40k-navigation', contentSelector: '#tab-body', initial: 'stats', group: 'primary' }],
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS: Record<string, ApplicationV2Config.PartConfiguration> = {
        ...((BaseActorSheet as typeof BaseActorSheet & { PARTS?: Record<string, ApplicationV2Config.PartConfiguration> }).PARTS ?? {}),
        header: {
            template: 'systems/wh40k-rpg/templates/actor/voidcraft/header.hbs',
            container: SIDEBAR_CONTAINER,
        },
        tabs: {
            template: 'systems/wh40k-rpg/templates/actor/player/tabs.hbs',
            container: SIDEBAR_CONTAINER,
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

        // Hull type (#647): a select over WH40K.hullTypes in edit mode, its label read-only.
        context['hullTypeOptions'] = voidcraftHullTypeOptions(actor.system.hullType);
        context['hullTypeLabel'] = actor.system.hullTypeLabel;

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

        // Damage Control panel (Stats tab): raised void shields (#184) and the
        // Critical Hits the hull carries (#187).
        context['voidShieldsUp'] = actor.activeVoidShields;
        context['voidShieldsMax'] = actor.voidShields;
        context['shipCriticals'] = shipCriticalRows(actor.system.shipStatuses);
        // RT ship condition (#187): Crippled at 0 Hull, destroyed only by a Critical Hit result.
        // Other lines' voidcraft show neither — their sheet is unchanged.
        context['shipCondition'] = shipConditionView({
            gameSystem: actor.system.gameSystem,
            hullIntegrity: actor.hullIntegrity,
            statuses: actor.system.shipStatuses,
        });
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
            /** Derived ship BS — diverges from crewRating once a role grants a BS-only bonus (#196). */
            ballisticSkill?: number;
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
            // Read the derived field, not crewRating — they diverge once a role
            // grants a BS-only bonus (#196).
            ballisticSkill: sysShape.ballisticSkill ?? sysShape.crew?.crewRating ?? 0,
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
                // The Crippled-ship rule has no item to name it; it is named by the langpack (#187).
                sources: entry.sources.map((src) =>
                    src.type === CRIPPLED_SOURCE_TYPE ? { ...src, name: game.i18n.localize('WH40K.Voidcraft.Crippled.SourceName') } : src,
                ),
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
            // An action with a guided resolver (Hit and Run) is one row with both buttons (#701).
            const extended = attachShipAssaults(await this._prepareExtendedActions(), this._prepareShipAssaults('extended'));
            partContext['extendedActions'] = extended.rows;
            partContext['shipAssaults'] = extended.unmatched;
            partContext['shipActionModifiers'] = this._prepareShipActionModifiers();
        }

        if (partId === 'manoeuvreActions') {
            const manoeuvre = attachShipAssaults(await this._prepareManoeuvreActions(), this._prepareShipAssaults('manoeuvre'));
            partContext['manoeuvreActions'] = manoeuvre.rows;
            partContext['shipAssaults'] = manoeuvre.unmatched;
            partContext['shipActionModifiers'] = this._prepareShipActionModifiers();
        }

        return partContext;
    }

    /* -------------------------------------------- */

    /**
     * Resolve the list of starship Extended Actions to surface in the sheet:
     * the `order` items whose `actionType` is `extended-action`, owned or in
     * the voidcraft's line packs (see `_prepareShipActions`).
     *
     * @issue #186
     */
    async _prepareExtendedActions(): Promise<ShipActionRow[]> {
        return this._prepareShipActions('extended');
    }

    /* -------------------------------------------- */

    /**
     * The RT ship assault actions (ramming, boarding, Hit and Run, #188) a tab
     * offers. Empty for the other lines' voidcraft — the gate is explicit.
     */
    _prepareShipAssaults(tab: ShipAssaultTab): ShipAssaultButton[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        if (!actor.supportsShipAssault) return [];
        return shipAssaultButtons(tab, foundryLocalize);
    }

    /* -------------------------------------------- */

    /**
     * The ship-action modifiers in effect on this ship (Lock on Target, Aid the
     * Machine Spirit, Evasive Manoeuvres …, #186), localized for the action
     * tabs' "in effect" list. A Ballistic Skill modifier aimed at one Weapon
     * Component names it.
     */
    _prepareShipActionModifiers(): ShipActionModifierRow[] {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        return shipActionModifierRows(this.actor as unknown as WH40KVoidcraft, foundryLocalize);
    }

    /* -------------------------------------------- */

    /**
     * Resolve the list of starship Manoeuvre Actions to surface in the sheet.
     *
     * Mirrors `_prepareExtendedActions` for the `order` items whose
     * `actionType` is `maneuver-action` (Standard Move, Adjust Bearing,
     * Disengage, Ramming Speed, …).
     *
     * @issue #185
     */
    async _prepareManoeuvreActions(): Promise<ShipActionRow[]> {
        return this._prepareShipActions('manoeuvre');
    }

    /* -------------------------------------------- */

    /**
     * Shared resolver for the Extended / Manoeuvre Actions tabs: the `order`
     * items owned by the actor plus those in the voidcraft line's own and
     * homebrew Item packs (`<line>-…`, `hb-<line>-…`), listed by their
     * `actionType`. The packs are found by their index, not by name, so the
     * list holds whatever orders pack the line ships (RT: `rt-core-items-ship-orders`).
     * Per Direction #7 the compendium is the source of truth, so the list is
     * correct whether or not the GM has imported the entries onto the actor.
     */
    async _prepareShipActions(kind: ShipActionKind): Promise<ShipActionRow[]> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const line = actor.system.gameSystem;

        const orders: ShipActionOrderView[] = [];
        for (const item of actor.items) {
            if (item.type === 'order') orders.push(shipActionOrderView(item));
        }
        orders.push(...(await loadLineOrders(line)));
        return shipActionRows(orders, kind);
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Fire a Weapon Component at another ship (#184 — RT Core, Chapter VIII).
     *
     * Opens the shared ship dialog on the fire flow: the target ship comes
     * from the GM's targeted tokens, then the scene, then the world. The
     * gunner's Ballistic Skill Test carries this weapon's live ship-action
     * modifiers (Lock on Target, Come to New Heading, Evasive Manoeuvres, #186)
     * from the central collector; the hits, void shields, Armour, Hull Integrity
     * damage and any Critical Hit land on the **target**. Rogue Trader only, and
     * only for the weapon classes the core rules give firing rules for. A
     * macrobattery's dialog offers the ship's other macrobatteries for a salvo.
     */
    static #fireShipWeapon(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const itemId = target.closest<HTMLElement>('[data-item-id]')?.dataset['itemId'];
        const weapon = actor.items.get(itemId ?? '');
        if (weapon?.type !== 'shipWeapon') {
            ui.notifications.warn(game.i18n.localize('WH40K.Voidcraft.Combat.NoWeapon'));
            return;
        }
        if (!actor.supportsShipAssault) {
            ui.notifications.warn(game.i18n.localize('WH40K.Voidcraft.Fire.Unsupported'));
            return;
        }
        const system = (weapon as ShipWeaponItem).system;
        const weaponClass = shipWeaponClass(system.weaponType);
        if (weaponClass === null) {
            ui.notifications.warn(game.i18n.format('WH40K.Voidcraft.Fire.NoRules', { type: system.weaponTypeLabel }));
            return;
        }
        const bsModifiers = (id: string): ShipTestComponent[] =>
            collectShipModifierComponents(actor.shipActionEffects, { target: 'ballisticSkill', weaponId: id });
        // The ship's other macrobatteries may join this one in a salvo (RT Core p.221).
        const companions: ShipWeaponFireCompanion[] = [];
        for (const other of actor.shipWeapons) {
            const otherSystem = (other as ShipWeaponItem).system;
            const otherClass = shipWeaponClass(otherSystem.weaponType);
            const otherId = other.id;
            if (otherId === null || otherId === weapon.id || otherClass !== 'macrobattery') continue;
            companions.push({
                id: otherId,
                weapon: { name: other.name, img: other.img ?? '', weaponClass: otherClass, ...otherSystem.cardProfile },
                shipModifiers: bsModifiers(otherId),
            });
        }
        const entry = createShipWeaponFireFlow({
            weapon: { name: weapon.name, img: weapon.img ?? '', weaponClass, ...system.cardProfile },
            ballisticSkill: actor.system.ballisticSkill,
            shipModifiers: bsModifiers(weapon.id),
            companions,
        });
        openShipAssaultDialog(actor, entry);
    }

    /* -------------------------------------------- */

    /** Clear one Critical Hit status from the Stats tab once it is repaired (#187). */
    static async #removeShipStatus(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        const index = Number(target.dataset['statusIndex'] ?? '-1');
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        await (this.actor as unknown as WH40KVoidcraft).removeShipStatus(index);
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
                    i18n.format(pluralKey('WH40K.Voidcraft.Build.NotifyMissingSlots', validation.missingEssentialSlots.length, i18n.lang), {
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
    async #resolveActionItem(target: HTMLElement, actor: WH40KVoidcraft, notFoundKey: I18nKey): Promise<WH40KItem | undefined> {
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
            ui.notifications.warn(game.i18n.localize(notFoundKey));
        }
        return item;
    }

    /* -------------------------------------------- */

    /** Build the shared chat-card payload both action dispatchers render. */
    #buildActionCardData(item: WH40KItem, actor: WH40KVoidcraft): ActionCardData {
        return {
            action: toShipActionRow(shipActionOrderView(item)),
            actorName: actor.name,
            gameSystem: actor.system.gameSystem,
            _gameSystemId: firstSystemId(actor),
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
     * it to the chat log. Actions with an authored effect also get a Roll
     * button (`#rollShipAction`) that rolls the test and applies the effect.
     */
    static async #dispatchExtendedAction(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const item = await this.#resolveActionItem(target, actor, 'WH40K.Voidcraft.ExtendedAction.NotFound');
        if (item === undefined) return;

        const cardData = this.#buildActionCardData(item, actor);

        // Content-agnostic `shipActionEffect` tag (#189). The old blanket
        // `cancelPriorTurnDamage` route is gone: it restored all hull, crew
        // and morale with no test, which is not what Hold Fast! / Triage do.
        const effectSys = item.system as { shipActionEffect?: string };
        if (effectSys.shipActionEffect === 'replenishMorale') {
            await actor.replenishBetweenCombat();
            ui.notifications.info(game.i18n.localize('WH40K.Voidcraft.Crew.NotifyReplenished'));
        }

        await this.#postActionCard(actor, 'systems/wh40k-rpg/templates/chat/extended-action-chat.hbs', cardData);
    }

    /* -------------------------------------------- */

    /**
     * Roll on the Rogue Trader Critical Hit chart (issue #187).
     *
     * Per RAW (RT Core, "Starship Weapons"), a weapon's Critical Hit rolls 1d5
     * on the Critical Hit chart (Table 8-12). Each result applies a persistent
     * status that lasts until cleared by an Emergency Repair or Quick Repair
     * extended action (or the Stats tab's clear control).
     *
     * Resolution order, mirroring the divination roll in issue #199:
     *   1. world `RollTable.getName("Ship Critical Hits")` — GM-imported copy;
     *   2. the `wh40k-rpg.rt-core-rolltables` compendium pack;
     *   3. the bare 1d5 with the `WH40K.Voidcraft.Critical.TableUnavailable`
     *      message — the player still gets a result and the GM is told to
     *      apply the corresponding effect by hand.
     *
     * The drawn result is appended to `system.shipStatuses` (a typed array
     * on `VoidcraftData`, listed on the Stats tab) AND posted to chat via the
     * `ship-critical-hit-chat.hbs` template. The resolution lives on the
     * document (`WH40KVoidcraft.rollShipCriticalHit`) so Hit and Run can
     * inflict a chosen result through the same path.
     */
    static async #rollShipCriticalHit(this: VoidcraftActorSheet, _event: PointerEvent, _target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        await (this.actor as unknown as WH40KVoidcraft).rollShipCriticalHit();
    }

    /* -------------------------------------------- */

    /**
     * Open the RT ship assault dialog (ramming, boarding, Hit and Run, #188)
     * for the action named by the button's `data-assault`.
     */
    static #openShipAssault(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): void {
        const entry = findShipAssault(target.dataset['assault'] ?? '');
        if (entry === undefined) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        openShipAssaultDialog(this.actor as unknown as WH40KVoidcraft, entry);
    }

    /* -------------------------------------------- */

    /**
     * Roll a starship action that carries an authored effect (#186, #189):
     * Hold Fast!, Triage, Lock on Target, Aid the Machine Spirit, Flank Speed,
     * Come to New Heading, Evasive Manoeuvres. The dialog rolls the test and,
     * on a success, applies the order's `shipEffect` to this ship.
     */
    static async #rollShipAction(this: VoidcraftActorSheet, _event: PointerEvent, target: HTMLElement): Promise<void> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: BaseActorSheet exposes Actor.Implementation; narrowed to WH40KVoidcraft for ship-specific access
        const actor = this.actor as unknown as WH40KVoidcraft;
        const item = await this.#resolveActionItem(target, actor, 'WH40K.Voidcraft.ExtendedAction.NotFound');
        if (item === undefined) return;
        const view = shipActionOrderView(item);
        openShipActionDialog(
            actor,
            { uuid: view.uuid, name: view.name, img: view.img, test: view.system.test, shipEffect: view.system.shipEffect },
            view.system.requirements,
        );
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
        const item = await this.#resolveActionItem(target, actor, 'WH40K.Voidcraft.ManoeuvreAction.NotFound');
        if (item === undefined) return;

        const cardData = this.#buildActionCardData(item, actor);
        await this.#postActionCard(actor, 'systems/wh40k-rpg/templates/chat/manoeuvre-action-chat.hbs', cardData);
    }
}
