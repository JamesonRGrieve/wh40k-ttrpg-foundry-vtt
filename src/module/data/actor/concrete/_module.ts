/**
 * Concrete data models, one per (system, kind) pair. 19 total.
 *
 * Naming: {System}{Kind}Data, file {system}-{kind}.ts.
 * Each is a thin class extending its kind base (CharacterBaseData /
 * NPCBaseData / VehicleBaseData / StarshipBaseData) and stamped with a
 * `gameSystem` static identifier. Per-system schema divergence is added
 * by overriding defineSchema in the relevant concrete class when needed.
 */

// Dark Heresy 2e
export { default as DH2CharacterData } from './dh2-character.ts';
export { default as DH2NPCData } from './dh2-npc.ts';
export { default as DH2VehicleData } from './dh2-vehicle.ts';

// Dark Heresy 1e
export { default as DH1CharacterData } from './dh1-character.ts';
export { default as DH1NPCData } from './dh1-npc.ts';
export { default as DH1VehicleData } from './dh1-vehicle.ts';

// Rogue Trader (only system with starships)
export { default as RTCharacterData } from './rt-character.ts';
export { default as RTNPCData } from './rt-npc.ts';
export { default as RTVehicleData } from './rt-vehicle.ts';
export { default as RTStarshipData } from './rt-starship.ts';

// Black Crusade
export { default as BCCharacterData } from './bc-character.ts';
export { default as BCNPCData } from './bc-npc.ts';
export { default as BCVehicleData } from './bc-vehicle.ts';

// Only War
export { default as OWCharacterData } from './ow-character.ts';
export { default as OWNPCData } from './ow-npc.ts';
export { default as OWVehicleData } from './ow-vehicle.ts';

// Deathwatch
export { default as DWCharacterData } from './dw-character.ts';
export { default as DWNPCData } from './dw-npc.ts';
export { default as DWVehicleData } from './dw-vehicle.ts';
