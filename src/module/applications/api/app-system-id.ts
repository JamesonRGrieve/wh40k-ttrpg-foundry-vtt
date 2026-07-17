/**
 * @file Named-handle adapter over the `firstSystemId` resolver for dialogs/prompts (#422/#461).
 *
 * The game-system-id resolution knowledge (walk actor/document handles, first
 * non-empty `.system.gameSystem` wins) lives ONCE in `utils/chat-system-id.ts`.
 * This module only names the fixed priority order a dialog/prompt carries and
 * delegates to it, so the two never drift (they previously did on empty-string
 * handling). Both stay Foundry-free / unit-testable.
 */

import { firstSystemId } from '../../utils/chat-system-id.ts';

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
 * Resolve the active game-system id for a dialog/prompt by probing its common
 * actor / document handles in priority order (a roll prompt's rolling actor
 * wins). Returns `undefined` for system-agnostic apps, which then keep their
 * base colour rather than pinning to a wrong line. Delegates to `firstSystemId`.
 */
export function resolveAppSystemId(app: AppSystemHandles): string | undefined {
    return firstSystemId(app.rollData?.sourceActor, app.rollData?.actor, app.document, app.actor, app.object);
}
