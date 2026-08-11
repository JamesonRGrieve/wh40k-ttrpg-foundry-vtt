/**
 * GM socket proxy for cross-ownership document updates (#562).
 *
 * When a player needs to update a document they don't own (e.g. healing an
 * NPC), the update is emitted via the system socket and the GM executes it.
 * This avoids granting OWNER permission to every player on every NPC.
 */

const SOCKET_NAME = 'system.wh40k-rpg';

interface ProxyUpdatePayload {
    readonly type: 'updateActor';
    readonly actorId: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor.update payload is an open-ended Record
    readonly data: Record<string, unknown>;
}

interface SocketLike {
    on: (name: string, handler: (payload: ProxyUpdatePayload) => void) => void;
    emit: (name: string, payload: ProxyUpdatePayload) => void;
}

function getSocket(): SocketLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry game.socket is untyped
    return (game as { socket: SocketLike }).socket;
}

export function registerGMProxy(): void {
    getSocket().on(SOCKET_NAME, (payload: ProxyUpdatePayload) => {
        if (!game.user.isGM) return;
        void handleProxyRequest(payload);
    });
}

async function handleProxyRequest(payload: ProxyUpdatePayload): Promise<void> {
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
