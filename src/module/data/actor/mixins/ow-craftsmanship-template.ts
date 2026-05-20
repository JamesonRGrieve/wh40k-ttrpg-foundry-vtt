/**
 * Only War · Craftsmanship readout DataModel mixin (#158).
 *
 * The OW Craftsmanship engine in `src/module/rules/ow-craftsmanship.ts`
 * produces purely passive bonuses on owned weapon / armour items — the
 * actor itself holds NO state for this engine. We therefore export no
 * schema fields and no `declare` block; the orchestrator's manifest sets
 * `datamodel: null` and only wires up the panel + context builder.
 *
 * What this module DOES provide is the typed `_prepareContext` payload
 * builder. It walks the actor's owned items, picks out equipped weapons
 * and armour, resolves their craftsmanship tier through the engine's
 * `getRanged/Melee/ArmourCraftsmanshipEffect` lookups, and packs the
 * result into a `craftsmanshipPanel` hash consumed by the corresponding
 * Handlebars partial.
 *
 * Per the brief / Direction #3, this lives next to the other OW actor
 * mixins so the orchestrator can register the panel + context builder
 * symmetrically with the rest of the OW engine batch (Regiment, Comrade,
 * Orders, Logistics, Mission Gear).
 *
 * Per Direction #7, the engine tables (`OW_RANGED/MELEE/ARMOUR_
 * CRAFTSMANSHIP`) are the single source of truth for the mechanical
 * effect of each tier; this builder does not duplicate those numbers, it
 * reads them.
 */

import {
    type ArmourCraftsmanshipEffect,
    CRAFTSMANSHIP_TIERS,
    type Craftsmanship,
    getArmourCraftsmanshipEffect,
    getMeleeCraftsmanshipEffect,
    getRangedCraftsmanshipEffect,
    type MeleeCraftsmanshipEffect,
    type RangedCraftsmanshipEffect,
} from '../../../rules/ow-craftsmanship.ts';

/* -------------------------------------------------------------------- */
/*  No schema / no declarations                                         */
/* -------------------------------------------------------------------- */

/**
 * Stub export retained for orchestrator symmetry. Returns an empty
 * field record — there is nothing to persist on the actor.
 *
 * The manifest at `.integration-staging/158.json` sets `datamodel: null`
 * to tell the orchestrator NOT to spread this into the schema, but the
 * export is kept so future state (e.g. a tier override per slot) can be
 * added without changing the brief contract.
 */
export function owCraftsmanshipSchemaFields(): Record<string, never> {
    return {};
}

/**
 * Stub declarations type — no actor-level slots.
 */
export type OwCraftsmanshipDeclarations = Record<string, never>;

/* -------------------------------------------------------------------- */
/*  Panel context shape                                                 */
/* -------------------------------------------------------------------- */

/**
 * A single equipped weapon's craftsmanship readout entry. Discriminated
 * on `kind` so the template can switch between the ranged-reliability
 * and the melee WS / damage display.
 */
export type OwCraftsmanshipWeaponEntry =
    | {
          readonly kind: 'ranged';
          readonly itemId: string;
          readonly name: string;
          readonly tier: Craftsmanship;
          readonly effect: RangedCraftsmanshipEffect;
      }
    | {
          readonly kind: 'melee';
          readonly itemId: string;
          readonly name: string;
          readonly tier: Craftsmanship;
          readonly effect: MeleeCraftsmanshipEffect;
      };

/** A single equipped armour's craftsmanship readout entry. */
export interface OwCraftsmanshipArmourEntry {
    readonly itemId: string;
    readonly name: string;
    readonly tier: Craftsmanship;
    readonly effect: ArmourCraftsmanshipEffect;
}

/** Hash consumed by `ow-craftsmanship-panel.hbs`. */
export interface OwCraftsmanshipPanelContext {
    readonly weapons: ReadonlyArray<OwCraftsmanshipWeaponEntry>;
    readonly armours: ReadonlyArray<OwCraftsmanshipArmourEntry>;
    readonly hasEntries: boolean;
}

/* -------------------------------------------------------------------- */
/*  Item-shape protocols (intentionally narrow)                         */
/* -------------------------------------------------------------------- */

/**
 * Minimal shape this builder reads off an owned weapon item.
 *
 * We intentionally type only the fields we touch instead of pulling in
 * the full `WeaponData` class. This keeps the mixin import-free of
 * `data/item/weapon.ts` (which would form a `data/actor → data/item`
 * coupling the architecture rules disallow) and means the context
 * builder works against any item that quacks the same way at runtime.
 */
interface WeaponLike {
    readonly type: string;
    readonly name?: string | null;
    readonly id?: string | null;
    readonly system: {
        readonly equipped?: boolean;
        readonly craftsmanship?: string;
        readonly class?: string;
        readonly melee?: boolean;
    };
}

