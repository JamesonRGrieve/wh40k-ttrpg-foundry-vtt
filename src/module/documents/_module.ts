export { WH40KBaseActor } from './base-actor.ts';

// Legacy named exports (still used by the rest of the codebase during transition).
export { WH40KAcolyte } from './acolyte.ts';
export { WH40KNPCV2 } from './npc-v2.ts';
export { WH40KVehicle } from './vehicle.ts';
export { WH40KStarship } from './starship.ts';

// Per-kind document bases.
export { CharacterDocBase, NPCDocBase, VehicleDocBase, StarshipDocBase } from './bases/_module.ts';

// Per-(system, kind) concrete document classes.
export * from './concrete/_module.ts';

// Other document classes.
export { WH40KActiveEffect } from './active-effect.ts';
export { ChatMessageWH40K } from './chat-message.ts';
export { TokenDocumentWH40K } from './token.ts';
