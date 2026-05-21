/**
 * Deathwatch Requisition action handlers (#165 — core.md §"REQUISITION").
 *
 * Two `data-action="…"` entries are registered by the character sheet and
 * delegated here:
 *
 *   - `dwRequisitionItem` → single-Battle-Brother requisition. Opens a
 *     DialogV2 prompt collecting the item name, base RP cost, the
 *     craftsmanship tier (TABLE 5-3 multiplier), and the item's required
 *     Renown rank. Runs `canActorRequisition` to gate the spend, then
 *     decrements `system.requisitionPoints` and emits a chat card.
 *   - `dwRequisitionPool` → multi-Brother pooled requisition. Opens a
 *     DialogV2 prompt collecting the item details + one row per active
 *     DW kill-team member with their pledged RP. Runs
 *     `canPoolRequisition`, then debits each contributor in a single
 *     batched update and emits a pooled chat card.
 *
 * Both methods accept the minimal `{ actor }` `this` shape so the
 * character sheet can bind them as ApplicationV2 actions without
 * exposing further sheet internals. The actor parameter carries
 * `system.requisitionPoints`, `system.renown`, and `system.missionRating`
 * from the `dw-requisition-template` mixin.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { canRequisition, type RenownRank } from '../rules/dw-renown.ts';
import { type Craftsmanship, type PooledContribution, canActorRequisition, canPoolRequisition, computeItemCost } from '../rules/dw-requisition.ts';

/** Minimal action-handler `this` binding. The character sheet supplies a richer shape; only `actor` is consumed. */
export interface DwRequisitionActionContext {
    readonly actor: WH40KBaseActor;
}

/** Shape of the system data slice the requisition path reads off a DW actor. */
interface DwActorSystemSlice {
    requisitionPoints: number;
    renown?: number;
    missionRating?: string;
    name?: string;
}

const CRAFTSMANSHIP_KEYS: readonly Craftsmanship[] = ['poor', 'common', 'good', 'best'];
const RENOWN_RANKS: readonly RenownRank[] = ['initiated', 'respected', 'distinguished', 'famed', 'hero'];

function isCraftsmanship(value: string | undefined): value is Craftsmanship {
    return value !== undefined && (CRAFTSMANSHIP_KEYS as readonly string[]).includes(value);
}

function isRenownRank(value: string | undefined): value is RenownRank {
    return value !== undefined && (RENOWN_RANKS as readonly string[]).includes(value);
}

/** Read the typed slice off a DW actor. */
function dwSystem(actor: WH40KBaseActor): DwActorSystemSlice {
    // eslint-disable-next-line no-restricted-syntax -- boundary: DW system slice is not exposed on the abstract WH40KBaseActor.system surface (mixin contributes fields to per-system DataModels only)
    return actor.system as unknown as DwActorSystemSlice;
}

