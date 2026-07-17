/**
 * Black Crusade Psychic Test action handlers (#178).
 *
 * Exported static method `bcPsychicTest` is registered into the
 * character sheet's `DEFAULT_OPTIONS.actions` map by the orchestrator
 * via `.integration-staging/178.json`. It is invoked with `this` bound
 * to the sheet instance, so the structural contract here is the minimum
 * surface the handler reaches: an `actor` whose `system` carries the
 * fields contributed by `bc-psychic-template.ts` (psyker class, base
 * PR, sustained-power count) and whose `_gameSystemId` exposes the
 * active game system so we can no-op for non-BC actors.
 *
 * Flow:
 *
 *   1. Read base inputs off `actor.system`.
 *   2. Prompt the operator for Mode + Push Level via DialogV2.
 *   3. Call the pure resolver `resolvePsychicTest(...)` from
 *      `../rules/bc-psychic-strength.ts`.
 *   4. Render the `bc-psychic-test-chat.hbs` partial and post the chat
 *      card.
 *
 * No actor mutation: the persisted state on the DataModel is the
 * authoritative source, and the per-test mode / push level are
 * dialog-scoped (not persisted), so the action is read-only against the
 * actor.
 */

import type { BcPsychicDeclarations } from '../data/actor/mixins/bc-psychic-template.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { maxPushLevel, resolvePsychicTest, type PsyMode, type PsykerClass } from '../rules/bc-psychic-strength.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/* -------------------------------------------- */
/*  Structural sheet contract                   */
/* -------------------------------------------- */

/**
 * Minimum surface the action handlers read off `this`. The character
 * sheet (which is what `this` is bound to at runtime) is a superset of
 * this shape; we keep the contract tight so the action module stays
 * uncoupled from the full sheet class.
 *
 * `actor` is typed as a Foundry Actor narrowed to the BC psychic
 * DataModel fields contributed by `bc-psychic-template.ts`. The
 * intersection lets us hand `this.actor` directly to
 * `ChatMessage.getSpeaker(...)` without a `Record`-cast escape hatch.
 */
interface BcPsychicSheetLike {
    actor: Actor & { readonly _gameSystemId?: string; readonly system: BcPsychicDeclarations };
}

/* -------------------------------------------- */
/*  i18n key tables                             */
/* -------------------------------------------- */

const CLASS_LABEL_KEYS: Record<PsykerClass, string> = {
    bound: 'WH40K.BC.Psychic.Class.Bound',
    unbound: 'WH40K.BC.Psychic.Class.Unbound',
    daemonic: 'WH40K.BC.Psychic.Class.Daemonic',
};

const MODE_LABEL_KEYS: Record<PsyMode, string> = {
    fettered: 'WH40K.BC.Psychic.Mode.Fettered',
    unfettered: 'WH40K.BC.Psychic.Mode.Unfettered',
    push: 'WH40K.BC.Psychic.Mode.Push',
};

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

