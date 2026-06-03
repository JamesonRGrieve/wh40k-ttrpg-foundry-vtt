/**
 * Only War Regimental-Drawback + Multiple-Comrade action handlers
 * (#160 — hammer.md §"REGIMENTAL DRAWBACKS" line 1150,
 *         §"Comrade Advances / Multiple Comrades" lines 1677, 1713).
 *
 * Three sheet-action methods wired into the character-sheet action map:
 *
 *   - `owToggleDrawback` — flip a single Regimental Drawback id into or
 *                          out of `system.regimentDrawbacks`. The button
 *                          dataset (`data-drawback-id`) selects which
 *                          entry to toggle; absent/empty ids are a
 *                          defence-in-depth no-op.
 *   - `owAddComrade`     — append a new Comrade id to the Multiple
 *                          Comrades roster. If no roster exists yet the
 *                          handler bootstraps one using the actor's
 *                          existing primary Comrade name as the primary
 *                          slot (so the first "add" promotes the RAW
 *                          single Comrade into an explicit roster + one
 *                          additional). Uses the engine's `addComrade`
 *                          to enforce dedupe.
 *   - `owRemoveComrade`  — remove a Comrade id from the roster, routed
 *                          through the engine's `removeComrade` so the
 *                          primary promotion / no-op semantics are
 *                          consistent. When the roster collapses back
 *                          to its RAW single-Comrade default the slot
 *                          is set to `null`.
 *
 * Handlers are exported as `this`-typed free functions; the Foundry V14
 * ApplicationV2 action map binds `this` to the sheet instance at click
 * time, so the character sheet wires them like:
 *
 *     import * as OwDrawbackActions from '../../actions/ow-drawback-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             owToggleDrawback: OwDrawbackActions.owToggleDrawback,
 *             owAddComrade:     OwDrawbackActions.owAddComrade,
 *             owRemoveComrade:  OwDrawbackActions.owRemoveComrade,
 *         },
 *     };
 *
 * Strong-typed throughout; no Record casts on `system` (the
 * `OwDrawbackDeclarations` interface is spliced onto CharacterData
 * via the orchestrator's `declare` block).
 */

import type { OwMultiComradeRosterData } from '../data/actor/mixins/ow-drawback-template.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { addComrade, type MultiComradeRoster, removeComrade } from '../rules/ow-regiment-drawback.ts';

/**
 * Subset of the OW actor `system` shape the drawback handlers read.
 * The full DataModel is wider; declaring only the fields we touch keeps
 * the handler decoupled from CharacterData and matches the pattern
 * used by `ow-vehicle-actions.ts`. The `comrade.name` slot (owned by
 * #152's mixin) is consulted when bootstrapping the multi-Comrade
 * roster so the first additional preserves the RAW single Comrade.
 */
interface OwDrawbackActorSystem {
    regimentDrawbacks: string[];
    multiComradeRoster: OwMultiComradeRosterData | null;
    comrade: {
        name: string;
    };
}

interface OwDrawbackHost {
    actor: WH40KBaseActor & { system: OwDrawbackActorSystem };
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards arbitrary system-field values to Foundry's Document.update() via the sheet helper
    _updateSystemField: (field: string, value: unknown) => Promise<void>;
}

type Host = OwDrawbackHost;

/* -------------------------------------------------------------------- */
/*  Roster shape conversion                                             */
/* -------------------------------------------------------------------- */

/**
 * Pure-engine roster ↔ persisted slot conversion. The engine's
 * {@link MultiComradeRoster} uses `ReadonlyArray`; the persisted
 * {@link OwMultiComradeRosterData} uses a mutable array (Foundry's
 * `ArrayField` materialises mutable arrays). The conversions are
 * structurally trivial — the cast is one-way and isolated here so the
 * action handlers stay typed against the named shapes.
 */
function toEngineRoster(roster: OwMultiComradeRosterData): MultiComradeRoster {
    return { primaryId: roster.primaryId, additionalIds: roster.additionalIds };
}

function fromEngineRoster(roster: MultiComradeRoster): OwMultiComradeRosterData {
    return { primaryId: roster.primaryId, additionalIds: [...roster.additionalIds] };
}

/* -------------------------------------------------------------------- */
/*  Prompt for a new Comrade id                                         */
/* -------------------------------------------------------------------- */

interface ComradeIdPromptResult {
    comradeId: string;
}

/**
 * Best-effort prompt asking the operator for the id of a Comrade to
 * add to the roster. Returns the trimmed id, or `null` if the operator
 * cancelled / the dialog API is unavailable in this environment (Tier-A
 * jsdom boot, headless tests). The id is an opaque string — by
 * convention it is the Foundry document id of the Comrade actor.
 */
