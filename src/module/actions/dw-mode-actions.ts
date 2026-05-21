/**
 * Deathwatch Squad Mode / Solo Mode sheet-action handlers (#163).
 *
 * Each export is invoked as a Foundry V2 ApplicationV2 action handler
 * — `this` is the sheet (which exposes the live `actor` reference),
 * and the (event, target) pair carries the originating DOM click.
 * Action names match the `data-action` attributes on the panel
 * partial (`dwEnterSquadMode`, `dwLeaveSquadMode`).
 *
 * RAW-correctness lives in `rules/dw-squad-mode.ts`; these handlers
 * own only the I/O: persist the new `combatMode`, clear sustained
 * abilities on a Squad → Solo transition, and post a transition
 * chat card. The handlers are best-effort idempotent — clicking
 * "Enter Squad Mode" while already in Squad Mode no-ops, and the
 * same for "Return to Solo Mode" while already Solo.
 *
 * Localisation: all player-facing strings resolve through
 * `WH40K.DW.Mode.*` keys in the langpack; no hard-coded English here.
 */

import { enterSquadMode, leaveSquadMode, type DwMode } from '../rules/dw-squad-mode.ts';

/**
 * Minimal `this` shape for a DW mode-transition action handler.
 *
 * The orchestrator splices these methods onto `CharacterSheet`, whose
 * `actor` field is a `WH40KCharacter`. Using a structural `{ actor }`
 * `this` here keeps the module decoupled from CharacterSheet's full
 * surface — the handler only needs the actor reference to read
 * `system.combatMode` and write the transition.
 */
export interface DwModeActionThis {
    actor: {
        name: string | null;
        system: {
            combatMode: DwMode;
            sustainedAbilities: string[];
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() signature accepts arbitrary diff records and returns the resolved Document or undefined
        update: (data: Record<string, unknown>) => Promise<unknown>;
    };
}

/** Path to the chat-card partial; matches the preload entry. */
const CHAT_PARTIAL = 'systems/wh40k-rpg/templates/chat/dw-mode-chat.hbs';

/**
 * Enter Squad Mode: persist `combatMode = 'squad'` and post a chat
 * card. The RAW gating (Full Action vs. Cohesion Challenge) is the
 * caller's concern — the panel only renders the button when the
 * brother is currently in Solo Mode, so the gating manifests as a
 * UI no-op when already in Squad Mode.
 */
export async function dwEnterSquadMode(this: DwModeActionThis, _event: Event, _target: HTMLElement): Promise<void> {
    const current = this.actor.system.combatMode;
    const result = enterSquadMode(current);
    if (!result.transitioned) return;

    await this.actor.update({
        'system.combatMode': result.newMode,
    });

    await postModeTransitionChat(this.actor, current, result.newMode, 'WH40K.DW.Mode.Enter.FullAction');
}

/**
 * Return to Solo Mode: persist `combatMode = 'solo'`, clear the
 * sustained-abilities list (RAW: Sustained Squad-mode abilities end
 * the moment the activator leaves Squad Mode), and post a chat card.
 */
export async function dwLeaveSquadMode(this: DwModeActionThis, _event: Event, _target: HTMLElement): Promise<void> {
    const current = this.actor.system.combatMode;
    const result = leaveSquadMode(current);
    if (!result.transitioned) return;

    await this.actor.update({
        'system.combatMode': result.newMode,
        'system.sustainedAbilities': [],
    });

    await postModeTransitionChat(this.actor, current, result.newMode, 'WH40K.DW.Mode.Leave');
}

/**
 * Render and post the mode-transition chat card. Reads exactly the
 * fields the `dw-mode-chat.hbs` template declares; no other side
 * effects.
 */
async function postModeTransitionChat(actor: DwModeActionThis['actor'], previous: DwMode, next: DwMode, transitionMessageKey: string): Promise<void> {
    const previousModeKey = previous === 'squad' ? 'WH40K.DW.Mode.Squad' : 'WH40K.DW.Mode.Solo';
    const newModeKey = next === 'squad' ? 'WH40K.DW.Mode.Squad' : 'WH40K.DW.Mode.Solo';

    const content = await foundry.applications.handlebars.renderTemplate(CHAT_PARTIAL, {
        gameSystem: 'dw',
        actorName: actor.name ?? '',
        previousMode: previous,
        newMode: next,
        previousModeKey,
        newModeKey,
        transitionMessageKey,
        viaKey: next === 'squad' ? transitionMessageKey : '',
        // Support-range readout is omitted from the chat card by
        // default; the calling site can extend the context if a
        // future story wants it surfaced. Keep the shape stable so
        // the panel-side preload entry stays valid.
        renownRankKey: '',
        supportRange: null,
    });

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const payload = { user: game.user.id, content } as unknown as Parameters<typeof ChatMessage.create>[0];
    await ChatMessage.create(payload);
}
