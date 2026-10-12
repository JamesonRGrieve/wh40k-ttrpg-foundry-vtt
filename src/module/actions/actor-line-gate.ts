/**
 * @file The game-line gate for line-specific sheet actions (#596).
 *
 * A line's sheet actions (BC rituals, psychic tests, apotheosis, …) no-op on
 * an actor from another line, so a stale wiring on a homologated sheet never
 * offers e.g. a Chaos Ritual to a DH2 character. The line is the actor's own
 * `system.gameSystem` — a field every character DataModel carries. (The
 * `_gameSystemId` these handlers used to read lives on the SHEET, never on the
 * actor, so the old gate returned on every actor.)
 */

import type { GameSystemId } from '../config/game-systems/types.ts';

/** The actor surface the gate reads. */
export interface LineBearer {
    readonly system: { readonly gameSystem: string };
}

/** Whether the actor belongs to `line`. */
export function isActorOnLine(actor: LineBearer, line: GameSystemId): boolean {
    return actor.system.gameSystem === line;
}
