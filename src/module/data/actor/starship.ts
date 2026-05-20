import ActorDataModel from '../abstract/actor-data-model.ts';

/** Subset of ship-component item.system fields used in starship preparation. */
interface ShipComponentSystem {
    condition?: string;
    componentType?: string;
    essential?: boolean;
    power?: { generated?: number; used?: number } | number;
    space?: number;
    shipPoints?: number;
    modifiers?: Record<string, number>;
    /** ship-role only — bonuses applied while the role is staffed. */
    shipBonuses?: { manoeuvrability?: number; detection?: number; ballisticSkill?: number; crewRating?: number };
}

interface ShipItemView {
    id?: string;
    uuid?: string;
    name?: string;
    type: string;
    system: ShipComponentSystem;
    /** Foundry stamps a `_stats.compendiumSource` UUID on imported entries. */
    _stats?: { compendiumSource?: string };
}

/**
 * Stat keys that owned items can modify on a starship. Authored as a
 * literal-typed tuple so the iterator in `_recomputeAppliedModifiers` narrows
 * each key against the typed `appliedModifiers` record without needing a
 * runtime guard against Record-of-string widening.
 */
export const SHIP_MODIFIER_STAT_KEYS = [
    'speed',
    'manoeuvrability',
    'detection',
    'armour',
    'hullIntegrity',
    'turretRating',
    'voidShields',
    'morale',
    'crewRating',
    'ballisticSkill',
    'weaponCapacityDorsal',
    'weaponCapacityProw',
    'weaponCapacityPort',
    'weaponCapacityStarboard',
    'weaponCapacityKeel',
] as const;

/** Union of every stat key the modifier engine recognizes. */
export type ShipModifierStatKey = (typeof SHIP_MODIFIER_STAT_KEYS)[number];

/**
 * A single contribution to a modified ship stat. Identifies the source item
 * by both `uuid` (the world-relative UUID, suitable for `fromUuid()`) and
 * `sourceUuid` (the compendium UUID it was instantiated from, when known —
 * the canonical reference for Direction #11 UUID-primary content links).
 */
export interface ShipStatModifierSource {
    /** Display name from the owning item. */
    name: string;
    /** Item type (`shipComponent` | `shipUpgrade` | `shipRole`). */
    type: string;
    /** The world-instance UUID for hover-link / inspection. */
    uuid: string;
    /** The compendium UUID the item was instantiated from. Empty when world-only. */
    sourceUuid: string;
    /** Signed integer contribution to the stat. */
    value: number;
}

/** Per-stat applied-modifier rollup: total + ordered list of contributing sources. */
export interface ShipAppliedModifier {
    total: number;
    sources: ShipStatModifierSource[];
}

/**
 * RAW Rogue Trader requires every hull to be fitted with a fixed inventory of
 * essential components before launch. These slots are content-agnostic — they
 * apply to every hull class — so the slot list is a primitive enum maintained
 * in code. Each slot's *filling* (which compendium component fills it) is the
 * content-specific part and lives on the actor's owned items.
 */
export const ESSENTIAL_SHIP_SLOTS: readonly string[] = [
    'plasmaDrive',
    'warpDrive',
    'gellarField',
    'voidShields',
    'bridge',
    'lifeSupport',
    'quarters',
    'auger',
] as const;

/** Validation result for a starship build (computed in prepareDerivedData). */
export interface StarshipBuildValidation {
    /** SP currently allocated across owned components + weapons + upgrades. */
    spent: number;
    /** SP budget granted by the hull (mirrors `shipPoints.budget`). */
    budget: number;
    /** True when `spent > budget`. */
    isOverBudget: boolean;
    /** Essential slot names that have no owned component filling them. */
    missingEssentialSlots: string[];
    /** Convenience: build is valid iff !isOverBudget && missingEssentialSlots.length === 0. */
    isValid: boolean;
}

/**
 * Data model for Starship actors.
 * Matches template.json "starship" structure.
 */
