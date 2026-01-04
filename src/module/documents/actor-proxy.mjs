import { RogueTraderAcolyte } from './acolyte.mjs';
import { RogueTraderVehicle } from './vehicle.mjs';
import { RogueTraderNPC } from './npc.mjs';
import { RogueTraderBaseActor } from './base-actor.mjs';


const actorHandler = {
    construct(_, args) {
      const type = args[0]?.type;
      const cls = CONFIG.Actor.documentClasses[type] ?? RogueTraderBaseActor;
      return new cls(...args);
    },
  };
  
  export const RogueTraderActorProxy = new Proxy(RogueTraderBaseActor, actorHandler);
  