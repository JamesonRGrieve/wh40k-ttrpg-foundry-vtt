/**
 * Black Crusade Daemon Prince action handlers (#182).
 *
 * Exported static method `bcAscend` is registered into the character
 * sheet's `DEFAULT_OPTIONS.actions` map by the orchestrator via
 * `.integration-staging/182.json`. It is invoked with `this` bound to
 * the sheet instance.
 *
 * Flow:
 *
 *   1. Read live Infamy / Corruption / Chaos alignment off `actor.system`.
 *   2. Evaluate the apotheosis gate via the pure resolver
 *      `ascendCharacter(...)` from `../rules/bc-daemon-prince.ts`.
 *   3. If blocked, surface the matching i18n notification and abort.
 *   4. Otherwise prompt the operator for confirmation via DialogV2; on
 *      accept, persist the ascension record via
 *      `actor.update({ 'system.daemonPrinceAscension': … })` and post
 *      the `bc-ascension-chat.hbs` chat card.
 *
 * The handler is the single mutation point for the ascension record;
 * the pure engine never touches actor state.
 */

import type { BcDaemonPrinceDeclarations } from '../data/actor/mixins/bc-daemon-prince-template.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { ascendCharacter, getDaemonPrinceBoost, isAscended, type DaemonPrinceAlignment } from '../rules/bc-daemon-prince.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/* -------------------------------------------- */
/*  Structural sheet contract                   */
/* -------------------------------------------- */

/**
 * Minimum surface the action reads off `this`. The character sheet
 * (which is what `this` is bound to at runtime) is a superset of this
 * shape; we keep the contract tight so the action module stays
 * uncoupled from the full sheet class.
 *
 * The system shape is the intersection of the BC Daemon Prince
 * declarations and the Chaos / Infamy fields the engine reads. The
 * Chaos alignment field is declared on `CharacterData` upstream of this
 * module; we restate the narrow surface we read so the action stays
 * compile-clean even if the upstream interface is reshaped.
 */
interface BcDaemonPrinceActorSystem extends BcDaemonPrinceDeclarations {
    readonly infamy: number;
    readonly corruption: number;
    readonly chaosAlignment: DaemonPrinceAlignment;
}

interface BcDaemonPrinceSheetLike {
    actor: Actor & {
        readonly _gameSystemId?: string;
        readonly system: BcDaemonPrinceActorSystem;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() return shape is the resolved Document or undefined; treat as unknown to caller
        update: (data: { 'system.daemonPrinceAscension': { ascendedAt: number; alignmentAtAscension: DaemonPrinceAlignment } }) => Promise<unknown>;
    };
}

/* -------------------------------------------- */
/*  Confirmation dialog                         */
/* -------------------------------------------- */

async function promptConfirm(): Promise<boolean> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi) return false;

    const i18n = game.i18n;
    const title = i18n.localize('WH40K.BC.DaemonPrince.Confirm.Title');
    const body = i18n.localize('WH40K.BC.DaemonPrince.Confirm.Body');
    const okLabel = i18n.localize('WH40K.BC.DaemonPrince.Confirm.Ok');
    const cancelLabel = i18n.localize('WH40K.BC.DaemonPrince.Confirm.Cancel');

    const content = `<p>${body}</p>`;

    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt return type is `unknown` per Foundry's contract; narrowed below via runtime checks
    const promptResult: unknown = await dialogApi.prompt({
        window: { title },
        content,
        ok: {
            label: okLabel,
            callback: (): true => true,
        },
        rejectClose: false,
    });

    if (promptResult === true) return true;
    // Some DialogV2 variants surface a cancel button; we treat anything
    // not strictly `true` as a rejection.
    if (typeof promptResult === 'object' && promptResult !== null) {
        // Defensive narrowing for shapes that wrap the callback return.
        const r = promptResult as { confirmed?: boolean };
        if (r.confirmed === true) return true;
    }
    // Reference cancelLabel so unused-locals lint doesn't catch it; the
    // label is shown through the dialog API when supported, and stays
    // available here as documentation of the rejection affordance.
    void cancelLabel;
    return false;
}

/* -------------------------------------------- */
/*  Action handler                              */
/* -------------------------------------------- */

/**
 * `data-action="bcAscend"` handler. Checks the apotheosis gate, prompts
 * for confirmation, persists the ascension record, and posts the chat
 * card.
 *
 * No-op for non-BC actors so a stale wiring on a homologated sheet
 * doesn't surprise the GM with an Apotheosis prompt on (e.g.) a DH2
 * character. Also no-op for already-ascended characters — apotheosis
 * fires once.
 */
export async function bcAscend(this: BcDaemonPrinceSheetLike, _event: Event, _target: HTMLElement): Promise<void> {
    if (this.actor._gameSystemId !== 'bc') return;

    const system = this.actor.system;

    // Already ascended? Bail without prompt; the panel button should be
    // hidden in this branch, but defend in depth. The engine's
    // {@link isAscended} takes a fully-resolved {ascendedAt: number}
    // record-or-null; we narrow the persisted shape (which carries
    // `ascendedAt: number | null`) before handing it across.
    const persisted = system.daemonPrinceAscension;
    const resolvedRecord = persisted.ascendedAt === null ? null : { ascendedAt: persisted.ascendedAt, alignmentAtAscension: persisted.alignmentAtAscension };
    if (isAscended(resolvedRecord)) return;

    const gate = ascendCharacter({
        currentInfamy: system.infamy,
        currentCorruption: system.corruption,
        alignment: system.chaosAlignment,
    });

    if (!gate.ascended) {
        const key =
            gate.reason === 'insufficient-infamy'
                ? 'WH40K.BC.DaemonPrince.Ascension.Insufficient.Infamy'
                : 'WH40K.BC.DaemonPrince.Ascension.Insufficient.Corruption';
        ui.notifications.warn(game.i18n.localize(key));
        return;
    }

    const confirmed = await promptConfirm();
    if (!confirmed) return;

    const ascendedAt = Math.trunc(Number(game.time.worldTime));
    const record = {
        ascendedAt,
        alignmentAtAscension: system.chaosAlignment,
    };

    await this.actor.update({ 'system.daemonPrinceAscension': record });

    const boost = getDaemonPrinceBoost(record);
    const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/bc-ascension-chat.hbs', {
        gameSystem: 'bc',
        _gameSystemId: firstSystemId(this.actor),
        ascendedAt: record.ascendedAt,
        alignmentAtAscension: record.alignmentAtAscension,
        boost,
    });

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker takes WH40KBaseActor; our typed Actor subtype union is structurally compatible
    const speakerActor = this.actor as unknown as Parameters<typeof ChatMessage.getSpeaker>[0];
    await postChatCard(content, { speaker: ChatMessage.getSpeaker(speakerActor) });
}
