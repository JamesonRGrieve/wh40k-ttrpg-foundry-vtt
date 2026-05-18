import CommonTemplate from './templates/common.ts';

/**
 * Minimal weight shape every physical item DataModel exposes. Loot piles only
 * ever need the encumbrance roll-up, so the schema-agnostic projection here
 * keeps {@link LootData.computeTotalWeight} a pure, unit-testable function
 * that never reaches into a concrete item DataModel.
 */
interface LootWeightProjection {
    totalWeight?: number | null;
    weight?: number | null;
    quantity?: number | null;
}

/**
 * Data model for the content-agnostic `loot` actor — a pile of items dropped
 * onto the scene. A loot pile has no characteristics, skills, or game-system
 * variance: a single homologated type serves all seven lines. Its inventory
 * is the actor's embedded Items; this schema only carries provenance and an
 * optional GM description.
 *
 * @extends CommonTemplate
 */
export default class LootData extends CommonTemplate {
    declare description: string;
    declare source: { actorUuid: string; actorName: string; userId: string };
    declare droppedAt: number;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            description: new fields.HTMLField({ required: false, blank: true }),

            source: new fields.SchemaField({
                actorUuid: new fields.StringField({ required: true, blank: true, initial: '' }),
                actorName: new fields.StringField({ required: true, blank: true, initial: '' }),
                userId: new fields.StringField({ required: true, blank: true, initial: '' }),
            }),

            droppedAt: new fields.NumberField({ required: true, nullable: false, initial: 0, min: 0, integer: true }),
        };
    }

    /** @inheritDoc */
    override get embeddedDescriptionKeyPath(): string {
        return 'description';
    }

    /* -------------------------------------------- */
    /*  Pure helpers (unit-tested)                  */
    /* -------------------------------------------- */

    /**
     * Sum the encumbrance of a pile's items. Prefers each item's own
     * `totalWeight` (which already folds in quantity and craftsmanship);
     * falls back to `weight × quantity` when only the raw fields are
     * available. Pure: no Foundry globals, no DataModel coupling.
     */
    static computeTotalWeight(items: Iterable<LootWeightProjection>): number {
        let total = 0;
        for (const item of items) {
            if (typeof item.totalWeight === 'number' && Number.isFinite(item.totalWeight)) {
                total += item.totalWeight;
                continue;
            }
            const weight = typeof item.weight === 'number' && Number.isFinite(item.weight) ? item.weight : 0;
            const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : 1;
            total += weight * quantity;
        }
        return Math.round(total * 100) / 100;
    }

    /* -------------------------------------------- */
    /*  Derived properties                          */
    /* -------------------------------------------- */

    /** Item-weight projections of the owning loot Actor's embedded items. */
    private get actorItemProjections(): Iterable<LootWeightProjection> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.parent is the Foundry Actor whose items collection carries DataModel-backed item.system; projected to the weight shape only
        const parent = this.parent as { items?: Iterable<{ system?: LootWeightProjection }> } | null;
        const out: LootWeightProjection[] = [];
        for (const item of parent?.items ?? []) {
            if (item.system) out.push(item.system);
        }
        return out;
    }

    /** Total encumbrance of everything in the pile. */
    get totalWeight(): number {
        return LootData.computeTotalWeight(this.actorItemProjections);
    }

    /** Number of distinct item stacks in the pile. */
    get itemCount(): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.parent is the Foundry Actor; only the items size is read
        const parent = this.parent as { items?: { size?: number } } | null;
        return parent?.items?.size ?? 0;
    }

    /** Whether the pile holds nothing and should be removed from the scene. */
    get isEmpty(): boolean {
        return this.itemCount === 0;
    }
}
