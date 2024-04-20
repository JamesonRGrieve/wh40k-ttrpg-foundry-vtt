import { DarkHeresyAcolyte } from './acolyte.mjs';
import { DarkHeresyVehicle } from './vehicle.mjs';
import { DarkHeresyNPC } from './npc.mjs';
import { DarkHeresyBaseActor } from './base-actor.mjs';


const actorHandler = {
    construct(_, args) {
      const type = args[0]?.type;
      const cls = CONFIG.Actor.documentClasses[type] ?? DarkHeresyBaseActor;
      return new cls(...args);
    },
  };
  
  export const DarkHeresyActorProxy = new Proxy(DarkHeresyBaseActor, actorHandler);
  