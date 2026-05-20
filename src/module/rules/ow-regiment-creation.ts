/**
 * Only War · Regiment Creation budget engine (#151 — OW core.md
 * §"CREATING A REGIMENT" line 1795).
 *
 * Pure rules / math layer. Per Direction #7 the content (specific
 * Home Worlds, Commanding Officers, Regiment Types, Training and
 * Special Equipment Doctrines, Favoured Weapons, Standard Kit entries)
 * lives in compendium documents — this module never references concrete
 * option names. The caller supplies the option catalog (resolved from
 * the compendium / origin path) and a `RegimentSelection` shape; the
 * engine returns budget totals, validation flags, and the aggregated
 * grants (characteristic mods, skills, talents, wounds, Logistics, kit
 * modifier) so the consumer can splice them onto the actor.
 *
 * Two budgets:
 *   - 12-point Regiment Creation budget across six categories
 *     (Home World, Commanding Officer, Regiment Type, Training
 *     Doctrines, Special Equipment Doctrines, Favoured Weapons).
 *   - 30-point Standard Kit allocation (separate pool, OW core.md
 *     line 2454).
 *
 * The engine is RNG-free and actor-decoupled; no I/O, no Foundry
 * Document reads. The consuming DataModel / sheet / dialog calls
 * these functions during selection and on commit.
 */

/* -------------------------------------------------------------------- */
/*  Budget constants                                                    */
/* -------------------------------------------------------------------- */

/** Total Regiment Creation points available across all six categories. */
export const REGIMENT_BUDGET = 12;

/** Total Standard Kit allocation points (OW core.md line 2454). */
export const STANDARD_KIT_BUDGET = 30;

/* -------------------------------------------------------------------- */
/*  Category + option shapes                                            */
/* -------------------------------------------------------------------- */

/**
 * Six categories of selectable Regiment Creation options. Each draws
 * from a separate slot in the `RegimentSelection`; the trainingDoctrines
 * and specialEquipmentDoctrines slots accept multiple choices, the
 * others are single-pick.
 *
 * Favoured Weapons is modelled as a single category here even though
 * a regiment picks both a close-combat and ranged favoured weapon —
 * the selection shape carries both sub-slots and each contributes its
 * own cost.
 */
export type RegimentCategory = 'homeWorld' | 'commandingOfficer' | 'regimentType' | 'trainingDoctrine' | 'specialEquipmentDoctrine' | 'favouredWeapons';

/** Stable iteration order for the category list (chat cards, summaries). */
export const REGIMENT_CATEGORIES: ReadonlyArray<RegimentCategory> = Object.freeze([
    'homeWorld',
    'commandingOfficer',
    'regimentType',
    'trainingDoctrine',
    'specialEquipmentDoctrine',
    'favouredWeapons',
]);

/**
 * Mechanical grants attached to a single option. All fields are
 * optional; the engine merges them across the active selection.
 *
 * - `characteristics`: per-key bonus (Weapon Skill, Toughness, …).
 *   Multiple options stack additively.
 * - `skills` / `talents`: opaque ID lists (compendium UUIDs in
 *   practice, but the engine treats them as strings so it stays
 *   content-agnostic). Lists concatenate; the consumer is responsible
 *   for deduplication if a single grant from two sources should not
 *   double-count.
 * - `wounds`: starting-wound modifier; sums.
 * - `logistics`: Logistics rating modifier (OW core.md "Logistics").
 * - `kitModifier`: bonus / penalty to the Standard Kit budget.
 */
export interface RegimentGrants {
    readonly characteristics?: Readonly<Record<string, number>>;
    readonly skills?: ReadonlyArray<string>;
    readonly talents?: ReadonlyArray<string>;
    readonly wounds?: number;
    readonly logistics?: number;
    readonly kitModifier?: number;
}

/**
 * One selectable option from the compendium catalog. `cost` is the
 * point cost against the 12-point Regiment budget; `grants` is what
 * the option awards to the regiment when selected.
 */
export interface RegimentOption {
    readonly id: string;
    readonly category: RegimentCategory;
    readonly cost: number;
    readonly grants?: RegimentGrants;
}

/**
 * The current Regiment Creation selection. Single-pick categories use
 * an optional string slot; the doctrine categories accept arrays.
 * Favoured weapons has a close and ranged sub-slot.
 */
