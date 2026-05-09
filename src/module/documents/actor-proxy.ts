import { WH40KBaseActor } from './base-actor.ts';

interface ActorConfigLike {
    documentClasses: Record<string, typeof WH40KBaseActor | undefined>;
}

interface ActorConstructorData {
    type?: string;
}

const actorHandler: ProxyHandler<typeof WH40KBaseActor> = {
    construct(_: typeof WH40KBaseActor, args: ConstructorParameters<typeof WH40KBaseActor>): Actor {
        const data = args[0] as ActorConstructorData | undefined;
        const type: string | undefined = typeof data?.type === 'string' ? data.type : undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry CONFIG is untyped
        const documentClasses = (CONFIG.Actor as unknown as ActorConfigLike).documentClasses;
        const cls = type !== undefined ? documentClasses[type] ?? WH40KBaseActor : WH40KBaseActor;
        return new cls(...args);
    },
};

export const WH40KActorProxy = new Proxy(WH40KBaseActor, actorHandler);
