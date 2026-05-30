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

// Kind base classes (the effective "PlayerMixin / NPCMixin")
export { CharacterBaseData, NPCBaseData } from './bases/_module.ts';

// Concrete per-(system, kind) data models
export * from './concrete/_module.ts';

// Vehicle hierarchy: abstract base + conventional-craft intermediate + concrete craft kinds
export { default as VehicleData, ConventionalCraftData } from './vehicle.ts';
export { default as TerracraftData } from './terracraft.ts';
export { default as AircraftData } from './aircraft.ts';
export { default as WatercraftData } from './watercraft.ts';
export { default as VoidcraftData } from './voidcraft.ts';

// Content-agnostic loot pile (homologated across all seven lines)
export { default as LootData } from './loot.ts';

// Shared templates
export { CommonTemplate, CreatureTemplate } from './templates/_module.ts';

// Mixins
export { HordeTemplate } from './mixins/_module.ts';
