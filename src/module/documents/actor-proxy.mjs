import { WH40KAcolyte } from './acolyte.mjs';
import { WH40KVehicle } from './vehicle.mjs';
import { WH40KNPC } from './npc.mjs';
import { WH40KBaseActor } from './base-actor.mjs';

const actorHandler = {
    construct(_, args) {
        const type = args[0]?.type;
        const cls = CONFIG.Actor.documentClasses[type] ?? WH40KBaseActor;
        return new cls(...args);
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
