import { WH40KBaseActor } from './base-actor.ts';

type ActorConfigLike = {
    documentClasses: Record<string, typeof WH40KBaseActor | undefined>;
};

const actorHandler: ProxyHandler<typeof WH40KBaseActor> = {
    construct(_: typeof WH40KBaseActor, args: ConstructorParameters<typeof WH40KBaseActor>): Actor {
        const data = args[0] as unknown as Record<string, unknown>;
        const type: string | undefined = typeof data?.['type'] === 'string' ? data['type'] : undefined;
        const cls = type != null ? (CONFIG.Actor as unknown as ActorConfigLike).documentClasses[type] ?? WH40KBaseActor : WH40KBaseActor;
        return new cls(...args);
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