export interface RegimentSelection {
    readonly homeWorld?: string;
    readonly commandingOfficer?: string;
    readonly regimentType?: string;
    readonly trainingDoctrines: ReadonlyArray<string>;
    readonly specialEquipmentDoctrines: ReadonlyArray<string>;
    readonly favouredWeapons: {
        readonly close?: string;
        readonly ranged?: string;
    };
}

/* -------------------------------------------------------------------- */
/*  Catalog helpers                                                     */
/* -------------------------------------------------------------------- */

/**
 * Build an `id → RegimentOption` lookup. The engine accepts the catalog
 * as a ReadonlyArray so the caller can simply hand over `option items`
 * pulled from the compendium without restructuring.
 */
function indexCatalog(catalog: ReadonlyArray<RegimentOption>): ReadonlyMap<string, RegimentOption> {
    const map = new Map<string, RegimentOption>();
    for (const opt of catalog) {
        map.set(opt.id, opt);
    }
    return map;
}

/**
 * Iterate the option ids referenced by a selection. Skips empty
 * single-pick slots; preserves order across array slots so per-category
 * sums are stable.
 */
function* selectionIds(selection: RegimentSelection): Generator<{ id: string; category: RegimentCategory }> {
    if (selection.homeWorld !== undefined && selection.homeWorld !== '') {
        yield { id: selection.homeWorld, category: 'homeWorld' };
    }
    if (selection.commandingOfficer !== undefined && selection.commandingOfficer !== '') {
        yield { id: selection.commandingOfficer, category: 'commandingOfficer' };
    }
    if (selection.regimentType !== undefined && selection.regimentType !== '') {
        yield { id: selection.regimentType, category: 'regimentType' };
    }
    for (const id of selection.trainingDoctrines) {
        if (id !== '') yield { id, category: 'trainingDoctrine' };
    }
    for (const id of selection.specialEquipmentDoctrines) {
        if (id !== '') yield { id, category: 'specialEquipmentDoctrine' };
    }
    if (selection.favouredWeapons.close !== undefined && selection.favouredWeapons.close !== '') {
        yield { id: selection.favouredWeapons.close, category: 'favouredWeapons' };
    }
    if (selection.favouredWeapons.ranged !== undefined && selection.favouredWeapons.ranged !== '') {
        yield { id: selection.favouredWeapons.ranged, category: 'favouredWeapons' };
    }
}

/** Zero-init per-category accumulator. */
function emptyPerCategory(): Record<RegimentCategory, number> {
    return {
        homeWorld: 0,
        commandingOfficer: 0,
        regimentType: 0,
        trainingDoctrine: 0,
        specialEquipmentDoctrine: 0,
        favouredWeapons: 0,
    };
}

/* -------------------------------------------------------------------- */
/*  Regiment budget                                                     */
/* -------------------------------------------------------------------- */

/**
 * Result of evaluating a Regiment Creation selection against the
 * 12-point budget.
 */
export interface RegimentBudgetResult {
    /** Total points spent across all selected options. */
    readonly spent: number;
    /** REGIMENT_BUDGET − spent. Negative when over budget. */
    readonly remaining: number;
    /** True when `spent` is exactly `REGIMENT_BUDGET`. */
    readonly valid: boolean;
    /** Spend per category, for sheet breakdowns. */
    readonly perCategory: Record<RegimentCategory, number>;
}

/**
 * Compute the spent / remaining / per-category breakdown of a selection.
 * The selection is "valid" only when the total exactly matches the
 * 12-point budget (RAW: regiments spend their *entire* budget — leftover
 * points are not banked).
 *
 * Options referenced in the selection but absent from the catalog are
 * silently skipped; the consumer surfaces unknown-id errors separately
 * if needed.
 */
export function computeRegimentBudget(selection: RegimentSelection, optionCatalog: ReadonlyArray<RegimentOption>): RegimentBudgetResult {
    const lookup = indexCatalog(optionCatalog);
    const perCategory = emptyPerCategory();
    let spent = 0;

    for (const ref of selectionIds(selection)) {
        const opt = lookup.get(ref.id);
        if (opt === undefined) continue;
        const cost = Number.isFinite(opt.cost) ? opt.cost : 0;
        spent += cost;
        perCategory[ref.category] += cost;
    }

    const remaining = REGIMENT_BUDGET - spent;
    return { spent, remaining, valid: spent === REGIMENT_BUDGET, perCategory };
}

