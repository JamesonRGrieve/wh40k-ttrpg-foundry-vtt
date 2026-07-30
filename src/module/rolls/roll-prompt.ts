/**
 * Roll-prompt port — the seam Documents use to open a roll dialog without
 * importing the UI layer (#516).
 *
 * `documents-must-not-depend-on-applications` exists because Documents are the
 * system's API surface: `actor.rollSkill(...)` must be callable from a macro, a
 * chat-card action, or a test without dragging an `ApplicationV2` subclass and
 * its Handlebars templates into the module graph. Four Document→dialog imports
 * (`acolyte.ts`, `base-actor.ts`, `npc.ts` reaching straight into
 * `applications/prompts/`) breached that, and every additional dialog wired the
 * same way would have added another.
 *
 * The indirection the rule wants is dependency inversion, not a barrel:
 *
 *   - `documents/*` calls {@link openRollPrompt} / {@link openDamagePrompt},
 *     which live here in `rolls/` — a layer Documents already depend on.
 *   - `applications/*` supplies the concrete openers exactly once, at system
 *     bootstrap, via {@link registerRollPrompts}. `hooks-manager.ts` is the
 *     composition root that does it — it sits above both layers, so it may see
 *     both.
 *
 * The registration is explicit rather than a module-load side effect, so the
 * wiring is visible at the bootstrap call site and a test can install its own
 * openers (and restore via {@link resetRollPrompts}) without a live Foundry
 * `ApplicationV2`.
 *
 * **This module imports nothing, and must stay that way.** A port that reaches
 * back into `action-data.ts` for the concrete payload type is not a seam — even
 * as `import type`, it puts the whole roll-data graph one hop behind a value
 * import from `documents/*`, which re-creates through the port the very
 * `no-circular` cycles the direct dialog import produced (measured: +1 the first
 * time this was written with `import type { ActionData }`). Hence the opaque
 * {@link RollPromptPayload} below and the one narrowing adapter at the
 * registration site.
 */

/**
 * A prepared roll, carried opaquely. The concrete type at both ends is
 * `ActionData` (`rolls/action-data.ts`) — every Document builds one and the
 * unified dialog renders one — but the port never reads a field off it, so it
 * describes only the identity every `ActionData` carries. Naming the class here
 * would cost the import-leaf property this module depends on.
 */
export interface RollPromptPayload {
    /** Stable per-roll id. Present on every `ActionData`. */
    readonly id: string;
}

/**
 * A damage roll's payload. A legacy plain object assembled ad-hoc at the
 * Document call sites (weapon name + damage formula + penetration + damage
 * type), not a DataModel — the shape `prepareDamageRoll` has always taken.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the damage-prompt payload is a legacy plain object built ad-hoc at the Document call sites; no DataModel describes it
export type DamagePromptPayload = Record<string, unknown>;

/** The openers the UI layer installs. Both are required — a half-wired port would fail at runtime, not at boot. */
export interface RollPromptOpeners {
    /** Opens the unified roll dialog. */
    readonly openRoll: (payload: RollPromptPayload) => void;
    /** Opens the damage roll dialog. */
    readonly openDamage: (payload: DamagePromptPayload) => void;
}

let installed: RollPromptOpeners | null = null;

/**
 * Install the concrete dialog openers. Called once from the system bootstrap
 * (`hooks-manager.ts`). Re-registering replaces the previous pair, so a module
 * or a test may substitute its own.
 */
export function registerRollPrompts(openers: RollPromptOpeners): void {
    installed = openers;
}

/** Drop the installed openers. Test-only teardown; a no-op when nothing is installed. */
export function resetRollPrompts(): void {
    installed = null;
}

/** True once the UI layer has installed its openers. */
export function rollPromptsRegistered(): boolean {
    return installed !== null;
}

/**
 * Report an unwired port. A Document reaching a prompt before bootstrap
 * finished is a wiring bug, so it is surfaced loudly rather than swallowed —
 * the roll silently doing nothing is exactly the failure this seam must not
 * introduce.
 */
function reportUnwired(which: string): void {
    game.wh40k.error(`Roll prompt "${which}" was opened before the UI layer registered its openers; the dialog cannot be shown.`);
}

/**
 * Open the unified roll dialog for `payload`. The Document-layer entry point —
 * replaces a direct `prepareUnifiedRoll` import from
 * `applications/prompts/unified-roll-dialog.ts`.
 */
export function openRollPrompt(payload: RollPromptPayload): void {
    if (installed === null) {
        reportUnwired('unified-roll');
        return;
    }
    installed.openRoll(payload);
}

/**
 * Open the damage roll dialog for `payload`. The Document-layer entry point —
 * replaces a direct `prepareDamageRoll` import from
 * `applications/prompts/damage-roll-dialog.ts`.
 */
export function openDamagePrompt(payload: DamagePromptPayload): void {
    if (installed === null) {
        reportUnwired('damage-roll');
        return;
    }
    installed.openDamage(payload);
}
