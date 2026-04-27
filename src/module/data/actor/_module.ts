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
 *     ├── VehicleBaseData             (shared Vehicle schema — "VehicleMixin")
 *     │   └── DH2VehicleData / DH1VehicleData / RTVehicleData
 *     │       BCVehicleData / OWVehicleData / DWVehicleData
 *     └── StarshipBaseData            (shared Starship schema — "StarshipMixin")
 *         └── RTStarshipData
 */

// Kind base classes (the effective "PlayerMixin / NPCMixin / VehicleMixin / StarshipMixin")
export { CharacterBaseData, NPCBaseData, VehicleBaseData, StarshipBaseData } from './bases/_module.ts';

// Concrete per-(system, kind) data models
export * from './concrete/_module.ts';

// Legacy names (back-compat while callers migrate; delete in cleanup pass)
export { default as CharacterData } from './character.ts';
export { default as NPCData } from './npc.ts';
export { default as StarshipData } from './starship.ts';
export { default as VehicleData } from './vehicle.ts';

// Shared templates
export { CommonTemplate, CreatureTemplate } from './templates/_module.ts';

// Mixins
export { HordeTemplate } from './mixins/_module.ts';
