/**
 * Actor Data Models for WH40K RPG.
 *
 * Hierarchy:
 *     ActorDataModel (abstract)
 *     ├── CommonTemplate
 *     │   └── CreatureTemplate (characteristics, skills, wounds, fatigue, fate, psy)
 *     │       └── CharacterBaseData  (shared PC schema — "PlayerMixin")
 *     │           ├── DH2CharacterData / DH1CharacterData / RTCharacterData
 *     │           └── BCCharacterData / OWCharacterData / DWCharacterData
 *     ├── HordeTemplate(ActorDataModel)
 *     │   └── NPCBaseData             (shared NPC schema — "NPCMixin")
 *     │       ├── DH2NPCData / DH1NPCData / RTNPCData
 *     │       └── BCNPCData / OWNPCData / DWNPCData
 *     ├── VehicleData (abstract base — locomotion discriminator + universal fields)
 *     │   ├── ConventionalCraftData (directional armour / speed / crew / integrity)
 *     │   │   └── TerracraftData / AircraftData / WatercraftData
 *     │   │       └── DH2TerracraftData / … per line
 *     │   └── VoidcraftData (ship-build schema)
 *     │       └── RTVoidcraftData
 */

// Concrete per-(system, kind) data models. The kind bases, the vehicle base
// classes, the shared templates and the horde mixin are imported from their
// own modules by the classes that extend them.
export * from './concrete/_module.ts';

// Concrete craft kinds
export { default as TerracraftData } from './terracraft.ts';
export { default as AircraftData } from './aircraft.ts';
export { default as WatercraftData } from './watercraft.ts';
export { default as VoidcraftData } from './voidcraft.ts';

// Content-agnostic loot pile (homologated across all seven lines)
export { default as LootData } from './loot.ts';
