/**
 * Black Crusade apotheosis action handler (#182 — BC Core p267).
 *
 * Exported `bcAscend` is registered into the character sheet's
 * `DEFAULT_OPTIONS.actions` map and invoked with `this` bound to the sheet.
 *
 * Flow:
 *
 *   1. Read live Corruption / Infamy / Chaos alignment off `actor.system` and
 *      the GM's apotheosis Infamy threshold from the world setting.
 *   2. Evaluate the rule via the pure resolver `resolveApotheosis(...)`.
 *   3. Below 100 Corruption, surface a notification and abort.
 *   4. Otherwise prompt for confirmation via DialogV2; on accept, persist the
 *      record (with its Daemon Prince / Chaos Spawn outcome) via
 *      `actor.update({ 'system.daemonPrinceAscension': … })` and post the
 *      `bc-ascension-chat.hbs` chat card. Either way the character leaves play;
 *      the book prints no stat changes, so none are applied.
 *
 * The handler is the single mutation point for the record; the pure engine
 * never touches actor state.
 */

import type { BcDaemonPrinceDeclarations } from '../data/actor/mixins/bc-daemon-prince-template.ts';
import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import { APOTHEOSIS_CORRUPTION, isAscended, resolveApotheosis, type ApotheosisOutcome, type DaemonPrinceAlignment } from '../rules/bc-daemon-prince.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';

/* -------------------------------------------- */
/*  Structural sheet contract                   */
/* -------------------------------------------- */

/**
 * Minimum surface the action reads off `this`. The character sheet (which is
 * what `this` is bound to at runtime) is a superset of this shape.
 */
interface BcDaemonPrinceActorSystem extends BcDaemonPrinceDeclarations {
    readonly infamy: number;
    readonly corruption: number;
    readonly chaosAlignment: DaemonPrinceAlignment;
}

/** The record the action persists. */
interface ApotheosisRecord {
    ascendedAt: number;
    alignmentAtAscension: DaemonPrinceAlignment;
    outcome: ApotheosisOutcome;
}

interface BcDaemonPrinceSheetLike {
    actor: Actor & {
        readonly _gameSystemId?: string;
        readonly system: BcDaemonPrinceActorSystem;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update() return shape is the resolved Document or undefined; treat as unknown to caller
        update: (data: { 'system.daemonPrinceAscension': ApotheosisRecord }) => Promise<unknown>;
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

    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt return type is `unknown` per Foundry's contract; narrowed below via runtime checks
    const promptResult: unknown = await dialogApi.prompt({
        window: { title },
        content: `<p>${body}</p>`,
        ok: {
            label: okLabel,
            callback: (): true => true,
        },
        rejectClose: false,
    });

    return promptResult === true;
}

/* -------------------------------------------- */
/*  Action handler                              */
/* -------------------------------------------- */

/**
 * `data-action="bcAscend"` handler. Checks the claim (100 Corruption), prompts
 * for confirmation, persists the record with its outcome, and posts the chat
 * card.
 *
 * No-op for non-BC actors and for champions already claimed — the claim
 * fires once.
 */
export async function bcAscend(this: BcDaemonPrinceSheetLike, _event: Event, _target: HTMLElement): Promise<void> {
    if (this.actor._gameSystemId !== 'bc') return;

    const system = this.actor.system;

    const persisted = system.daemonPrinceAscension;
    const resolvedRecord =
        persisted.ascendedAt === null
            ? null
            : { ascendedAt: persisted.ascendedAt, alignmentAtAscension: persisted.alignmentAtAscension, outcome: persisted.outcome };
    if (isAscended(resolvedRecord)) return;

    const readout = resolveApotheosis({
        corruption: system.corruption,
        infamy: system.infamy,
        infamyThreshold: WH40KSettings.getApotheosisInfamyThreshold(),
    });

    if (!readout.claimed) {
        ui.notifications.warn(game.i18n.format('WH40K.BC.DaemonPrince.Blocked', { corruption: String(APOTHEOSIS_CORRUPTION) }));
        return;
    }

    const confirmed = await promptConfirm();
    if (!confirmed) return;

    const record: ApotheosisRecord = {
        ascendedAt: Math.trunc(Number(game.time.worldTime)),
        alignmentAtAscension: system.chaosAlignment,
        outcome: readout.outcome,
    };

    await this.actor.update({ 'system.daemonPrinceAscension': record });

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker takes WH40KBaseActor; our typed Actor subtype union is structurally compatible
    const speakerActor = this.actor as unknown as Parameters<typeof ChatMessage.getSpeaker>[0];
    // `_gameSystemId` is derived by the helper from the speaker's actor (#422).
    await emitChatFromTemplate(
        'systems/wh40k-rpg/templates/chat/bc-ascension-chat.hbs',
        {
            gameSystem: 'bc',
            ascendedAt: record.ascendedAt,
            alignmentAtAscension: record.alignmentAtAscension,
            isDaemonPrince: record.outcome === 'daemonPrince',
        },
        { speaker: ChatMessage.getSpeaker(speakerActor), applyWhispers: true },
    );
}
