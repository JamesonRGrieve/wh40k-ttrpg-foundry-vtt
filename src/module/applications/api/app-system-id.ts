/**
 * @file Pure resolver for a dialog/prompt's active game-system id (#422).
 *
 * Kept Foundry-free (no `foundry.*` at load) so it is unit-testable in isolation
 * and importable by `ApplicationV2Mixin` without pulling the framework in.
 */

/** A handle that may carry a game-system id. */
interface SystemHandle {
    system?: { gameSystem?: string };
}

/** The heterogeneous actor/document handles a dialog or prompt may carry a system on. */
export interface AppSystemHandles {
    rollData?: { sourceActor?: SystemHandle | null; actor?: SystemHandle | null } | null;
    document?: SystemHandle | null;
    actor?: SystemHandle | null;
    object?: SystemHandle | null;
}

/**
 * Resolve the active game-system id for a dialog/prompt by probing the common
 * actor / document handles it may carry, in priority order (a roll prompt's
 * rolling actor wins). Returns `undefined` for system-agnostic apps, which then
 * keep their base colour rather than pinning to a wrong line.
 */
export function resolveAppSystemId(app: AppSystemHandles): string | undefined {
    return (
        app.rollData?.sourceActor?.system?.gameSystem ??
        app.rollData?.actor?.system?.gameSystem ??
        app.document?.system?.gameSystem ??
        app.actor?.system?.gameSystem ??
        app.object?.system?.gameSystem
    );
}
