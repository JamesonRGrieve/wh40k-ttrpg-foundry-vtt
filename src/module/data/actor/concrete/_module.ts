/**
 * Concrete data models, one per (system, kind) pair.
 *
 * Naming: {System}{Kind}Data, file {system}-{kind}.ts.
 * Each is a thin class extending its kind base (CharacterBaseData /
 * NPCBaseData / TerracraftData / VoidcraftData) and stamped with a
 * `gameSystem` static identifier. Per-system schema divergence is added
 * by overriding defineSchema in the relevant concrete class when needed.
 *
 * Conventional craft default to the land subtype (`*-terracraft.ts`,
 * extending `TerracraftData`). Per-line aircraft / watercraft concrete
 * models are added only when that line authors air/water content.
 */

// Dark Heresy 2e
export { default as DH2CharacterData } from './dh2-character.ts';
export { default as DH2NPCData } from './dh2-npc.ts';
export { default as DH2TerracraftData } from './dh2-terracraft.ts';
export { default as DH2AircraftData } from './dh2-aircraft.ts';

// Dark Heresy 1e
export { default as DH1CharacterData } from './dh1-character.ts';
export { default as DH1NPCData } from './dh1-npc.ts';
export { default as DH1TerracraftData } from './dh1-terracraft.ts';

// Rogue Trader (only system with voidcraft)
export { default as RTCharacterData } from './rt-character.ts';
export { default as RTNPCData } from './rt-npc.ts';
export { default as RTTerracraftData } from './rt-terracraft.ts';
export { default as RTAircraftData } from './rt-aircraft.ts';
export { default as RTVoidcraftData } from './rt-voidcraft.ts';

// Black Crusade
export { default as BCCharacterData } from './bc-character.ts';
export { default as BCNPCData } from './bc-npc.ts';
export { default as BCTerracraftData } from './bc-terracraft.ts';

// Only War
export { default as OWCharacterData } from './ow-character.ts';
export { default as OWNPCData } from './ow-npc.ts';
export { default as OWTerracraftData } from './ow-terracraft.ts';
export { default as OWAircraftData } from './ow-aircraft.ts';

// Deathwatch
export { default as DWCharacterData } from './dw-character.ts';
export { default as DWNPCData } from './dw-npc.ts';
export { default as DWTerracraftData } from './dw-terracraft.ts';
export { default as DWAircraftData } from './dw-aircraft.ts';

// Imperium Maledictum
export { default as IMCharacterData } from './im-character.ts';
export { default as IMNPCData } from './im-npc.ts';
export { default as IMTerracraftData } from './im-terracraft.ts';
