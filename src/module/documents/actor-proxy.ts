import { WH40KBaseActor } from './base-actor.ts';

type ActorConfigLike = {
    documentClasses: Record<string, typeof WH40KBaseActor | undefined>;
};

const actorHandler: ProxyHandler<typeof WH40KBaseActor> = {
    construct(_: typeof WH40KBaseActor, args: any[]): Actor {
        const type: string | undefined = args[0]?.type;
        const cls = type ? (CONFIG.Actor as unknown as ActorConfigLike).documentClasses[type] ?? WH40KBaseActor : WH40KBaseActor;
        return new cls(...args) as unknown as Actor;
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