export default class StarshipData extends ActorDataModel {
    // Typed property declarations matching defineSchema()
    declare hullType: string;
    declare hullClass: string;
    declare dimensions: string;
    declare crew: {
        population: number;
        crewRating: number;
        morale: {
            max: number;
            value: number;
        };
    };
    declare speed: number;
    declare manoeuvrability: number;
    declare detection: number;
    declare armour: number;
    declare voidShields: number;
    /**
     * Combat-state tracking for void shields (issue #184). `voidShields` (above)
     * is the hull's maximum shield count; this field tracks how many are
     * currently raised (`active`) versus exhausted by absorbed hits this round
     * (`exhausted`). Exhausted shields are reset each round by the GM via
     * the "Restore Shields" action. Defaults to all shields up.
     */
    declare voidShieldsStatus: {
        active: number;
        exhausted: number;
    };
    declare turretRating: number;
    declare hullIntegrity: {
        max: number;
        value: number;
    };
    declare space: {
        total: number;
        used: number;
        /** Computed in _prepareResources / prepareEmbeddedData */
        available: number;
        consumed?: number;
    };
    declare power: {
        total: number;
        used: number;
        /** Computed in _prepareResources / prepareEmbeddedData */
        available: number;
        generated?: number;
        consumed?: number;
    };
    declare shipPoints: {
        /** Total SP allocated across owned components / weapons / upgrades. Recomputed. */
        spent: number;
        /** SP budget granted by the hull (set on hull selection / from compendium). */
        budget: number;
    };
    declare components: Array<{ slot: string; itemUuid: string; sp: number }>;
    /** Computed by `prepareDerivedData()` — see `StarshipBuildValidation`. */
    declare buildValidation: StarshipBuildValidation;
    declare machineSpiritOddities: string;
    declare pastHistory: string;
    declare complications: string;
    declare weaponCapacity: {
        dorsal: number;
        prow: number;
        port: number;
        starboard: number;
        keel: number;
    };
    declare notes: string;

    /**
     * Active critical-hit statuses applied to the hull (issue #187).
     * Each entry records the source roll-table draw and identifies the
     * effect by a stable id (`vacuum` / `fire` / `bridge` / `drive` /
     * `crew`) so localized labels and per-effect handlers can resolve at
     * render / resolution time. Statuses persist until cleared by an
     * Emergency Repair or Quick Repair Extended Action.
     */
    declare shipStatuses: Array<{
        id: string;
        rolled: number;
        text: string;
        appliedAt: number;
    }>;

    /**
     * Prior-turn damage snapshot for the Hold Fast! / Triage cancel
     * mechanic (issue #189). Tracks the total Hull / Crew Population /
     * Morale lost during the most-recent fully-recorded strategic turn,
     * plus the turn number that snapshot belongs to. A Hold Fast! or
     * Triage extended action resolved on the *following* turn reverts
     * these losses; turn rollover (or actor reset) clears the record.
     *
     * Content-agnostic primitive (numbers only) per Direction #7 — the
     * compendium-side `order` items opt into the cancel by tagging
     * `system.shipActionEffect: 'cancelPriorTurnDamage'`.
     */
    declare priorTurnDamage: {
        hullLoss: number;
        crewLoss: number;
        moraleLoss: number;
        turn: number;
    };

    /** Computed during _prepareCombatStats */
    declare detectionBonus: number;
    declare hullPercentage: number;
    declare moralePercentage: number;

    /** Computed during prepareEmbeddedData */
    declare componentModifiers: Record<string, number>;

    /**
     * Computed during prepareEmbeddedData (issue #196). Maps every stat key in
     * `SHIP_MODIFIER_STAT_KEYS` to its applied rollup — a total delta and the
     * list of contributing items. Base stats from `defineSchema()` are mutated
     * in place to include each rollup's `total` so downstream code (rolls,
     * chat cards, derived getters) sees the post-modifier value without
     * threading the rollup through.
     */
    declare appliedModifiers: Record<ShipModifierStatKey, ShipAppliedModifier>;

    /**
     * Snapshot of the base stat values *before* applied modifiers are added.
     * Re-read on each prep so the Build Summary panel can show "base (+mod)".
     * Indexed by the same `ShipModifierStatKey` union used for `appliedModifiers`.
     */
    declare baseStatSnapshot: Record<ShipModifierStatKey, number>;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // Hull information (flat fields matching template.json)
            hullType: new fields.StringField({ required: false, initial: '', blank: true }),
            hullClass: new fields.StringField({ required: false, initial: '', blank: true }),
            dimensions: new fields.StringField({ required: false, initial: '', blank: true }),

