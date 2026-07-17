/**
 * Only War · Battlefield Awareness action handlers
 * (#161 — core.md §"BATTLEFIELD AWARENESS AND MANOEUVRES" line 13361,
 * §"Support" line 13411; §"CREATING REGIMENTAL AWARDS" line 13103).
 *
 * Two sheet-action methods wired into the character-sheet action map:
 *
 *   - `owRequestSupport` — opens a dialog for the asset kind, resolves
 *                          a `requestSupport` against the engine, sets
 *                          the per-actor cooldown on success, and posts
 *                          the Battlefield chat card.
 *   - `owToggleAward`    — flips a single Regimental Award id on / off
 *                          in the actor's `system.regimentalAwards`
 *                          roster. The button carries the award id on
 *                          `data-award-id`.
 *
 * Handlers are exported as `this`-typed free functions; the Foundry V14
 * ApplicationV2 action map binds `this` to the sheet instance at click
 * time, so the character sheet wires them like:
 *
 *     import * as OwBattlefieldActions from '../../actions/ow-battlefield-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             owRequestSupport: OwBattlefieldActions.owRequestSupport,
 *             owToggleAward:    OwBattlefieldActions.owToggleAward,
 *         },
 *     };
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { applySupportCooldown, requestSupport, type SupportAssetDef, type SupportAssetKind } from '../rules/ow-battlefield-support.ts';
import type { I18nKey } from '../types/i18n-keys';
import { firstSystemId } from '../utils/chat-system-id.ts';

/**
 * Structural type the OW Battlefield handlers expect. The character
 * sheet already exposes `actor` + `_updateSystemField`; this narrows
 * to the two OW Battlefield slots persisted by `ow-battlefield-template`.
 */