async function promptComradeId(): Promise<string | null> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi?.prompt) {
        return null;
    }
    const title = game.i18n.localize('WH40K.OW.RegimentDrawback.MultiComrade.Title');
    const label = game.i18n.localize('WH40K.OW.RegimentDrawback.MultiComrade.Additional');
    const content = `
        <fieldset>
            <legend>${title}</legend>
            <div class="form-group">
                <label for="ow-drawback-comrade-id">${label}</label>
                <input type="text" name="comradeId" id="ow-drawback-comrade-id" value="" />
            </div>
        </fieldset>
    `;
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt returns unknown; narrow via shape guards below
    const raw = (await dialogApi.prompt({
        window: { title },
        content,
        ok: {
            callback: (_evt: Event, button: HTMLButtonElement) => {
                const form = button.form;
                const input = form?.elements.namedItem('comradeId');
                if (input instanceof HTMLInputElement) {
                    return { comradeId: input.value.trim() };
                }
                return { comradeId: '' };
            },
        },
        rejectClose: false,
    })) as ComradeIdPromptResult | null | undefined;
    if (raw == null) return null;
    return typeof raw.comradeId === 'string' && raw.comradeId !== '' ? raw.comradeId : null;
}

/* -------------------------------------------------------------------- */
/*  owToggleDrawback — flip a single drawback id in/out of the list     */
/* -------------------------------------------------------------------- */

/**
 * Toggle one Regimental Drawback id on or off in
 * `system.regimentDrawbacks`.
 *
 * Wired to `data-action="owToggleDrawback"`. The button dataset must
 * carry `data-drawback-id="<id>"`. The handler never throws on missing
 * dataset entries — empty / undefined ids are a no-op.
 */
export async function owToggleDrawback(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const id = target.dataset['drawbackId'] ?? '';
    if (id === '') return;
    const current = this.actor.system.regimentDrawbacks;
    const idx = current.indexOf(id);
    const next = idx === -1 ? [...current, id] : current.filter((entry) => entry !== id);
    await this._updateSystemField('system.regimentDrawbacks', next);
}

/* -------------------------------------------------------------------- */
/*  owAddComrade — extend the Multiple Comrades roster                  */
/* -------------------------------------------------------------------- */

/**
 * Append a new Comrade id to the Multiple Comrades roster.
 *
 * Wired to `data-action="owAddComrade"`. The button may pass an id
 * directly via `data-comrade-id`; if absent the handler prompts the
 * operator for one. When `system.multiComradeRoster` is `null` (RAW
 * single-Comrade default) the handler bootstraps a new roster using
 * the actor's existing `comrade.name` as the primary slot and the new
 * id as the first additional — so the first add promotes the RAW
 * Comrade into an explicit roster rather than discarding it.
 *
 * The engine's {@link addComrade} enforces dedupe: re-adding an
 * existing id is a no-op.
 */
export async function owAddComrade(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    let id = target.dataset['comradeId'] ?? '';
    if (id === '') {
        const prompted = await promptComradeId();
        if (prompted === null) return;
        id = prompted;
    }
    if (id === '') return;

    const current = this.actor.system.multiComradeRoster;
    let nextRoster: OwMultiComradeRosterData;
    if (current === null) {
        const primary = this.actor.system.comrade.name !== '' ? this.actor.system.comrade.name : id;
        // Bootstrap: promote the RAW single Comrade into the roster.
        // If the new id equals the primary's bootstrap name, addComrade
        // will dedupe and leave additionals empty — which is the right
        // outcome (the operator added the same Comrade twice).
        const bootstrap: MultiComradeRoster = { primaryId: primary, additionalIds: [] };
        nextRoster = fromEngineRoster(addComrade(bootstrap, id));
    } else {
        nextRoster = fromEngineRoster(addComrade(toEngineRoster(current), id));
    }
    await this._updateSystemField('system.multiComradeRoster', nextRoster);
}

/* -------------------------------------------------------------------- */
/*  owRemoveComrade — pull a Comrade id out of the roster               */
/* -------------------------------------------------------------------- */

/**
 * Remove a Comrade id from the Multiple Comrades roster.
 *
 * Wired to `data-action="owRemoveComrade"`. The button dataset carries
 * `data-comrade-id="<id>"`. When the removal would collapse the roster
 * back to a single Comrade (primary + zero additionals AND the removed
 * id was the primary), the slot is cleared back to `null` — the RAW
 * default is the absence of a roster, not an empty one.
 *
 * The engine's {@link removeComrade} enforces the no-op contract: an
 * unknown id, or removal of the primary with no additionals to promote,
 * is a no-op (and the slot is left untouched).
 */
export async function owRemoveComrade(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const id = target.dataset['comradeId'] ?? '';
    if (id === '') return;
    const current = this.actor.system.multiComradeRoster;
    if (current === null) return;
    const next = removeComrade(toEngineRoster(current), id);
    // Identity-by-shape: a no-op returns the same engine roster object.
    // Cheaply detect that by comparing id + length.
    const unchanged = next.primaryId === current.primaryId && next.additionalIds.length === current.additionalIds.length;
    if (unchanged) return;
    // When the only thing left is the primary, the RAW representation
    // is "no roster" — clear the slot rather than leaving a degenerate
    // single-entry object.
    if (next.additionalIds.length === 0) {
        await this._updateSystemField('system.multiComradeRoster', null);
        return;
    }
    await this._updateSystemField('system.multiComradeRoster', fromEngineRoster(next));
}