/** Minimal shape this builder reads off an owned armour item. */
interface ArmourLike {
    readonly type: string;
    readonly name?: string | null;
    readonly id?: string | null;
    readonly system: {
        readonly equipped?: boolean;
        readonly craftsmanship?: string;
    };
}

/* -------------------------------------------------------------------- */
/*  Resolver helpers                                                    */
/* -------------------------------------------------------------------- */

/**
 * Coerce an arbitrary value to a valid {@link Craftsmanship} tier.
 *
 * The persisted `craftsmanship` field on weapon / armour is a free-form
 * `StringField` for legacy reasons, so we must guard against unknown
 * values (e.g. a homebrew tier, an empty string from a freshly-created
 * item). Anything outside `CRAFTSMANSHIP_TIERS` collapses to `common`,
 * which is the engine's identity row (no shift, no modifier).
 */
function coerceCraftsmanship(value: unknown): Craftsmanship {
    if (typeof value !== 'string') return 'common';
    const tiers = CRAFTSMANSHIP_TIERS as ReadonlyArray<string>;
    return tiers.includes(value) ? (value as Craftsmanship) : 'common';
}

/**
 * Test whether an item is a weapon. Mirrors {@link WeaponData}'s
 * `isMeleeWeapon` / `isRangedWeapon` decision tree against the narrow
 * `WeaponLike` shape so we don't need to import the full DataModel.
 */
function classifyWeapon(item: WeaponLike): 'ranged' | 'melee' | null {
    const cls = item.system.class ?? '';
    if (item.system.melee === true || cls === 'melee') return 'melee';
    if (cls === 'pistol' || cls === 'basic' || cls === 'heavy' || cls === 'launcher') return 'ranged';
    return null;
}

/* -------------------------------------------------------------------- */
/*  Panel context builder                                               */
/* -------------------------------------------------------------------- */

/**
 * Build the `craftsmanshipPanel` context hash for an OW actor.
 *
 * Iterates the actor's owned items, keeps weapons + armour that are
 * currently equipped, and resolves the engine effect for each. The
 * return value is consumed by `templates/actor/panel/ow-craftsmanship-
 * panel.hbs` and is safe to call on every render (no I/O, no RNG).
 *
 * Items with missing / non-string ids fall back to an empty string id;
 * unknown craftsmanship strings fall back to `common`. Neither is fatal,
 * matching the rest of the OW panel preparers that tolerate partially-
 * authored content.
 */
export function buildOwCraftsmanshipPanel(
    items: Iterable<WeaponLike | ArmourLike | { type: string; name?: string | null; id?: string | null; system: unknown }>,
): OwCraftsmanshipPanelContext {
    const weapons: OwCraftsmanshipWeaponEntry[] = [];
    const armours: OwCraftsmanshipArmourEntry[] = [];

    for (const raw of items) {
        const itemId = typeof raw.id === 'string' ? raw.id : '';
        const itemName = typeof raw.name === 'string' && raw.name !== '' ? raw.name : itemId;

        if (raw.type === 'weapon' && isWeaponLike(raw)) {
            if (raw.system.equipped !== true) continue;
            const kind = classifyWeapon(raw);
            if (kind === null) continue;
            const tier = coerceCraftsmanship(raw.system.craftsmanship);
            if (kind === 'ranged') {
                weapons.push({
                    kind: 'ranged',
                    itemId,
                    name: itemName,
                    tier,
                    effect: getRangedCraftsmanshipEffect(tier),
                });
            } else {
                weapons.push({
                    kind: 'melee',
                    itemId,
                    name: itemName,
                    tier,
                    effect: getMeleeCraftsmanshipEffect(tier),
                });
            }
            continue;
        }

        if (raw.type === 'armour' && isArmourLike(raw)) {
            if (raw.system.equipped !== true) continue;
            const tier = coerceCraftsmanship(raw.system.craftsmanship);
            armours.push({
                itemId,
                name: itemName,
                tier,
                effect: getArmourCraftsmanshipEffect(tier),
            });
        }
    }

    return {
        weapons,
        armours,
        hasEntries: weapons.length > 0 || armours.length > 0,
    };
}

/**
 * Type-guard for {@link WeaponLike}. Verifies the item exposes a plain-
 * object `system` slot before the loop reads `equipped` / `class` /
 * `melee` / `craftsmanship`. Items whose `system` is unset or non-object
 * are silently skipped — they never reach the engine lookup.
 */
function isWeaponLike(raw: { type: string; system: unknown }): raw is WeaponLike {
    return typeof raw.system === 'object' && raw.system !== null;
}

/** Type-guard for {@link ArmourLike}; same shape contract as {@link isWeaponLike}. */
function isArmourLike(raw: { type: string; system: unknown }): raw is ArmourLike {
    return typeof raw.system === 'object' && raw.system !== null;
}
