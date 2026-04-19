import { WH40KBaseActor } from './base-actor.ts';

const actorHandler: ProxyHandler<typeof WH40KBaseActor> = {
    construct(_: typeof WH40KBaseActor, args: any[]): Actor {
        const type: string | undefined = args[0]?.type;
        const cls = CONFIG.Actor.documentClasses[type] ?? WH40KBaseActor;
        return new cls(...args);
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