export interface OwBattlefieldHost {
    actor: WH40KBaseActor & {
        name: string;
        system: {
            supportCooldown: number;
            regimentalAwards: string[];
        };
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards arbitrary system-field values to Foundry's Document.update() via the sheet helper
    _updateSystemField: (field: string, value: unknown) => Promise<void>;
}

type Host = OwBattlefieldHost;

const CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/ow-battlefield-chat.hbs';

/** Map asset kind → langpack key for the asset display name. */
const ASSET_NAME_KEY: Readonly<Record<SupportAssetKind, I18nKey>> = Object.freeze({
    'artillery': 'WH40K.OW.Battlefield.Support.Asset.Artillery',
    'air-strike': 'WH40K.OW.Battlefield.Support.Asset.AirStrike',
    'reinforcements': 'WH40K.OW.Battlefield.Support.Asset.Reinforcements',
    'orbital': 'WH40K.OW.Battlefield.Support.Asset.Orbital',
});

/** The four canonical kinds the engine recognises. */
const ASSET_KINDS: ReadonlyArray<SupportAssetKind> = Object.freeze(['artillery', 'air-strike', 'reinforcements', 'orbital']);

interface RequestSupportPromptResult {
    kind: SupportAssetKind;
    logisticsModifier: number;
    cooldownTurns: number;
    currentLogisticsTarget: number;
    roll: number;
}

function isSupportAssetKind(value: string): value is SupportAssetKind {
    return value === 'artillery' || value === 'air-strike' || value === 'reinforcements' || value === 'orbital';
}

async function promptSupportRequest(): Promise<RequestSupportPromptResult | null> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi?.prompt) {
        // Headless fallback: emit a request for the most generic kind so
        // the engine still resolves and the action remains testable in
        // licensed-Foundry-absent environments.
        return {
            kind: 'artillery',
            logisticsModifier: 0,
            cooldownTurns: 0,
            currentLogisticsTarget: 0,
            roll: 100,
        };
    }
    const title = game.i18n.localize('WH40K.OW.Battlefield.Support.Request.Title');
    const labels = {
        kind: ASSET_KINDS.map((id) => `<option value="${id}">${game.i18n.localize(ASSET_NAME_KEY[id])}</option>`).join(''),
        modifier: game.i18n.localize('WH40K.OW.Battlefield.Support.Cooldown'),
        target: game.i18n.localize('WH40K.OW.Battlefield.Support.Request.Title'),
        turns: game.i18n.localize('WH40K.OW.Battlefield.Support.TurnsUntilArrival'),
    };
    const content = `
        <fieldset>
            <legend>${title}</legend>
            <div class="form-group">
                <label for="ow-support-kind">${labels.target}</label>
                <select name="kind" id="ow-support-kind">${labels.kind}</select>
            </div>
            <div class="form-group">
                <label for="ow-support-modifier">${labels.modifier} (Logistics Modifier)</label>
                <input type="number" name="logisticsModifier" id="ow-support-modifier" value="0" step="1" />
            </div>
            <div class="form-group">
                <label for="ow-support-cooldown">${labels.turns}</label>
                <input type="number" name="cooldownTurns" id="ow-support-cooldown" value="2" min="0" step="1" />
            </div>
            <div class="form-group">
                <label for="ow-support-target">Current Logistics Target</label>
                <input type="number" name="currentLogisticsTarget" id="ow-support-target" value="40" min="0" step="1" />
            </div>
            <div class="form-group">
                <label for="ow-support-roll">d100 Roll</label>
                <input type="number" name="roll" id="ow-support-roll" value="50" min="1" max="100" step="1" />
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
                if (!form) return null;
                const readNumber = (name: string, fallback: number): number => {
                    const input = form.elements.namedItem(name);
                    if (input instanceof HTMLInputElement) {
                        const parsed = Number.parseFloat(input.value);
                        return Number.isFinite(parsed) ? parsed : fallback;
                    }
                    return fallback;
                };
                const kindInput = form.elements.namedItem('kind');
                const kindValue = kindInput instanceof HTMLSelectElement ? kindInput.value : 'artillery';
                const kind: SupportAssetKind = isSupportAssetKind(kindValue) ? kindValue : 'artillery';
                return {
                    kind,
                    logisticsModifier: readNumber('logisticsModifier', 0),
                    cooldownTurns: Math.max(0, Math.trunc(readNumber('cooldownTurns', 0))),
                    currentLogisticsTarget: Math.max(0, Math.trunc(readNumber('currentLogisticsTarget', 0))),
                    roll: Math.max(1, Math.min(100, Math.trunc(readNumber('roll', 100)))),
                };
            },
        },
        rejectClose: false,
    })) as RequestSupportPromptResult | null | undefined;
    return raw ?? null;
}

interface RequestChatPayload {
    kind: 'request';
    assetKind: SupportAssetKind;
    assetNameKey: I18nKey;
    successful: boolean;
    effectiveTarget: number;
    roll: number;
    turnsUntilArrival: number | null;
    cooldownAfter: number;
}

interface AwardChatPayload {
    kind: 'award';
    awardId: string;
    toggledOn: boolean;
    rosterSize: number;
}

type ChatPayload = RequestChatPayload | AwardChatPayload;

async function emitBattlefieldChat(host: Host, event: ChatPayload): Promise<void> {
    const templateData = {
        gameSystem: 'ow' as const,
        _gameSystemId: firstSystemId(host.actor),
        actor: { name: host.actor.name },
        event,
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate expects AnyObject; templateData is structurally compatible
    const html = await foundry.applications.handlebars.renderTemplate(CHAT_TEMPLATE, templateData as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is assignment-compatible but getSpeaker expects the concrete Foundry Actor type
    const speaker = ChatMessage.getSpeaker({ actor: host.actor as unknown as WH40KBaseActor });
    await postChatCard(html, { speaker });
}

/* -------------------------------------------- */
/*  owRequestSupport — call in a support asset   */
/* -------------------------------------------- */

/**
 * Request a battlefield support asset. Wired to
 * `data-action="owRequestSupport"`.
 *
 * Opens a DialogV2 prompt for the asset kind + per-asset modifiers,
 * resolves the call through the rules engine, and on success sets the
 * actor's `supportCooldown` to the engine-derived value. Posts the
 * Battlefield chat card on every outcome (success or failure).
 */
export async function owRequestSupport(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();

    // Refuse to dispatch while the squad is still on cooldown — the
    // button is `disabled` in the template, this is defence-in-depth.
    if (this.actor.system.supportCooldown > 0) return;

    const input = await promptSupportRequest();
    if (input == null) return; // operator cancelled

    const asset: SupportAssetDef = {
        id: `request:${input.kind}`,
        kind: input.kind,
        logisticsModifier: input.logisticsModifier,
        cooldownTurns: input.cooldownTurns,
    };
    const result = requestSupport({
        asset,
        currentLogisticsTarget: input.currentLogisticsTarget,
        roll: input.roll,
    });

    let cooldownAfter = this.actor.system.supportCooldown;
    if (result.successful) {
        // Cooldown begins ticking the moment the asset is en route; the
        // engine guarantees `turnsUntilArrival >= 1` on success, and we
        // set the cooldown to the full asset cooldown so the panel
        // surfaces the wait correctly.
        cooldownAfter = Math.max(0, input.cooldownTurns);
        await this._updateSystemField('system.supportCooldown', cooldownAfter);
    }

    await emitBattlefieldChat(this, {
        kind: 'request',
        assetKind: input.kind,
        assetNameKey: ASSET_NAME_KEY[input.kind],
        successful: result.successful,
        effectiveTarget: result.effectiveTarget,
        roll: input.roll,
        turnsUntilArrival: result.turnsUntilArrival ?? null,
        cooldownAfter,
    });
}

/* -------------------------------------------- */
/*  owToggleAward — flip a Regimental Award      */
/* -------------------------------------------- */

/**
 * Toggle a single Regimental Award id on / off the actor's award
 * roster. Wired to `data-action="owToggleAward"`; the button carries
 * the canonical award id on `data-award-id`.
 *
 * The roster is the persisted list of conferred awards; the panel
 * builder resolves these to full `RegimentalAward` records at render
 * time and runs `mergeRegimentalAwards` for the merged-bonus readout.
 */
export async function owToggleAward(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const awardId = target.dataset['awardId'];
    if (awardId === undefined || awardId === '') return;

    const current = this.actor.system.regimentalAwards;
    const has = current.includes(awardId);
    const next = has ? current.filter((id) => id !== awardId) : [...current, awardId];
    await this._updateSystemField('system.regimentalAwards', next);

    await emitBattlefieldChat(this, {
        kind: 'award',
        awardId,
        toggledOn: !has,
        rosterSize: next.length,
    });
}

/* Re-export the canonical cooldown tick helper so callers (turn-end
 * hooks, GM "advance round" actions) read it through the action
 * module without taking a second dependency on the rules file. */
export { applySupportCooldown };