interface BcPsychicDialogResult {
    mode: PsyMode;
    pushLevel: number;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard implementation; `unknown` is the canonical guard input
function isPsyMode(value: unknown): value is PsyMode {
    return value === 'fettered' || value === 'unfettered' || value === 'push';
}

/**
 * Prompt the operator for Mode + Push Level. The form is built as a
 * plain HTML string per the existing DialogV2 patterns in
 * `character-sheet.ts`; we read back the values via `button.form`
 * accessors so the surface stays compatible with the live runtime.
 */
async function promptBcPsychicTestInputs(args: {
    psykerClass: PsykerClass;
    initialMode: PsyMode;
    initialPushLevel: number;
}): Promise<BcPsychicDialogResult | null> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi) return null;

    const ceiling = maxPushLevel(args.psykerClass);
    const clampedInitialPush = Math.max(0, Math.min(args.initialPushLevel, ceiling));

    const i18n = game.i18n;
    const modeLabel = i18n.localize('WH40K.BC.Psychic.ModeLabel');
    const pushLabel = i18n.localize('WH40K.BC.Psychic.Push.Level');
    const fetteredLabel = i18n.localize(MODE_LABEL_KEYS.fettered);
    const unfetteredLabel = i18n.localize(MODE_LABEL_KEYS.unfettered);
    const pushModeLabel = i18n.localize(MODE_LABEL_KEYS.push);

    const content = `
        <div class="form-group">
            <label>${modeLabel}</label>
            <select name="mode">
                <option value="fettered" ${args.initialMode === 'fettered' ? 'selected' : ''}>${fetteredLabel}</option>
                <option value="unfettered" ${args.initialMode === 'unfettered' ? 'selected' : ''}>${unfetteredLabel}</option>
                <option value="push" ${args.initialMode === 'push' ? 'selected' : ''}>${pushModeLabel}</option>
            </select>
        </div>
        <div class="form-group">
            <label>${pushLabel} (0..${ceiling})</label>
            <input type="number" name="pushLevel" min="0" max="${ceiling}" step="1" value="${clampedInitialPush}" />
        </div>
    `;

    // DialogV2.prompt returns the ok.callback's return value or null when the
    // dialog is closed without confirming. Foundry's type lies that it always
    // resolves to the callback return; we accept the looser shape at the
    // boundary and narrow defensively below.
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt resolves to callback return OR null on close; narrowed below
    const result = (await dialogApi.prompt({
        window: { title: 'WH40K.BC.Psychic.DialogTitle' },
        content,
        ok: {
            label: 'WH40K.BC.Psychic.DialogSubmit',
            callback: (_evt: Event, button: HTMLButtonElement): BcPsychicDialogResult => {
                const form = button.form ?? null;
                const rawMode = (form?.elements.namedItem('mode') as HTMLSelectElement | null)?.value;
                const rawPush = Number((form?.elements.namedItem('pushLevel') as HTMLInputElement | null)?.value ?? 0);
                const mode: PsyMode = isPsyMode(rawMode) ? rawMode : 'unfettered';
                const clampedPush = Number.isFinite(rawPush) ? Math.max(0, Math.trunc(rawPush)) : 0;
                return { mode, pushLevel: clampedPush };
            },
        },
        rejectClose: false,
    })) as BcPsychicDialogResult | null | undefined;

    if (result === null || result === undefined) return null;
    const shape: BcPsychicDialogResult = result;
    if (!isPsyMode(shape.mode)) return { mode: 'unfettered', pushLevel: 0 };
    const pushLevel = Number.isFinite(shape.pushLevel) ? Math.max(0, Math.trunc(shape.pushLevel)) : 0;
    return { mode: shape.mode, pushLevel };
}

/* -------------------------------------------- */
/*  Action handler                              */
/* -------------------------------------------- */

/**
 * `data-action="bcPsychicTest"` handler. Opens the Mode + Push Level
 * dialog, resolves the test via the pure engine, and posts a chat card.
 *
 * No-op for non-BC actors so a stale wiring on a homologated sheet
 * doesn't surprise the GM with a Psychic Test prompt on (e.g.) a DH2
 * character.
 */
export async function bcPsychicTest(this: BcPsychicSheetLike, _event: Event, _target: HTMLElement): Promise<void> {
    if (this.actor._gameSystemId !== 'bc') return;

    const system = this.actor.system;
    const psykerClass = system.psykerClass;
    const basePR = system.psyRating;
    const sustainedPowerCount = system.sustainedPowerCount;

    const inputs = await promptBcPsychicTestInputs({
        psykerClass,
        initialMode: 'unfettered',
        initialPushLevel: 0,
    });
    if (inputs === null) return;

    const resolved = resolvePsychicTest({
        psykerClass,
        mode: inputs.mode,
        basePR,
        pushLevel: inputs.pushLevel,
        sustainedPowerCount,
    });

    const clampedPushLevel = inputs.mode === 'push' ? Math.min(Math.max(0, inputs.pushLevel), maxPushLevel(psykerClass)) : 0;

    const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/bc-psychic-test-chat.hbs', {
        gameSystem: 'bc',
        _gameSystemId: firstSystemId(this.actor),
        psykerClass,
        mode: inputs.mode,
        classLabelKey: CLASS_LABEL_KEYS[psykerClass],
        modeLabelKey: MODE_LABEL_KEYS[inputs.mode],
        basePR,
        pushLevel: clampedPushLevel,
        maxPushLevel: maxPushLevel(psykerClass),
        showPushLevel: inputs.mode === 'push',
        effectivePR: resolved.effectivePR,
        sustainPenalty: resolved.sustainPenalty,
        phenomenaRolls: resolved.phenomenaRolls,
    });

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker takes WH40KBaseActor; our typed Actor subtype union is structurally compatible
    const speakerActor = this.actor as unknown as Parameters<typeof ChatMessage.getSpeaker>[0];
    await postChatCard(content, { speaker: ChatMessage.getSpeaker(speakerActor) });
}
