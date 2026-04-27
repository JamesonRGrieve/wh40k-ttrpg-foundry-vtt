/**
 * Concrete Actor document classes — one per (system, kind) pair.
 * Thin subclasses of the kind-base document classes with a static gameSystem
 * marker (lived on the data model side — see src/module/data/actor/concrete/).
 */

export { default as WH40KDH2Character } from './dh2-character.ts';
export { default as WH40KDH2NPC } from './dh2-npc.ts';
export { default as WH40KDH2Vehicle } from './dh2-vehicle.ts';

export { default as WH40KDH1Character } from './dh1-character.ts';
export { default as WH40KDH1NPC } from './dh1-npc.ts';
export { default as WH40KDH1Vehicle } from './dh1-vehicle.ts';

export { default as WH40KRTCharacter } from './rt-character.ts';
export { default as WH40KRTNPC } from './rt-npc.ts';
export { default as WH40KRTVehicle } from './rt-vehicle.ts';
export { default as WH40KRTStarship } from './rt-starship.ts';

export { default as WH40KBCCharacter } from './bc-character.ts';
export { default as WH40KBCNPC } from './bc-npc.ts';
export { default as WH40KBCVehicle } from './bc-vehicle.ts';

export { default as WH40KOWCharacter } from './ow-character.ts';
export { default as WH40KOWNPC } from './ow-npc.ts';
export { default as WH40KOWVehicle } from './ow-vehicle.ts';

export { default as WH40KDWCharacter } from './dw-character.ts';
export { default as WH40KDWNPC } from './dw-npc.ts';
export { default as WH40KDWVehicle } from './dw-vehicle.ts';

export { default as WH40KIMCharacter } from './im-character.ts';
export { default as WH40KIMNPC } from './im-npc.ts';
export { default as WH40KIMVehicle } from './im-vehicle.ts';
