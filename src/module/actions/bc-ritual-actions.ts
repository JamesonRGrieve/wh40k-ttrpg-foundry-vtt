/**
 * Black Crusade Chaos Ritual action handlers (#179).
 *
 * Exported static method `bcPerformRitual` is registered into the
 * character sheet's `DEFAULT_OPTIONS.actions` map by the orchestrator
 * via `.integration-staging/179.json`. It is invoked with `this` bound
 * to the sheet instance, so the structural contract here is the minimum
 * surface the handler reaches: an `actor` whose `system` carries the
 * `ritualMastery` field contributed by `bc-ritual-template.ts` and whose
 * `_gameSystemId` exposes the active game system so we can no-op for
 * non-BC actors.
 *
 * Flow:
 *
 *   1. Prompt the operator for a ritual template id + base d100 target
 *      and a stacked list of Table 6-7 modifiers via DialogV2. Concrete
 *      ritual catalogues live in compendiums (Direction #7); this dialog
 *      is the engine's input surface — the operator selects/types the
 *      template id and pulls the base target off the compendium document
 *      themselves.
 *   2. Compose the final target via `computeRitualTarget(...)`.
 *   3. Roll d100 (system RNG) and resolve via
 *      `resolveContemptOfTheWarp(...)`.
 *   4. Render the `bc-ritual-chat.hbs` partial and post the chat card.
 *
 * The handler does not persist any per-ritual state on the actor — only
 * the Daemonic Mastery rating is persisted via the panel input. The
 * per-test selections are dialog-scoped.
 */

import type { BcRitualDeclarations } from '../data/actor/mixins/bc-ritual-template.ts';
import { postChatCard, roll1d100 } from '../rolls/roll-helpers.ts';
import { computeRitualTarget, resolveContemptOfTheWarp, type RitualModifier, type RitualModifierKind, type RitualTemplate } from '../rules/bc-chaos-ritual.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/* -------------------------------------------- */
/*  Structural sheet contract                   */
/* -------------------------------------------- */

/**
 * Minimum surface the action handlers read off `this`. The character
 * sheet (which is what `this` is bound to at runtime) is a superset of
 * this shape; we keep the contract tight so the action module stays
 * uncoupled from the full sheet class.
 */
interface BcRitualSheetLike {
    actor: Actor & { readonly _gameSystemId?: string; readonly system: BcRitualDeclarations };
}

/* -------------------------------------------- */
/*  i18n key tables                             */
/* -------------------------------------------- */

const MODIFIER_KINDS: readonly RitualModifierKind[] = [
    'cult-affiliation',
    'sacrifice',
    'sanctified-ground',
    'component-reagent',
    'daemonic-mastery',
    'gm-other',
];

const MODIFIER_LABEL_KEYS: Record<RitualModifierKind, string> = {
    'cult-affiliation': 'WH40K.BC.Ritual.Modifier.CultAffiliation',
    'sacrifice': 'WH40K.BC.Ritual.Modifier.Sacrifice',
    'sanctified-ground': 'WH40K.BC.Ritual.Modifier.SanctifiedGround',
    'component-reagent': 'WH40K.BC.Ritual.Modifier.ComponentReagent',
    'daemonic-mastery': 'WH40K.BC.Ritual.Modifier.DaemonicMastery',
    'gm-other': 'WH40K.BC.Ritual.Modifier.GmOther',
};

/* -------------------------------------------- */
/*  Dialog                                      */
/* -------------------------------------------- */

