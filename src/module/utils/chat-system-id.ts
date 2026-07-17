/**
 * @file Pure helper for resolving a chat card's active game-system id (#422).
 *
 * Chat cards render outside any sheet root, so `{{themeClassFor}}` needs the
 * rolling/speaking actor's game system surfaced on the render context as
 * `_gameSystemId`. This picks the first system id among the actor/document
 * handles a chat render site has in scope. Foundry-free so it is unit-testable
 * and importable from any layer (rolls / data / documents / applications).
 */

/** The shape read off a handle after it is narrowed to a non-null object. */
interface ChatSystemHandle {
    system?: { gameSystem?: string } | null;
}

/**
 * First `system.gameSystem` string among the given handles, or `undefined` when
 * none carry one (the card then keeps its base colour rather than pinning to a
 * wrong line). Pass the actor(s) in scope at the render site, most-specific first
 * (e.g. the rolling actor before a target).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: accepts heterogeneous Foundry actor/data handles (an Actor's `system` is a wide per-subtype union that only surfaces `gameSystem` via an index signature); each is narrowed to a string by the guards below.
export function firstSystemId(...handles: unknown[]): string | undefined {
    for (const handle of handles) {
        if (handle === null || typeof handle !== 'object') continue;
        const gameSystem = (handle as ChatSystemHandle).system?.gameSystem;
        if (typeof gameSystem === 'string' && gameSystem !== '') return gameSystem;
    }
    return undefined;
}
