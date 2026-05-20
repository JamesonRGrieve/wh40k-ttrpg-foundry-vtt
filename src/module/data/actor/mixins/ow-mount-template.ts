/**
 * Only War · Mounted Combat persistence slot (#159 — Hammer of the
 * Emperor §"MOUNTED COMBAT" / "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS",
 * hammer.md lines 4046-4260).
 *
 * The engine (`src/module/rules/ow-mount.ts`) is RNG-free and
 * actor-decoupled. The only state that must persist on an OW rider
 * is the link to the actor's current mount — the mount's compendium
 * id and the subset of trait ids the engine reads to combine the
 * mounted-attack modifier. Per Direction #7 the full mount profile
 * (characteristics, breed-specific advances, fluff traits) lives on
 * the compendium document keyed by `mountId`; only the trait ids
 * that the rules engine consumes (`MountTraitId`) are cached on the
 * rider.
 *
 * The wrapping `SchemaField` is `nullable: true, initial: null` so an
 * actor that does not currently have a mount persists as
 * `mountedOn === null` rather than a stub object with an empty id and
 * trait list. Dismounted is the default state.
 *
 * The orchestrator merges `owMountSchemaFields()` into CharacterData's
 * `defineSchema()` and applies `OwMountDeclarations` via the standard
 * `declare` block.
 */

import type { MountTraitId } from '../../../rules/ow-mount.ts';

const { SchemaField, StringField, ArrayField } = foundry.data.fields;

/**
 * Mount-link entry for a mounted rider. `mountId` is the Foundry UUID
 * of the mount's compendium document (`Compendium.wh40k-rpg.<pack>.<type>.<id>`).
 * `traits` is the rider-visible subset of mechanically-impactful
 * mount traits — the same shape `applyMountedAttackModifier` expects
 * in its `MountedAttackContext.mountTraits`.
 */
export interface MountedOnEntry {
    mountId: string;
    traits: MountTraitId[];
}

/**
 * Class-level `declare` shape contributed by this schema slot. The
 * orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.mountedOn` to
 * `MountedOnEntry | null` without Record casts.
 */
export interface OwMountDeclarations {
    mountedOn: MountedOnEntry | null;
}

/**
 * Schema-field bundle for the mount-link slot. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owMountSchemaFields(),
 *     };
 *
 * Dismounted riders carry `mountedOn === null`. Trait ids are stored
 * as bare strings because the `StringField` schema cannot express the
 * `MountTraitId` union; the runtime cast is one-way (string → union)
 * and falls back to ignoring unknown trait ids inside the engine's
 * `hasTrait` check, so the worst case is a missed modifier rather
 * than a thrown error.
 */
export function owMountSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        mountedOn: new SchemaField(
            {
                mountId: new StringField({ required: true, initial: '', nullable: false }),
                traits: new ArrayField(new StringField({ required: true, nullable: false, blank: false }), {
                    required: true,
                    initial: [],
                }),
            },
            { required: false, nullable: true, initial: null },
        ),
    };
}