interface BcRitualDialogResult {
    templateId: string;
    baseTarget: number;
    modifiers: readonly RitualModifier[];
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard accepts unknown to narrow external dialog form input
function isRitualModifierKind(value: unknown): value is RitualModifierKind {
    return typeof value === 'string' && (MODIFIER_KINDS as readonly string[]).includes(value);
}

/**
 * Read the operator's stacked modifier rows out of a DialogV2 form.
 * Each row is identified by its index on the `mod-kind-<n>` /
 * `mod-value-<n>` / `mod-description-<n>` field names; we walk in order
 * until a row is missing. Invalid kinds / non-finite values are dropped
 * silently rather than throwing — the dialog UI is the operator's
 * responsibility, not a hard contract.
 */
function readModifiersFromForm(form: HTMLFormElement | null): RitualModifier[] {
    if (form === null) return [];
    const modifiers: RitualModifier[] = [];
    for (let i = 0; i < 16; i += 1) {
        const kindEl = form.elements.namedItem(`mod-kind-${i}`);
        if (kindEl === null) break;
        const rawKind = (kindEl as HTMLSelectElement).value;
        if (!isRitualModifierKind(rawKind)) continue;
        const rawValue = Number((form.elements.namedItem(`mod-value-${i}`) as HTMLInputElement | null)?.value ?? 0);
        if (!Number.isFinite(rawValue)) continue;
        const rawDescription = ((form.elements.namedItem(`mod-description-${i}`) as HTMLInputElement | null)?.value ?? '').trim();
        modifiers.push({
            kind: rawKind,
            value: Math.trunc(rawValue),
            ...(rawDescription === '' ? {} : { description: rawDescription }),
        });
    }
    return modifiers;
}

/**
 * Prompt the operator for ritual template id + base target + a list of
 * stacked Table 6-7 modifiers. Returns null if the dialog API is
 * unavailable (storybook / probe) or the operator cancels.
 *
 * The dialog renders three pre-allocated modifier rows; operators wire
 * additional rows through the freeform `Other Adjustment` row, which is
 * how RAW Table 6-7 is meant to be used (the explicit five rows + one
 * GM catch-all).
 */
async function promptBcRitualInputs(args: { initialMastery: number }): Promise<BcRitualDialogResult | null> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi) return null;

    const i18n = game.i18n;
    const templateIdLabel = i18n.localize('WH40K.BC.Ritual.DialogTemplateId');
    const baseTargetLabel = i18n.localize('WH40K.BC.Ritual.DialogBaseTarget');
    const modifiersHeader = i18n.localize('WH40K.BC.Ritual.DialogModifiersHeader');
    const kindLabel = i18n.localize('WH40K.BC.Ritual.DialogModifierKind');
    const valueLabel = i18n.localize('WH40K.BC.Ritual.DialogModifierValue');
    const descriptionLabel = i18n.localize('WH40K.BC.Ritual.DialogModifierDescription');

    const modifierRow = (index: number, defaultKind: RitualModifierKind, defaultValue: number): string => `
        <div class="form-group" data-mod-row="${index}">
            <label>${kindLabel}</label>
            <select name="mod-kind-${index}">
                ${MODIFIER_KINDS.map(
                    (kind) => `<option value="${kind}" ${kind === defaultKind ? 'selected' : ''}>${i18n.localize(MODIFIER_LABEL_KEYS[kind])}</option>`,
                ).join('')}
            </select>
            <label>${valueLabel}</label>
            <input type="number" name="mod-value-${index}" step="1" value="${defaultValue}" />
            <label>${descriptionLabel}</label>
            <input type="text" name="mod-description-${index}" value="" />
        </div>
    `;

    const content = `
        <div class="form-group">
            <label>${templateIdLabel}</label>
            <input type="text" name="templateId" value="" />
        </div>
        <div class="form-group">
            <label>${baseTargetLabel}</label>
            <input type="number" name="baseTarget" min="0" step="1" value="30" />
        </div>
        <h3>${modifiersHeader}</h3>
        ${modifierRow(0, 'cult-affiliation', 0)}
        ${modifierRow(1, 'sacrifice', 0)}
        ${modifierRow(2, 'daemonic-mastery', args.initialMastery)}
        ${modifierRow(3, 'gm-other', 0)}
    `;

    // DialogV2.prompt resolves to the ok.callback return value OR null on close;
    // Foundry's typing collapses both to unknown. Accept the looser shape at
    // the boundary and narrow defensively below.
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt resolves to callback return OR null on close; narrowed via shape guards below
    const result = (await dialogApi.prompt({
        window: { title: 'WH40K.BC.Ritual.DialogTitle' },
        content,
        ok: {
            label: 'WH40K.BC.Ritual.DialogSubmit',
            callback: (_evt: Event, button: HTMLButtonElement): BcRitualDialogResult => {
                const form = button.form ?? null;
                const cbRawTemplateId = ((form?.elements.namedItem('templateId') as HTMLInputElement | null)?.value ?? '').trim();
                const cbRawBaseTarget = Number((form?.elements.namedItem('baseTarget') as HTMLInputElement | null)?.value ?? 0);
                const cbBaseTarget = Number.isFinite(cbRawBaseTarget) ? Math.max(0, Math.trunc(cbRawBaseTarget)) : 0;
                const cbModifiers = readModifiersFromForm(form);
                return {
                    templateId: cbRawTemplateId === '' ? 'unnamed-ritual' : cbRawTemplateId,
                    baseTarget: cbBaseTarget,
                    modifiers: cbModifiers,
                };
            },
        },
        rejectClose: false,
    })) as Partial<BcRitualDialogResult> | null | undefined;

    if (result === null || result === undefined) return null;
    const shape: Partial<BcRitualDialogResult> = result;
    const rawTemplateId = shape.templateId;
    const templateId = typeof rawTemplateId === 'string' && rawTemplateId !== '' ? rawTemplateId : 'unnamed-ritual';
    const baseTarget = typeof shape.baseTarget === 'number' && Number.isFinite(shape.baseTarget) ? Math.max(0, Math.trunc(shape.baseTarget)) : 0;
    const modifiers: readonly RitualModifier[] = Array.isArray(shape.modifiers) ? shape.modifiers : [];
    return { templateId, baseTarget, modifiers };
}