/* -------------------------------------------------------------------- */
/*  Standard Kit budget                                                 */
/* -------------------------------------------------------------------- */

/**
 * Result of evaluating a Standard Kit allocation against the 30-point
 * (or modified) kit budget. The kit is "valid" when total spend is
 * ≤ budget — unlike the Regiment budget, leftover kit points are
 * permitted (regiments may leave some kit slots unfilled).
 */
export interface KitBudgetResult {
    readonly spent: number;
    readonly remaining: number;
    readonly valid: boolean;
}

/**
 * Sum the cost of every kit entry. `kitModifier` (a delta from
 * RegimentGrants — Mechanised regiments raise the cap, Penal regiments
 * lower it) is added to STANDARD_KIT_BUDGET before validation.
 */
export function computeKitBudget(kit: ReadonlyArray<{ readonly id: string; readonly cost: number }>, kitModifier = 0): KitBudgetResult {
    let spent = 0;
    for (const entry of kit) {
        if (Number.isFinite(entry.cost)) spent += entry.cost;
    }
    const budget = STANDARD_KIT_BUDGET + (Number.isFinite(kitModifier) ? kitModifier : 0);
    const remaining = budget - spent;
    return { spent, remaining, valid: spent <= budget };
}

/* -------------------------------------------------------------------- */
/*  Grant aggregation                                                   */
/* -------------------------------------------------------------------- */

/**
 * Concrete (non-readonly) view of `RegimentGrants` used while merging.
 * The returned aggregate is reshaped back to the readonly form.
 */
interface MutableGrants {
    characteristics: Record<string, number>;
    skills: string[];
    talents: string[];
    wounds: number;
    logistics: number;
    kitModifier: number;
}

function mergeGrants(target: MutableGrants, source: RegimentGrants | undefined): void {
    if (source === undefined) return;
    if (source.characteristics !== undefined) {
        for (const [key, value] of Object.entries(source.characteristics)) {
            if (!Number.isFinite(value)) continue;
            target.characteristics[key] = (target.characteristics[key] ?? 0) + value;
        }
    }
    if (source.skills !== undefined) {
        for (const s of source.skills) target.skills.push(s);
    }
    if (source.talents !== undefined) {
        for (const t of source.talents) target.talents.push(t);
    }
    if (source.wounds !== undefined && Number.isFinite(source.wounds)) {
        target.wounds += source.wounds;
    }
    if (source.logistics !== undefined && Number.isFinite(source.logistics)) {
        target.logistics += source.logistics;
    }
    if (source.kitModifier !== undefined && Number.isFinite(source.kitModifier)) {
        target.kitModifier += source.kitModifier;
    }
}

/**
 * Merge the `RegimentGrants` of every option in the selection into a
 * single aggregate. Characteristics sum per key; skill / talent lists
 * concatenate in selection order (the consumer deduplicates if needed);
 * wounds, logistics, and kitModifier sum.
 *
 * Returns an aggregate with all sub-fields present (zero-valued if no
 * options contributed) — keeps downstream consumers from null-checking
 * every slot.
 */
export function aggregateRegimentGrants(selection: RegimentSelection, optionCatalog: ReadonlyArray<RegimentOption>): RegimentGrants {
    const lookup = indexCatalog(optionCatalog);
    const acc: MutableGrants = {
        characteristics: {},
        skills: [],
        talents: [],
        wounds: 0,
        logistics: 0,
        kitModifier: 0,
    };

    for (const ref of selectionIds(selection)) {
        const opt = lookup.get(ref.id);
        if (opt === undefined) continue;
        mergeGrants(acc, opt.grants);
    }

    return {
        characteristics: acc.characteristics,
        skills: acc.skills,
        talents: acc.talents,
        wounds: acc.wounds,
        logistics: acc.logistics,
        kitModifier: acc.kitModifier,
    };
}

/* -------------------------------------------------------------------- */
/*  Empty-selection helper                                              */
/* -------------------------------------------------------------------- */

/**
 * A blank `RegimentSelection` with the array slots initialised. Useful
 * as the default-state seed for sheet form binding.
 */
export function emptyRegimentSelection(): RegimentSelection {
    return {
        trainingDoctrines: [],
        specialEquipmentDoctrines: [],
        favouredWeapons: {},
    };
}
