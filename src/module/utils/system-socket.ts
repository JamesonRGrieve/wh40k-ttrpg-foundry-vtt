/**
 * The system's one socket channel. Several features share it (the GM proxy, attack
 * cues), so every message carries a `type` and each listener ignores the rest.
 */

export const SYSTEM_SOCKET = 'system.wh40k-rpg';

/** Any message on the system socket. */
export interface SystemSocketMessage {
    readonly type: string;
}

interface SocketLike {
    on: (name: string, handler: (payload: SystemSocketMessage) => void) => void;
    emit: (name: string, payload: SystemSocketMessage) => void;
}

function getSocket(): SocketLike {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry game.socket is untyped
    return (game as { socket: SocketLike }).socket;
}

/** Listen on the system socket. */
export function onSystemSocket(handler: (payload: SystemSocketMessage) => void): void {
    getSocket().on(SYSTEM_SOCKET, handler);
}

/** Send a message to every other connected client on the system socket. */
export function emitSystemSocket(payload: SystemSocketMessage): void {
    getSocket().emit(SYSTEM_SOCKET, payload);
}