/* -------------------------------------------- */
/*  Chat row shaping                            */
/* -------------------------------------------- */

interface RitualBreakdownRow {
    readonly kind: RitualModifierKind;
    readonly labelKey: string;
    readonly signed: string;
    readonly positive: boolean;
    readonly negative: boolean;
    readonly description?: string;
}

function shapeBreakdown(modifiers: readonly RitualModifier[]): RitualBreakdownRow[] {
    return modifiers.map((m) => ({
        kind: m.kind,
        labelKey: MODIFIER_LABEL_KEYS[m.kind],
        signed: m.value > 0 ? `+${m.value}` : `${m.value}`,
        positive: m.value > 0,
        negative: m.value < 0,
        ...(m.description === undefined ? {} : { description: m.description }),
    }));
}

/* -------------------------------------------- */
/*  Action handler                              */
/* -------------------------------------------- */

/**
 * `data-action="bcPerformRitual"` handler. Opens the ritual dialog,
 * composes the final target, rolls a d100, and posts a chat card with
 * the modifier breakdown and Contempt-of-the-Warp outcome.
 *
 * No-op for non-BC actors so a stale wiring on a homologated sheet
 * doesn't surprise the GM with a Chaos Ritual prompt on (e.g.) a DH2
 * character.
 */
export async function bcPerformRitual(this: BcRitualSheetLike, _event: Event, _target: HTMLElement): Promise<void> {
    if (this.actor._gameSystemId !== 'bc') return;

    const initialMastery = this.actor.system.ritualMastery;

    const inputs = await promptBcRitualInputs({ initialMastery });
    if (inputs === null) return;

    const template: RitualTemplate = {
        id: inputs.templateId,
        description: '',
        requirements: '',
        effects: '',
        duration: '',
        cost: '',
        priceOfFailure: '',
        baseTarget: inputs.baseTarget,
    };

    const composed = computeRitualTarget({ template, modifiers: inputs.modifiers });
    const modifierSum = composed.breakdown.reduce((acc, m) => acc + m.value, 0);

    // Roll d100 via Foundry's Roll API so the result lands in the
    // dice-so-nice / chat-roll plumbing the rest of the system uses.
    const roll = await roll1d100();
    const rolled = Math.trunc(roll.total ?? 0);

    const outcome = resolveContemptOfTheWarp({ target: composed.target, roll: rolled });

    const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/bc-ritual-chat.hbs', {
        gameSystem: 'bc',
        _gameSystemId: firstSystemId(this.actor),
        templateId: inputs.templateId,
        baseTarget: inputs.baseTarget,
        modifierSum,
        finalTarget: composed.target,
        roll: rolled,
        success: outcome.success,
        degreesOfSuccess: outcome.degreesOfSuccess,
        degreesOfFailure: outcome.degreesOfFailure,
        breakdown: shapeBreakdown(composed.breakdown),
    });

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.getSpeaker takes WH40KBaseActor; our typed Actor subtype union is structurally compatible
    const speakerActor = this.actor as unknown as Parameters<typeof ChatMessage.getSpeaker>[0];
    await postChatCard(content, { speaker: ChatMessage.getSpeaker(speakerActor), rolls: [roll] });
}
