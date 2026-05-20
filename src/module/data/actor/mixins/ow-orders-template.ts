/**
 * Only War · Orders persistence slot (#153 — core.md §"ORDERS" line 12183).
 *
 * The engine (`src/module/rules/ow-orders.ts`) is RNG-free and actor-
 * decoupled. The only state that must persist on an OW character is the
 * list of Orders currently *active* on them — every other input (action
 * economy, Cohesion availability) is derived from other DataModel slots
 * the rules engine consumes at call time.
 *
 * Each entry tracks:
 *   - `orderId`            — stable id matching an `OrderDef.id`. Generic
 *                            ids are `'ranged-volley'`, `'close-quarters'`,
 *                            `'take-cover'`; speciality / sweeping Orders
 *                            live in compendiums and supply their own id.
 *   - `sweeping`           — true iff the Order is a Sergeant Sweeping
 *                            Order (`OrderDef.kind === 'sweeping'` or the
 *                            convenience flag set on a compendium doc).
 *                            Sweeping Orders persist until cleared; the
 *                            non-sweeping Orders are dropped by the
 *                            caller at round boundary.
 *   - `appliedToMemberIds` — squad-member ids the Order's effect has been
 *                            applied to via `applyOrderEffect`. Stored so
 *                            mid-round reassignments can recompute mods
 *                            without re-rolling the issuance.
 *
 * The orchestrator merges `owOrdersSchemaFields()` into CharacterData's
 * `defineSchema()` and applies `OwOrdersDeclarations` to the class via
 * the standard `declare` block. The panel and actions read these fields
 * off `system`; no class-level mixin is needed for this round.
 */

const { SchemaField, StringField, BooleanField, ArrayField } = foundry.data.fields;

/**
 * One persisted Order entry. Display labels (Order name, effect text,
 * action-cost wording) are resolved at the UI layer via i18n / compendium
 * lookups — this slot stores only the stable structured fields the
 * resolver and chat layers need.
 */
export interface ActiveOrderEntry {
    orderId: string;
    sweeping: boolean;
    appliedToMemberIds: string[];
}

/**
 * Class-level `declare` shape contributed by the Orders schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.activeOrders[i].orderId` etc. without
 * Record casts.
 */
export interface OwOrdersDeclarations {
    activeOrders: ActiveOrderEntry[];
}

/**
 * Schema-field bundle for the active-Orders list. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owOrdersSchemaFields(),
 *     };
 *
 * The initial value is the empty array so the slot stays safe for the
 * other six game systems — Foundry will instantiate it as `[]` and the
 * panel gate (`isOW`) keeps the surface invisible elsewhere.
 */
export function owOrdersSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        activeOrders: new ArrayField(
            new SchemaField({
                orderId: new StringField({ required: true, initial: '', blank: true }),
                sweeping: new BooleanField({ required: true, initial: false }),
                appliedToMemberIds: new ArrayField(new StringField({ required: true, blank: true }), {
                    required: true,
                    initial: [],
                }),
            }),
            { required: true, initial: [] },
        ),
    };
}
