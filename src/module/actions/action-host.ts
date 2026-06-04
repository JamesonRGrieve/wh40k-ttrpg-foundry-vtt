/**
 * Shared per-system action-host envelope + helpers (#313).
 *
 * The per-system sheet action handlers (`dw-*-actions.ts`, `ow-*-actions.ts`,
 * `bc-*-actions.ts`) each re-declared the same `this`-host shape, the same
 * per-system actor guard, the same failure reporter, and the same
 * render-template-then-post-chat idiom. This module is the single source of all
 * four. Handlers that own the full envelope alias `ActionHost<TSystem>` and
 * parameterise only the `system` slot; the standalone helpers are typed
 * structurally so a handler with a narrower host (e.g. one whose actor never
 * calls `update`) can still use them.
 *
 * Layering: this lives in the actions layer and depends only on `rolls/` and
 * `config/` — it must not import from `applications/`.
 */

import type { GameSystemId } from '../config/game-systems/types.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';

/**
 * Notification dispatcher the sheet binds onto every action host (wraps
 * `ui.notifications`). The trailing options bag (duration, permanent, console…)
 * is Foundry-untyped.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: ui.notifications options bag is Foundry-untyped (duration, permanent, console, etc.)
export type NotifyFn = (type: 'info' | 'warning' | 'error', message: string, options?: Record<string, unknown>) => void;

/** The actor surface a full action host exposes; `TSystem` is the per-handler system slot. */
interface ActorEnvelope<TSystem> {
    readonly id: string;
    readonly name: string;
    readonly system: TSystem;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update payload is an open bag; values are not statically known
    update: (data: Record<string, unknown>) => Promise<unknown>;
}

/**
 * The `this` shape a sheet static action binds. `TSystem` carries the handler's
 * DataModel slots; handlers write `export type DwOathActionHost =
 * ActionHost<{ activeOathId: string | null; isLeader: boolean }>`. A handler
 * whose actor never calls `update` should declare its own narrower host instead
 * of this alias and rely on the structurally-typed helpers below.
 */
export interface ActionHost<TSystem> {
    readonly actor: ActorEnvelope<TSystem>;
    _notify: NotifyFn;
}

/** Minimal host shape the per-system guard reads. */
interface SystemGuardHost {
    readonly actor: { readonly system: object };
    _resolveGameSystemId?: () => string;
}

/**
 * True when the host's actor belongs to game system `sysId`. Prefers the sheet's
 * authoritative `_resolveGameSystemId()`, falling back to the `gameSystem` id on
 * the actor's system data. The typed `sysId` parameter makes a mistyped literal
 * (e.g. `'0w'`) a compile error.
 */
export function isActorOfSystem(host: SystemGuardHost, sysId: GameSystemId): boolean {
    if (typeof host._resolveGameSystemId === 'function') {
        return host._resolveGameSystemId() === sysId;
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-system gameSystem id lives on the system data; the abstract actor surface doesn't expose it
    const sys = host.actor.system as { gameSystem?: string };
    return sys.gameSystem === sysId;
}

/** Notify + console.error a failed action uniformly (5s error toast). */
// eslint-disable-next-line no-restricted-syntax -- boundary: thrown values are `unknown` per TS contract; fed directly into the `instanceof Error` type-guard below
export function reportFailure(host: { _notify: NotifyFn }, label: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    host._notify('error', `${label}: ${message}`, { duration: 5000 });
    console.error(`${label} error:`, error);
}

/**
 * Render a chat `template` with `ctx` and post it as a chat card spoken by the
 * host actor. `ctx.gameSystem` drives the per-system `data-wh40k-system` stamp
 * inside the template (CLAUDE.md §3a), so the card's children resolve their
 * per-system variants. Typed structurally on `{ actor: { name } }` so any host
 * shape can post.
 */
export async function postActionChat(template: string, ctx: object, host: { readonly actor: { readonly name: string } }): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: foundry renderTemplate requires AnyObject; ctx is a structurally-compatible context object
    const html = await foundry.applications.handlebars.renderTemplate(template, ctx as unknown as Record<string, unknown>);
    await postChatCard(html, { speaker: { alias: host.actor.name } });
}