/** Resolve the DialogV2 constructor from the V14 untyped namespace. */
function resolveDialogV2(): typeof foundry.applications.api.DialogV2 | undefined {
    return (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
}

interface RequisitionItemPromptResult {
    itemName: string;
    baseCost: number;
    craftsmanship: Craftsmanship;
    requiredRank: RenownRank;
}

interface PoolPromptResult {
    itemName: string;
    baseCost: number;
    craftsmanship: Craftsmanship;
    requiredRank: RenownRank;
    holderRp: number;
    poolRp: number;
}

/**
 * Open the single-Brother requisition prompt. Returns `null` if the GM /
 * player cancels the dialog. The shape mirrors the form fields below so
 * the action handler can destructure with strong typing.
 */
async function promptItemDetails(): Promise<RequisitionItemPromptResult | null> {
    const DialogV2 = resolveDialogV2();
    if (!DialogV2) return null;
    const result = await DialogV2.prompt({
        window: { title: 'WH40K.DW.Requisition.RequestItemButton' },
        content: `
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.ItemName')}</label>
                <input type="text" name="itemName" value="" />
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.BaseCost')}</label>
                <input type="number" name="baseCost" value="10" min="0" step="1" />
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.Craftsmanship')}</label>
                <select name="craftsmanship">
                    <option value="poor">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Poor')}</option>
                    <option value="common" selected>${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Common')}</option>
                    <option value="good">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Good')}</option>
                    <option value="best">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Best')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.RequiredRank')}</label>
                <select name="requiredRank">
                    <option value="initiated" selected>Initiated</option>
                    <option value="respected">Respected</option>
                    <option value="distinguished">Distinguished</option>
                    <option value="famed">Famed</option>
                    <option value="hero">Hero</option>
                </select>
            </div>
        `,
        ok: {
            label: 'WH40K.DW.Requisition.RequestItemButton',
            callback: (_evt: Event, button: HTMLButtonElement) => {
                const form = button.form;
                if (!form) return null;
                const itemName = String((form.elements.namedItem('itemName') as HTMLInputElement | null)?.value ?? '').trim();
                const baseCost = Number((form.elements.namedItem('baseCost') as HTMLInputElement | null)?.value ?? 0);
                const craftsmanship = (form.elements.namedItem('craftsmanship') as HTMLSelectElement | null)?.value;
                const requiredRank = (form.elements.namedItem('requiredRank') as HTMLSelectElement | null)?.value;
                if (!isCraftsmanship(craftsmanship) || !isRenownRank(requiredRank)) return null;
                return { itemName, baseCost, craftsmanship, requiredRank };
            },
        },
        rejectClose: false,
    });
    if (result === null || result === undefined) return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 prompt return is typed as unknown; the callback above narrows the shape
    return result as unknown as RequisitionItemPromptResult;
}

/**
 * Open the pooled-requisition prompt. The contributing roster is
 * collected as `holderRp` (the requisitioning Brother's pledge) +
 * `poolRp` (sum of all other Brothers' pledges). The UI surface is
 * intentionally simple — full per-Brother itemisation belongs in a
 * follow-up prompt once kill-team membership is modelled.
 */
async function promptPoolDetails(): Promise<PoolPromptResult | null> {
    const DialogV2 = resolveDialogV2();
    if (!DialogV2) return null;
    const result = await DialogV2.prompt({
        window: { title: 'WH40K.DW.Requisition.Pool.Title' },
        content: `
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.ItemName')}</label>
                <input type="text" name="itemName" value="" />
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.BaseCost')}</label>
                <input type="number" name="baseCost" value="30" min="0" step="1" />
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.Craftsmanship')}</label>
                <select name="craftsmanship">
                    <option value="poor">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Poor')}</option>
                    <option value="common" selected>${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Common')}</option>
                    <option value="good">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Good')}</option>
                    <option value="best">${game.i18n.localize('WH40K.DW.Requisition.Craftsmanship.Best')}</option>
                </select>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.RequiredRank')}</label>
                <select name="requiredRank">
                    <option value="initiated" selected>Initiated</option>
                    <option value="respected">Respected</option>
                    <option value="distinguished">Distinguished</option>
                    <option value="famed">Famed</option>
                    <option value="hero">Hero</option>
                </select>
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.HolderRp')}</label>
                <input type="number" name="holderRp" value="0" min="0" step="1" />
            </div>
            <div class="form-group">
                <label>${game.i18n.localize('WH40K.DW.Requisition.Form.PoolRp')}</label>
                <input type="number" name="poolRp" value="0" min="0" step="1" />
            </div>
        `,
        ok: {
            label: 'WH40K.DW.Requisition.Pool.Title',
            callback: (_evt: Event, button: HTMLButtonElement) => {
                const form = button.form;
                if (!form) return null;
                const itemName = String((form.elements.namedItem('itemName') as HTMLInputElement | null)?.value ?? '').trim();
                const baseCost = Number((form.elements.namedItem('baseCost') as HTMLInputElement | null)?.value ?? 0);
                const craftsmanship = (form.elements.namedItem('craftsmanship') as HTMLSelectElement | null)?.value;
                const requiredRank = (form.elements.namedItem('requiredRank') as HTMLSelectElement | null)?.value;
                const holderRp = Number((form.elements.namedItem('holderRp') as HTMLInputElement | null)?.value ?? 0);
                const poolRp = Number((form.elements.namedItem('poolRp') as HTMLInputElement | null)?.value ?? 0);
                if (!isCraftsmanship(craftsmanship) || !isRenownRank(requiredRank)) return null;
                return { itemName, baseCost, craftsmanship, requiredRank, holderRp, poolRp };
            },
        },
        rejectClose: false,
    });
    if (result === null || result === undefined) return null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2 prompt return is typed as unknown; the callback above narrows the shape
    return result as unknown as PoolPromptResult;
}

/**
 * Emit the requisition chat card. Renders the shared chat partial via
 * the V14 handlebars helper and creates a ChatMessage in the speaker's
 * voice. Failures (template missing, ChatMessage.create rejected) are
 * logged but do not throw — the actor's RP spend already happened.
 */
async function emitChatCard(
    actor: WH40KBaseActor,
    payload: {
        mode: 'item' | 'pool';
        itemName: string;
        craftsmanship: Craftsmanship;
        baseCost: number;
        itemCost: number;
        rpAfter: number;
        contributions?: ReadonlyArray<{ brotherName: string; rp: number }>;
        totalContributed?: number;
    },
): Promise<void> {
    const craftsmanshipKey = `WH40K.DW.Requisition.Craftsmanship.${payload.craftsmanship.charAt(0).toUpperCase()}${payload.craftsmanship.slice(1)}`;
    const templateData = {
        gameSystem: 'dw' as const,
        mode: payload.mode,
        actorName: actor.name,
        itemName: payload.itemName,
        craftsmanshipKey,
        baseCost: payload.baseCost,
        itemCost: payload.itemCost,
        rpAfter: payload.rpAfter,
        contributions: payload.contributions ?? [],
        totalContributed: payload.totalContributed ?? 0,
    };
    try {
        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/dw-requisition-chat.hbs', templateData);
        const messageData = { user: game.user.id, speaker: ChatMessage.getSpeaker({ actor }), content: html };
        // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
        const messagePayload = messageData as unknown as Parameters<typeof ChatMessage.create>[0];
        await ChatMessage.create(messagePayload);
    } catch (error) {
        console.error('DW requisition chat-card emission failed:', error);
    }
}

function notify(kind: 'info' | 'warn' | 'error', key: string, replacements?: Record<string, string | number>): void {
    const stringified: Record<string, string> | undefined =
        replacements === undefined ? undefined : Object.fromEntries(Object.entries(replacements).map(([k, v]) => [k, String(v)]));
    const message = stringified === undefined ? game.i18n.localize(key) : game.i18n.format(key, stringified);
    if (kind === 'info') ui.notifications.info(message);
    else if (kind === 'warn') ui.notifications.warn(message);
    else ui.notifications.error(message);
}

/**
 * `data-action="dwRequisitionItem"` handler — single-Brother requisition.
 *
 * Flow:
 *   1. Prompt for item + craftsmanship + required rank.
 *   2. Compute final cost via the craftsmanship multiplier.
 *   3. Gate through `canActorRequisition` (rank + RP).
 *   4. Decrement `system.requisitionPoints`; emit chat card.
 */
export async function dwRequisitionItem(this: DwRequisitionActionContext, _event: Event, _target: HTMLElement): Promise<void> {
    const actor = this.actor;
    const slice = dwSystem(actor);
    const prompt = await promptItemDetails();
    if (prompt === null) return;
    if (!Number.isFinite(prompt.baseCost) || prompt.baseCost < 0 || prompt.itemName === '') {
        notify('warn', 'WH40K.DW.Requisition.Validation.InvalidInput');
        return;
    }
    const itemCost = computeItemCost(prompt.baseCost, prompt.craftsmanship);
    const decision = canActorRequisition({
        actorRenown: slice.renown ?? 0,
        itemRequiredRank: prompt.requiredRank,
        actorRp: slice.requisitionPoints,
        itemCost,
    });
    if (!decision.allowed) {
        const key = decision.reason === 'rank-too-low' ? 'WH40K.DW.Requisition.Validation.RankTooLow' : 'WH40K.DW.Requisition.Validation.InsufficientRp';
        notify('warn', key);
        return;
    }
    const rpAfter = slice.requisitionPoints - itemCost;
    await actor.update({ 'system.requisitionPoints': rpAfter });
    await emitChatCard(actor, {
        mode: 'item',
        itemName: prompt.itemName,
        craftsmanship: prompt.craftsmanship,
        baseCost: prompt.baseCost,
        itemCost,
        rpAfter,
    });
}

/**
 * `data-action="dwRequisitionPool"` handler — pooled requisition.
 *
 * Flow:
 *   1. Prompt for item details + holder pledge + pool pledge.
 *   2. Validate the holder still passes the Renown gate (rank check
 *      applies to the *holder* per RAW, not the contributors).
 *   3. Run `canPoolRequisition` on the two-contributor model
 *      (holder + aggregated pool) against the holder's own RP.
 *   4. Debit the holder's RP and emit a pooled chat card.
 *
 * Pool contributors beyond the holder are not modelled as separate
 * actors here — that requires kill-team roster integration. The pooled
 * RP is treated as an external pledge the GM tracks at the table.
 */
export async function dwRequisitionPool(this: DwRequisitionActionContext, _event: Event, _target: HTMLElement): Promise<void> {
    const actor = this.actor;
    const slice = dwSystem(actor);
    const prompt = await promptPoolDetails();
    if (prompt === null) return;
    if (!Number.isFinite(prompt.baseCost) || prompt.baseCost < 0 || prompt.itemName === '') {
        notify('warn', 'WH40K.DW.Requisition.Validation.InvalidInput');
        return;
    }
    const itemCost = computeItemCost(prompt.baseCost, prompt.craftsmanship);

    // Rank check — holder must meet the gate even when pooling.
    if (!canRequisition({ renown: slice.renown ?? 0, requiredRank: prompt.requiredRank })) {
        notify('warn', 'WH40K.DW.Requisition.Validation.RankTooLow');
        return;
    }

    const holderId = actor.id ?? 'holder';
    const poolId = 'pool';
    const contributions: PooledContribution[] = [
        { brotherId: holderId, rpContributed: prompt.holderRp },
        { brotherId: poolId, rpContributed: prompt.poolRp },
    ];
    const decision = canPoolRequisition({
        contributions,
        itemCost,
        brothersRpAvailable: {
            [holderId]: slice.requisitionPoints,
            // Pool RP is treated as freely-pledged for validation purposes —
            // the GM enforces availability per-Brother out-of-band until the
            // kill-team roster ships.
            [poolId]: prompt.poolRp,
        },
    });
    if (!decision.allowed) {
        const key = decision.reason === 'over-allocated' ? 'WH40K.DW.Requisition.Validation.OverAllocated' : 'WH40K.DW.Requisition.Validation.InsufficientPool';
        notify('warn', key);
        return;
    }
    const rpAfter = slice.requisitionPoints - prompt.holderRp;
    await actor.update({ 'system.requisitionPoints': rpAfter });
    await emitChatCard(actor, {
        mode: 'pool',
        itemName: prompt.itemName,
        craftsmanship: prompt.craftsmanship,
        baseCost: prompt.baseCost,
        itemCost,
        rpAfter,
        contributions: [
            { brotherName: actor.name, rp: prompt.holderRp },
            { brotherName: game.i18n.localize('WH40K.DW.Requisition.Pool.Contributor'), rp: prompt.poolRp },
        ],
        totalContributed: decision.totalContributed,
    });
}
