import { WH40KAcolyte } from './acolyte.ts';
import { WH40KVehicle } from './vehicle.ts';
import { WH40KNPC } from './npc.ts';
import { WH40KBaseActor } from './base-actor.ts';

const actorHandler: ProxyHandler<typeof WH40KBaseActor> = {
    construct(_: typeof WH40KBaseActor, args: any[]): Actor {
        const type: string | undefined = args[0]?.type;
        const cls = CONFIG.Actor.documentClasses[type as string] ?? WH40KBaseActor;
        return new (cls as any)(...args);
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
