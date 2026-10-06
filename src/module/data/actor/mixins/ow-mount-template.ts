/**
 * Only War · Mounted Combat persistence slot (#159 — Hammer of the
 * Emperor §"MOUNTED COMBAT" / "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS",
 * hammer.md lines 4046-4260).
 *
 * The engine (`src/module/rules/ow-mount.ts`) is RNG-free and
 * actor-decoupled. The only state that must persist on an OW rider
 * is the link to the actor's current mount — the mount's compendium
 * id and the ids of its printed mount traits, which the sheet badges.
 * Per Direction #7 the full mount profile (characteristics,
 * breed-specific advances, trait rules) lives on the compendium
 * document keyed by `mountId`; no mount trait modifies the rider's
 * attack.
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
 * `traits` is the ids of the mount's printed traits, shown as badges.
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
 * `MountTraitId` union; an unknown id only renders an untranslated
 * badge.
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
