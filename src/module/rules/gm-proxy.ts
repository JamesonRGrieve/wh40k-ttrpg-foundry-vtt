/**
 * GM socket proxy for cross-ownership document writes (#562).
 *
 * When a player needs to change a document they don't own (healing an NPC, a
 * psychic power's effect landing on its target), the request is emitted via the
 * system socket and the GM executes it. This avoids granting OWNER permission to
 * every player on every NPC.
 */

import { emitSystemSocket, onSystemSocket, type SystemSocketMessage } from '../utils/system-socket.ts';

interface ProxyUpdatePayload {
    readonly type: 'updateActor';
    /** A UUID, not an id, so an unlinked token's synthetic actor resolves too (#782). */
    readonly actorUuid: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payload is an open-ended Record
    readonly data: Record<string, unknown>;
}

interface ProxyCreateEffectsPayload {
    readonly type: 'createActorEffects';
    /** A UUID, not an id, so an unlinked token's synthetic actor resolves too. */
    readonly actorUuid: string;
    readonly effects: readonly object[];
}

type ProxyPayload = ProxyUpdatePayload | ProxyCreateEffectsPayload;

/** The system socket also carries other features' messages (attack cues); only these two are the proxy's. */
function isProxyPayload(message: SystemSocketMessage): message is ProxyPayload {
    return message.type === 'updateActor' || message.type === 'createActorEffects';
}

/** An actor the proxy can update: directly when owned, else by its UUID through the GM. */
export interface ProxyActor {
    readonly uuid: string | null;
    readonly isOwner: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payload is an open-ended Record
    readonly update: (data: Record<string, unknown>) => Promise<unknown>;
}

/** The slice of an actor a proxied effect creation needs. */
export interface EffectRecipientLike {
    uuid: string;
    isOwner: boolean;
    createEmbeddedDocuments: (embeddedName: 'ActiveEffect', data: object[]) => Promise<readonly object[] | undefined>;
}

export function registerGMProxy(): void {
    onSystemSocket((message) => {
        if (!game.user.isGM || !isProxyPayload(message)) return;
        void handleProxyRequest(message);
    });
}

async function handleProxyRequest(payload: ProxyPayload): Promise<void> {
    if (payload.type === 'createActorEffects') {
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid resolves any document type; a createActorEffects request only ever names an actor
        const recipient = (await fromUuid(payload.actorUuid)) as unknown as EffectRecipientLike | null;
        if (recipient === null) {
            console.warn(`WH40K | GM proxy: actor ${payload.actorUuid} not found`);
            return;
        }
        await recipient.createEmbeddedDocuments('ActiveEffect', [...payload.effects]);
        return;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid resolves any document type; an updateActor request only ever names an actor
    const actor = (await fromUuid(payload.actorUuid)) as unknown as ProxyActor | null;
    if (actor === null) {
        console.warn(`WH40K | GM proxy: actor ${payload.actorUuid} not found`);
        return;
    }
    await actor.update(payload.data);
}

/**
 * Update an actor the user may not own (#562). An owner updates it directly; anyone
 * else asks the GM through the system socket, naming the actor by UUID so an
 * unlinked token's synthetic actor (whose id is its base actor's) is the one
 * changed, not the world actor (#782).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payload is an open-ended Record
export async function gmProxyActorUpdate(actor: ProxyActor, data: Record<string, unknown>): Promise<void> {
    if (actor.isOwner) {
        await actor.update(data);
        return;
    }
    // An actor with no UUID (an unsaved document) can't be named to the GM.
    if (actor.uuid === null) return;
    const payload: ProxyUpdatePayload = { type: 'updateActor', actorUuid: actor.uuid, data };
    emitSystemSocket(payload);
}

/** Create ActiveEffects on an actor, directly when the user owns it, else through the GM. */
export async function gmProxyCreateActorEffects(actor: EffectRecipientLike, effects: readonly object[]): Promise<void> {
    if (effects.length === 0) return;
    if (actor.isOwner) {
        await actor.createEmbeddedDocuments('ActiveEffect', [...effects]);
        return;
    }
    const payload: ProxyCreateEffectsPayload = { type: 'createActorEffects', actorUuid: actor.uuid, effects };
    emitSystemSocket(payload);
}
