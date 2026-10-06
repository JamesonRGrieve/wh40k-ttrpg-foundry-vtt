/**
 * GM socket proxy for cross-ownership document writes (#562).
 *
 * When a player needs to change a document they don't own (healing an NPC, a
 * psychic power's effect landing on its target), the request is emitted via the
 * system socket and the GM executes it. This avoids granting OWNER permission to
 * every player on every NPC.
 */

const SOCKET_NAME = 'system.wh40k-rpg';

interface ProxyUpdatePayload {
    readonly type: 'updateActor';
    readonly actorId: string;
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

interface SocketLike {
    on: (name: string, handler: (payload: ProxyPayload) => void) => void;
    emit: (name: string, payload: ProxyPayload) => void;
}

/** The slice of an actor a proxied effect creation needs. */
export interface EffectRecipientLike {
    uuid: string;
    isOwner: boolean;
    createEmbeddedDocuments: (embeddedName: 'ActiveEffect', data: object[]) => Promise<readonly object[] | undefined>;
}

function getSocket(): SocketLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry game.socket is untyped
    return (game as { socket: SocketLike }).socket;
}

export function registerGMProxy(): void {
    getSocket().on(SOCKET_NAME, (payload: ProxyPayload) => {
        if (!game.user.isGM) return;
        void handleProxyRequest(payload);
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
    const actor = game.actors.get(payload.actorId);
    if (actor === undefined) {
        console.warn(`WH40K | GM proxy: actor ${payload.actorId} not found`);
        return;
    }
    await actor.update(payload.data);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payload is an open-ended Record
export async function gmProxyActorUpdate(actorId: string, data: Record<string, unknown>): Promise<void> {
    const actor = game.actors.get(actorId);
    if (actor === undefined) return;

    if (actor.isOwner) {
        await actor.update(data);
        return;
    }

    const payload: ProxyUpdatePayload = { type: 'updateActor', actorId, data };
    getSocket().emit(SOCKET_NAME, payload);
}

/** Create ActiveEffects on an actor, directly when the user owns it, else through the GM. */
export async function gmProxyCreateActorEffects(actor: EffectRecipientLike, effects: readonly object[]): Promise<void> {
    if (effects.length === 0) return;
    if (actor.isOwner) {
        await actor.createEmbeddedDocuments('ActiveEffect', [...effects]);
        return;
    }
    const payload: ProxyCreateEffectsPayload = { type: 'createActorEffects', actorUuid: actor.uuid, effects };
    getSocket().emit(SOCKET_NAME, payload);
}