            // Crew
            crew: new fields.SchemaField({
                population: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                crewRating: new fields.NumberField({ required: true, initial: 30, min: 0, max: 100, integer: true }),
                morale: new fields.SchemaField({
                    max: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                    value: new fields.NumberField({ required: true, initial: 100, min: 0, integer: true }),
                }),
            }),

            // Ship stats
            speed: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
            detection: new fields.NumberField({ required: true, initial: 0, integer: true }),
            armour: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            voidShields: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            // Combat-state tracking for void shields (issue #184).
            voidShieldsStatus: new fields.SchemaField({
                active: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                exhausted: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),
            turretRating: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),

            // Hull Integrity
            hullIntegrity: new fields.SchemaField({
                max: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                value: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Resources
            space: new fields.SchemaField({
                total: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                used: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),
            power: new fields.SchemaField({
                total: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                used: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Ship Points budget vs spent (issue #190 — RAW build validation).
            // `spent` is recomputed in prepareDerivedData from owned components;
            // `budget` is the hull's SP budget (mirrors the hull entry's shipPoints
            // value from the rt-core-actors-ships compendium).
            shipPoints: new fields.SchemaField({
                spent: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                budget: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Slot → component assignments for the build (issue #190). Sheet-side
            // UI fills this from drag-drops of compendium components; runtime
            // resolution walks the array and matches against owned items by UUID.
            components: new fields.ArrayField(
                new fields.SchemaField({
                    slot: new fields.StringField({ required: true, blank: false, initial: 'bridge' }),
                    itemUuid: new fields.StringField({ required: true, blank: true, initial: '' }),
                    sp: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                }),
                { required: true, initial: [] },
            ),

            // Ship quirks
            machineSpiritOddities: new fields.StringField({ required: false, initial: '', blank: true }),
            pastHistory: new fields.StringField({ required: false, initial: '', blank: true }),
            complications: new fields.StringField({ required: false, initial: '', blank: true }),

            // Weapon capacity per location
            weaponCapacity: new fields.SchemaField({
                dorsal: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                prow: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                port: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                starboard: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                keel: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),

            // Notes
            notes: new fields.StringField({ required: false, initial: '', blank: true }),

            // Critical-hit statuses applied to the hull (issue #187).
            // Each entry: { id: 'vacuum'|'fire'|'bridge'|'drive'|'crew', rolled: 1-5,
            // text: <result text>, appliedAt: <epoch ms> }. Cleared by Emergency
            // Repair / Quick Repair Extended Actions. Content-agnostic primitive
            // (just a typed shape) per Direction #7 — the rolltable in the
            // rt-core-rolltables-ship-combat compendium is the source of effect text.
            shipStatuses: new fields.ArrayField(
                new fields.SchemaField({
                    id: new fields.StringField({ required: true, blank: false, initial: 'vacuum' }),
                    rolled: new fields.NumberField({ required: true, initial: 1, min: 1, max: 5, integer: true }),
                    text: new fields.StringField({ required: true, blank: true, initial: '' }),
                    appliedAt: new fields.NumberField({ required: true, initial: 0, integer: true }),
                }),
                { required: true, initial: [] },
            ),

            // Prior-turn damage snapshot for Hold Fast! / Triage (issue #189).
            // All four numeric fields default to 0 — `turn: 0` is the sentinel
            // for "no snapshot recorded yet". See document `applyHullDamage` /
            // `cancelPriorTurnDamage` for the write path.
            priorTurnDamage: new fields.SchemaField({
                hullLoss: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                crewLoss: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                moraleLoss: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
                turn: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @override */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        this._prepareResources();
        this._prepareCombatStats();
        this._prepareBuildValidation();
    }

    /**
     * Migrate legacy numeric `shipPoints` (pre-#190) to the `{spent, budget}` shape.
     * Existing actors and compendium hull entries stored a single number — that
     * value is the hull's SP budget. The `spent` field is recomputed each prep.
     */
    static override migrateData(source: Record<string, unknown>): Record<string, unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: SystemDataModel.migrateData inherits an untyped Foundry signature
        const out = super.migrateData(source) ?? source;
        const sp = out['shipPoints'];
        if (typeof sp === 'number') {
            out['shipPoints'] = { spent: 0, budget: sp };
        } else if (sp !== undefined && sp !== null && typeof sp === 'object') {
            // Ensure both keys exist even when one was omitted.
            const obj = sp as Record<string, unknown>;
            const budget = typeof obj['budget'] === 'number' ? obj['budget'] : 0;
            const spent = typeof obj['spent'] === 'number' ? obj['spent'] : 0;
            out['shipPoints'] = { spent, budget };
        }
        return out;
    }

    /**
     * Calculate resource availability.
     * @protected
     */
    _prepareResources(): void {
        // Add computed available fields
        this.space.available = this.space.total - this.space.used;
        this.power.available = this.power.total - this.power.used;
    }

    /**
     * Calculate combat-derived stats.
     * @protected
     */
    _prepareCombatStats(): void {
        // Detection Bonus (tens digit) for initiative
        this.detectionBonus = Math.floor(this.detection / 10);

        // Void shield combat-state initialization (issue #184). When the shield
        // hull is configured but combat state has never been seeded (active = 0
        // and exhausted = 0), treat the ship as fully shielded — otherwise a
        // freshly imported / migrated actor would enter combat with no shields
        // raised, which contradicts the RAW assumption that shields are on by
        // default.
        if (this.voidShields > 0 && this.voidShieldsStatus.active === 0 && this.voidShieldsStatus.exhausted === 0) {
            this.voidShieldsStatus.active = this.voidShields;
        }
        // Cap active + exhausted against the configured maximum.
        if (this.voidShieldsStatus.active > this.voidShields) {
            this.voidShieldsStatus.active = this.voidShields;
        }

        // Hull percentage for status display
        if (this.hullIntegrity.max > 0) {
            this.hullPercentage = Math.round((this.hullIntegrity.value / this.hullIntegrity.max) * 100);
        } else {
            this.hullPercentage = 100;
        }

        // Morale percentage
        if (this.crew.morale.max > 0) {
            this.moralePercentage = Math.round((this.crew.morale.value / this.crew.morale.max) * 100);
        } else {
            this.moralePercentage = 100;
        }
    }

    /**
     * Seed `buildValidation` from current state. Called from `prepareDerivedData`
     * before items are loaded; the post-items pass in `prepareEmbeddedData`
     * refines `spent` and `missingEssentialSlots` once owned items are visible.
     * @protected
     */
    _prepareBuildValidation(): void {
        const budget = this.shipPoints.budget;
        const spent = this.shipPoints.spent; // may be stale until prepareEmbeddedData
        this.buildValidation = {
            spent,
            budget,
            isOverBudget: spent > budget,
            missingEssentialSlots: [...ESSENTIAL_SHIP_SLOTS],
            isValid: false,
        };
    }

    /**
     * Recompute SP spent and essential-slot coverage from owned items.
     * Walks every shipComponent / shipWeapon / shipUpgrade on the actor:
     *   • sums their `system.shipPoints` into `shipPoints.spent`;
     *   • marks each essential slot as covered when an owned component of that
     *     `componentType` is functional.
     * @protected
     */
    _refreshBuildValidation(items: Iterable<ShipItemView>): void {
        let spSpent = 0;
        const covered = new Set<string>();
        for (const item of items) {
            const sys = item.system;
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                spSpent += sys.shipPoints ?? 0;
            }
            if (item.type === 'shipComponent' && typeof sys.componentType === 'string') {
                // Only "functional" components count toward filling a required slot —
                // a destroyed bridge does not satisfy the bridge requirement.
                if (sys.condition === undefined || sys.condition === 'functional') {
                    covered.add(sys.componentType);
                    // Some compendium components are tagged `essential: true` but use
                    // an `essential` / `supplemental` componentType bucket; in that
                    // case fall back to the explicit flag.
                    if (sys.essential === true && sys.componentType === 'essential') {
                        // Cannot determine which slot it fills without more data;
                        // skip silently — the explicit slot types above are preferred.
                    }
                }
            }
        }

        this.shipPoints.spent = spSpent;

        const budget = this.shipPoints.budget;
        const missing: string[] = ESSENTIAL_SHIP_SLOTS.filter((slot) => !covered.has(slot));
        const isOverBudget = spSpent > budget;
        this.buildValidation = {
            spent: spSpent,
            budget,
            isOverBudget,
            missingEssentialSlots: missing,
            isValid: !isOverBudget && missing.length === 0,
        };
    }

    /**
     * Pure validator usable from tests and the sheet without prepping the full
     * DataModel. Returns a `StarshipBuildValidation` for the given budget and
     * iterable of component-like views.
     */
    static validateBuild(budget: number, items: Iterable<{ type: string; system: ShipComponentSystem }>): StarshipBuildValidation {
        let spent = 0;
        const covered = new Set<string>();
        for (const item of items) {
            const sys = item.system;
            if (item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade') {
                spent += sys.shipPoints ?? 0;
            }
            if (item.type === 'shipComponent' && typeof sys.componentType === 'string') {
                if (sys.condition === undefined || sys.condition === 'functional') {
                    covered.add(sys.componentType);
                }
            }
        }
        const missing: string[] = ESSENTIAL_SHIP_SLOTS.filter((slot) => !covered.has(slot));
        const isOverBudget = spent > budget;
        return {
            spent,
            budget,
            isOverBudget,
            missingEssentialSlots: missing,
            isValid: !isOverBudget && missing.length === 0,
        };
    }

    /**
     * Returns the zero-state for `appliedModifiers`. Every stat key in
     * `SHIP_MODIFIER_STAT_KEYS` is present with `total: 0` and an empty
     * `sources` array — the Build Summary panel can iterate the full set
     * without guarding on `undefined`.
     */
    static _emptyAppliedModifiers(): Record<ShipModifierStatKey, ShipAppliedModifier> {
        // eslint-disable-next-line no-restricted-syntax -- bootstrap: empty record is built up below before being returned
        const out = {} as Record<ShipModifierStatKey, ShipAppliedModifier>;
        for (const key of SHIP_MODIFIER_STAT_KEYS) {
            out[key] = { total: 0, sources: [] };
        }
        return out;
    }

    /**
     * Walk an iterable of ship items and produce a per-stat applied-modifier
     * rollup. Pure helper — no `this` state is read; usable from tests via
     * `StarshipData.computeAppliedModifiers(items)`.
     *
     *   • `shipComponent`s contribute their `system.modifiers` map (only when
     *     `condition === 'functional'` — a destroyed component grants no
     *     bonus).
     *   • `shipUpgrade`s contribute their `system.modifiers` map
     *     unconditionally; upgrades have no per-component condition tracking.
     *   • `shipRole`s contribute their `system.shipBonuses` block — the four
     *     RAW Rogue Trader role bonuses (manoeuvrability / detection /
     *     ballisticSkill / crewRating).
     *
     * Unknown modifier keys are dropped silently. The rollup only records
     * stats listed in `SHIP_MODIFIER_STAT_KEYS`.
     */
    static computeAppliedModifiers(items: Iterable<ShipItemView>): Record<ShipModifierStatKey, ShipAppliedModifier> {
        const out = StarshipData._emptyAppliedModifiers();
        const validKey = (k: string): k is ShipModifierStatKey => (SHIP_MODIFIER_STAT_KEYS as readonly string[]).includes(k);

        const apply = (item: ShipItemView, key: string, raw: number): void => {
            if (!validKey(key)) return;
            const value = Number(raw);
            if (!Number.isFinite(value) || value === 0) return;
            const slot = out[key];
            slot.total += value;
            slot.sources.push({
                name: item.name ?? '',
                type: item.type,
                uuid: item.uuid ?? '',
                sourceUuid: item._stats?.compendiumSource ?? '',
                value,
            });
        };

        for (const item of items) {
            const sys = item.system;
            if (item.type === 'shipComponent') {
                if (sys.condition !== undefined && sys.condition !== 'functional') continue;
                if (sys.modifiers !== undefined) {
                    for (const [key, value] of Object.entries(sys.modifiers)) {
                        apply(item, key, Number(value));
                    }
                }
            } else if (item.type === 'shipUpgrade') {
                if (sys.modifiers !== undefined) {
                    for (const [key, value] of Object.entries(sys.modifiers)) {
                        apply(item, key, Number(value));
                    }
                }
            } else if (item.type === 'shipRole' && sys.shipBonuses !== undefined) {
                const bonuses = sys.shipBonuses;
                apply(item, 'manoeuvrability', bonuses.manoeuvrability ?? 0);
                apply(item, 'detection', bonuses.detection ?? 0);
                apply(item, 'ballisticSkill', bonuses.ballisticSkill ?? 0);
                apply(item, 'crewRating', bonuses.crewRating ?? 0);
            }
        }
        return out;
    }

    /**
     * Calculate stats from equipped components.
     * Called by the Document after items are ready.
     */
    override prepareEmbeddedData(): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.items collection
        const actor = this.parent as { items?: Iterable<unknown> } | null | undefined;
        if (actor === null || actor === undefined) return;
        const items = actor.items;
        if (items === undefined) return;

        // Snapshot base stats BEFORE applying modifiers so the Build Summary
        // panel can show the breakdown (and so we can recompute idempotently
        // if prepareEmbeddedData runs more than once per render pass).
        this.baseStatSnapshot = {
            speed: this.speed,
            manoeuvrability: this.manoeuvrability,
            detection: this.detection,
            armour: this.armour,
            hullIntegrity: this.hullIntegrity.max,
            turretRating: this.turretRating,
            voidShields: this.voidShields,
            morale: this.crew.morale.max,
            crewRating: this.crew.crewRating,
            ballisticSkill: this.crew.crewRating, // RAW: ship BS == crew rating
            weaponCapacityDorsal: this.weaponCapacity.dorsal,
            weaponCapacityProw: this.weaponCapacity.prow,
            weaponCapacityPort: this.weaponCapacity.port,
            weaponCapacityStarboard: this.weaponCapacity.starboard,
            weaponCapacityKeel: this.weaponCapacity.keel,
        };

        // Calculate power and space from components
        let powerGenerated = 0;
        let powerUsed = 0;
        let spaceUsed = 0;

        // Collect items into an array once so we can pass the same view to
        // both the legacy power/space accumulator AND the new applied-modifier
        // engine without iterating the Foundry collection twice.
        const itemViews: ShipItemView[] = [];
        for (const rawItem of items) {
            itemViews.push(rawItem as ShipItemView);
        }

        // Track stat modifiers from components (legacy flat shape — preserved
        // for the older sheet bindings that read it directly).
        const componentModifiers: Record<string, number> = {
            speed: 0,
            manoeuvrability: 0,
            detection: 0,
            armour: 0,
            hullIntegrity: 0,
            turretRating: 0,
            voidShields: 0,
            morale: 0,
            crewRating: 0,
        };

        for (const item of itemViews) {
            const sys = item.system;
            if (item.type === 'shipComponent' && sys.condition === 'functional') {
                // Power
                const power = typeof sys.power === 'object' ? sys.power : undefined;
                const genPower = power?.generated ?? 0;
                const usePower = power?.used ?? 0;
                powerGenerated += genPower;
                powerUsed += usePower;

                // Space
                spaceUsed += sys.space ?? 0;

                // Modifiers (legacy flat rollup)
                if (sys.modifiers !== undefined) {
                    for (const [key, value] of Object.entries(sys.modifiers)) {
                        const existing = componentModifiers[key];
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Record<string,number> index may return undefined at runtime
                        if (existing !== undefined) {
                            componentModifiers[key] = existing + Number(value);
                        }
                    }
                }
            } else if (item.type === 'shipWeapon') {
                powerUsed += typeof sys.power === 'number' ? sys.power : 0;
                spaceUsed += sys.space ?? 0;
            } else if (item.type === 'shipUpgrade') {
                const power = typeof sys.power === 'object' ? sys.power : undefined;
                const genPower = power?.generated ?? 0;
                const usePower = power?.used ?? 0;
                powerGenerated += genPower;
                powerUsed += usePower;
                spaceUsed += sys.space ?? 0;
            }
        }

        // Store calculated values
        this.power.generated = powerGenerated;
        this.power.consumed = powerUsed;
        this.space.consumed = spaceUsed;

        // Update totals if auto-calculation is enabled
        this.power.total = powerGenerated;
        this.power.used = powerUsed;
        this.space.used = spaceUsed;

        // Recalculate availability
        this.space.available = this.space.total - this.space.used;
        this.power.available = this.power.total - this.power.used;

        // Store component modifiers for display
        this.componentModifiers = componentModifiers;

        // ── Apply per-stat modifiers from owned components / upgrades / roles ──
        // (Issue #196.) Rich rollup with per-source attribution; mutates the
        // base stats so derived getters and rolls see the post-modifier value.
        const applied = StarshipData.computeAppliedModifiers(itemViews);
        this.appliedModifiers = applied;

        this.speed = this.baseStatSnapshot.speed + applied.speed.total;
        this.manoeuvrability = this.baseStatSnapshot.manoeuvrability + applied.manoeuvrability.total;
        this.detection = this.baseStatSnapshot.detection + applied.detection.total;
        this.armour = this.baseStatSnapshot.armour + applied.armour.total;
        this.hullIntegrity.max = this.baseStatSnapshot.hullIntegrity + applied.hullIntegrity.total;
        this.turretRating = this.baseStatSnapshot.turretRating + applied.turretRating.total;
        this.voidShields = Math.max(0, this.baseStatSnapshot.voidShields + applied.voidShields.total);
        this.crew.morale.max = this.baseStatSnapshot.morale + applied.morale.total;
        this.crew.crewRating = this.baseStatSnapshot.crewRating + applied.crewRating.total;
        this.weaponCapacity.dorsal = Math.max(0, this.baseStatSnapshot.weaponCapacityDorsal + applied.weaponCapacityDorsal.total);
        this.weaponCapacity.prow = Math.max(0, this.baseStatSnapshot.weaponCapacityProw + applied.weaponCapacityProw.total);
        this.weaponCapacity.port = Math.max(0, this.baseStatSnapshot.weaponCapacityPort + applied.weaponCapacityPort.total);
        this.weaponCapacity.starboard = Math.max(0, this.baseStatSnapshot.weaponCapacityStarboard + applied.weaponCapacityStarboard.total);
        this.weaponCapacity.keel = Math.max(0, this.baseStatSnapshot.weaponCapacityKeel + applied.weaponCapacityKeel.total);

        // Detection bonus is derived from (modified) detection — recompute so
        // initiative rolls and the chat card pull the right value after a role
        // bonus or auger array adjusts detection upward.
        this.detectionBonus = Math.floor(this.detection / 10);

        // Clamp hull / morale current values to the (possibly new) max so a
        // higher cap from a freshly-fitted hull component doesn't leave the
        // current values below 100% but a lower cap (decommissioned upgrade)
        // doesn't push them above max.
        if (this.hullIntegrity.value > this.hullIntegrity.max) {
            this.hullIntegrity.value = this.hullIntegrity.max;
        }
        if (this.crew.morale.value > this.crew.morale.max) {
            this.crew.morale.value = this.crew.morale.max;
        }

        // Refresh SP-budget + essential-slot validation now that items are
        // visible. The earlier `_prepareBuildValidation()` call seeded the
        // shape with stale `spent` and the full essential-slot list; this pass
        // computes the accurate state for the rendered sheet.
        const itemsForValidation = itemViews.filter((item) => item.type === 'shipComponent' || item.type === 'shipWeapon' || item.type === 'shipUpgrade');
        this._refreshBuildValidation(itemsForValidation);
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the hull type label.
     * @type {string}
     */
    get hullTypeLabel(): string {
        if (!this.hullType) return '';
        return game.i18n.localize(
            `WH40K.HullType.${this.hullType
                .split('-')
                .map((s) => s.capitalize())
                .join('')}`,
        );
    }

    /**
     * Is the ship damaged?
     * @type {boolean}
     */
    get isDamaged(): boolean {
        return this.hullIntegrity.value < this.hullIntegrity.max;
    }

    /**
     * Is the ship crippled (below half hull)?
     * @type {boolean}
     */
    get isCrippled(): boolean {
        return this.hullIntegrity.value <= Math.floor(this.hullIntegrity.max / 2);
    }

    /**
     * Has power shortage?
     * @type {boolean}
     */
    get hasPowerShortage(): boolean {
        return this.power.available < 0;
    }

    /**
     * Has space shortage?
     * @type {boolean}
     */
    get hasSpaceShortage(): boolean {
        return this.space.available < 0;
    }

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry getRollData() returns dynamic shorthand keys
    override getRollData(): Record<string, unknown> {
        const data = super.getRollData();

        data['speed'] = this.speed;
        data['man'] = this.manoeuvrability;
        data['det'] = this.detection;
        data['arm'] = this.armour;
        data['vs'] = this.voidShields;
        data['tr'] = this.turretRating;
        data['cr'] = this.crew.crewRating;

        return data;
    }
}
