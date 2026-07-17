/**
 * @file Action handlers for the Only War Mission Assignment Gear panel
 * (#155 — OW core.md §"MISSION ASSIGNMENT GEAR", line 7156).
 *
 * Exports a single static function whose name matches the `data-action`
 * string in `src/templates/actor/panel/ow-mission-gear-panel.hbs`. The
 * orchestrator registers it in `CharacterSheet.DEFAULT_OPTIONS.actions`
 * so the ApplicationV2 action dispatcher binds `this` to the sheet — the
 * function therefore reads `this.actor` to access the live actor.
 *
 *   - `owRequestGear`   Open a DialogV2 prompting for Table 6-3
 *                       modifiers, compose the d100 target via
 *                       `applyTable63Modifiers`, roll, resolve the
 *                       outcome via `resolveGearOutcome`, optionally
 *                       `rollRandomIssueGear` for the Table 6-5 bonus
 *                       item, persist `lastGearOutcome` back to the
 *                       actor, and emit a chat card.
 *
 * OW-gated at the call site (the panel only renders for OW actors); the
 * runtime guard here is defensive against accidental invocation.
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { isD100Success, postChatCard, roll1d100 } from '../rolls/roll-helpers.ts';
import { degreesOfFailure as diceDegreesOfFailure, degreesOfSuccess as diceDegreesOfSuccess } from '../rules/_dice.ts';
import { type GearOutcome, ORDINARY_BONUS_KEY, applyTable63Modifiers, resolveGearOutcome, rollRandomIssueGear } from '../rules/ow-mission-gear.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { isActorOfSystem } from './action-host.ts';

/** Sheet-like host shape; the ApplicationV2 dispatcher binds the sheet as `this`. */
interface MissionGearActionHost {
    readonly actor: WH40KBaseActor;
    _resolveGameSystemId?: () => string;
}

interface OwLogisticsSlot {
    readonly logisticsRating?: number;
    readonly munitorum?: boolean;
    readonly situational?: number;
}

/** Discriminated union of i18n keys covering each Table 6-4 tier. */
const OUTCOME_LABEL_KEYS: Record<GearOutcome, string> = {
    'surrender-kit': 'WH40K.OW.MissionGear.Outcome.SurrenderKit',
    'minimum-kit': 'WH40K.OW.MissionGear.Outcome.MinimumKit',
    'standard-kit': 'WH40K.OW.MissionGear.Outcome.StandardKit',
    'bonus-items': 'WH40K.OW.MissionGear.Outcome.BonusItems',
};

/** Per-breakdown-row label keys for the chat card. */
const ORDINARY_LABEL_KEY = 'WH40K.OW.MissionGear.Modifier.OrdinaryBonus';
const CUSTOM_LABEL_KEY = 'WH40K.OW.MissionGear.Modifier.Title';

/**
 * Compose the base Logistics target from the actor's persisted scalars.
 * Mission Assignment Gear is built ON TOP of the Logistics Rating —
 * `applyTable63Modifiers` then stacks the +10 Ordinary bonus and the
 * Table 6-3 situational deltas.
 *
 * The Logistics scalars are owned by `ow-logistics-template.ts`; this
 * action only reads them, never writes them.
 */
function readBaseLogisticsTarget(actor: WH40KBaseActor): number {
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-system Logistics scalars live on per-system actor system data, not the abstract base surface
    const sys = actor.system as OwLogisticsSlot;
    const rating = typeof sys.logisticsRating === 'number' ? sys.logisticsRating : 0;
    const munitorum = sys.munitorum === true ? 5 : 0;
    const situational = typeof sys.situational === 'number' ? sys.situational : 0;
    return rating + munitorum + situational;
}

/**
 * Parse the form HTMLElement returned by DialogV2's ok-callback for the
 * Table 6-3 modifier-input dialog. Each input has `name="<descriptor>"`
 * with a numeric value; we collect every named input into a modifier
 * list. Empty / non-finite entries are skipped so the GM can leave
 * unused rows blank.
 *
 * Includes the "rollBonusItem" checkbox so a successful roll knows
 * whether to also roll on Table 6-5 even when the tier didn't earn a
 * bonus item by default (RAW: only `bonus-items` earns one, but GM
 * discretion is allowed for narrative beats).
 */
interface ModifierDialogResult {
    readonly modifiers: ReadonlyArray<{ description: string; value: number; labelKey: string }>;
    readonly rollBonusItem: boolean;
}

function parseModifierDialogForm(form: HTMLFormElement | null): ModifierDialogResult {
    if (form === null) return { modifiers: [], rollBonusItem: false };
    const modifiers: { description: string; value: number; labelKey: string }[] = [];
    const inputs = form.querySelectorAll<HTMLInputElement>('input[data-modifier-row]');
    for (const input of inputs) {
        const raw = input.value.trim();
        if (raw === '') continue;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) continue;
        const description = input.dataset['description'] ?? input.name;
        const labelKey = input.dataset['labelKey'] ?? CUSTOM_LABEL_KEY;
        modifiers.push({ description, value: Math.trunc(parsed), labelKey });
    }
    const bonusToggle = form.querySelector<HTMLInputElement>('input[name="rollBonusItem"]');
    return {
        modifiers,
        rollBonusItem: bonusToggle?.checked === true,
    };
}

/** Pass/fail and Table 6-4 degrees derived from the underlying Logistics roll. */
export interface GearDegrees {
    /** True when the Logistics Test succeeds per the shared d100 rule. */
    readonly passed: boolean;
    /** Degrees of Success (0 on a failure). */
    readonly degreesOfSuccess: number;
    /** Degrees of Failure (0 on a success). */
    readonly degreesOfFailure: number;
}

/**
 * Derive the gear roll's pass/fail and degrees from the d100 total and the
 * composed effective target, routing every decision through the shared
 * SSOTs instead of re-inlining them.
 *
 * Pass/fail is `isD100Success`, so a natural 01 ALWAYS succeeds and a natural
 * 100 ALWAYS fails — even when Table 6-3 modifiers push the effective target
 * to ≥100, where the old hand-rolled `margin >= 0` wrongly passed a natural
 * 100. Degrees follow the canonical `1 + extra` idiom shared with the roll
 * engine (`WH40K.calculateDegrees`): a bare pass/fail scores one degree and
 * each further ten of margin adds another, so a natural-100 failure still
 * reports at least one Degree of Failure despite its zero (or negative)
 * margin.
 */
export function deriveGearDegrees(rollTotal: number, target: number): GearDegrees {
    const passed = isD100Success(rollTotal, target);
    return {
        passed,
        degreesOfSuccess: passed ? 1 + diceDegreesOfSuccess(rollTotal, target, { extra: true }) : 0,
        degreesOfFailure: passed ? 0 : 1 + diceDegreesOfFailure(rollTotal, target, { extra: true }),
    };
}

/**
 * Open a DialogV2 prompting the GM for Table 6-3 modifiers, then resolve
 * the gear roll (`data-action="owRequestGear"`).
 *
 * Per OW core.md, Table 6-3 modifiers are situational deltas the GM
 * applies based on mission context (warzone, request unusualness, etc.).
 * The dialog accepts a free-form list of named rows — three by default
 * covering the most common cases — plus an optional "roll bonus item"
 * checkbox the GM can flip to also roll on Table 6-5 even when the
 * outcome tier didn't earn one.
 */
export async function owRequestGear(this: MissionGearActionHost, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    if (!isActorOfSystem(this, 'ow')) return;

    const baseTarget = readBaseLogisticsTarget(this.actor);
    const modifierTitle = game.i18n.localize('WH40K.OW.MissionGear.Modifier.Title');
    const warzoneLabel = game.i18n.localize('WH40K.OW.MissionGear.Modifier.RemoteWarzone');
    const unusualLabel = game.i18n.localize('WH40K.OW.MissionGear.Modifier.UnusualRequest');
    const otherLabel = game.i18n.localize('WH40K.OW.MissionGear.Modifier.Other');
    const bonusToggleLabel = game.i18n.localize('WH40K.OW.MissionGear.Roll.BonusToggle');
    const requestTitle = game.i18n.localize('WH40K.OW.MissionGear.RequestButton');

    const content = `
        <div class="form-group">
            <p class="notes">${modifierTitle}</p>
            <label>${warzoneLabel}</label>
            <input type="number" name="remoteWarzone"
                   data-modifier-row data-description="remote-warzone"
                   data-label-key="WH40K.OW.MissionGear.Modifier.RemoteWarzone"
                   value="0" step="5" />
            <label>${unusualLabel}</label>
            <input type="number" name="unusualRequest"
                   data-modifier-row data-description="unusual-request"
                   data-label-key="WH40K.OW.MissionGear.Modifier.UnusualRequest"
                   value="0" step="5" />
            <label>${otherLabel}</label>
            <input type="number" name="other"
                   data-modifier-row data-description="other"
                   data-label-key="WH40K.OW.MissionGear.Modifier.Other"
                   value="0" step="5" />
            <label>
                <input type="checkbox" name="rollBonusItem" />
                ${bonusToggleLabel}
            </label>
        </div>
    `;

    const dialogResult = await foundry.applications.api.DialogV2.prompt({
        window: { title: requestTitle },
        content,
        ok: {
            callback: (_cbEvent: Event, button: HTMLButtonElement) => parseModifierDialogForm(button.form),
        },
        rejectClose: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: DialogV2.prompt resolves with unknown; null/undefined guards the cancelled path
    if (dialogResult === null || dialogResult === undefined) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt resolves to unknown; the ok callback narrows to ModifierDialogResult
    const { modifiers, rollBonusItem } = dialogResult as unknown as ModifierDialogResult;

    const composed = applyTable63Modifiers(
        baseTarget,
        modifiers.map(({ description, value }) => ({ description, value })),
    );

    // d100 roll for the underlying Logistics Test.
    const roll = await roll1d100();
    // eslint-disable-next-line no-restricted-syntax -- boundary: Roll.total is typed loosely on Foundry's surface; the 1d100 evaluator yields a finite integer
    const rollTotal = Math.trunc(Number(roll.total ?? 0));

    // Pass/fail and degrees route through the shared d100 SSOTs so the
    // natural-01-always-succeeds / natural-100-always-fails rule holds even
    // when Table 6-3 modifiers push the effective target to ≥100.
    const { passed: success, degreesOfSuccess, degreesOfFailure } = deriveGearDegrees(rollTotal, composed.target);

    const resolution = resolveGearOutcome({ degreesOfSuccess, degreesOfFailure });

    // Optionally roll on Table 6-5 (Random Issue Gear) for the bonus
    // item — automatic for the `bonus-items` tier, GM-opt-in otherwise.
    const earnsBonus = resolution.bonusItemCount > 0;
    const shouldRollBonus = earnsBonus || (rollBonusItem && success);
    const bonusItemRoll = shouldRollBonus ? rollRandomIssueGear(() => Math.random()) : null;

    // Persist lastGearOutcome onto the actor so the panel surfaces it on
    // next sheet open. The `system.lastGearOutcome` slot is contributed
    // by `ow-mission-gear-template.ts` and merged into CharacterData by
    // the orchestrator (see `.integration-staging/155.json`).
    await this.actor.update({ 'system.lastGearOutcome': resolution.outcome });

    // Build the chat card breakdown — the first row is always the
    // Ordinary +10 bonus, then one row per Table 6-3 modifier in the
    // order the GM entered them.
    const breakdownRows = composed.breakdown.map((row, index) => {
        if (index === 0 && row.description === ORDINARY_BONUS_KEY) {
            return { labelKey: ORDINARY_LABEL_KEY, value: row.value };
        }
        // breakdown.length === modifiers.length + 1 (ordinary bonus at index 0 + one per modifier),
        // so sourceModifier is always defined when index >= 1.
        const sourceModifier = modifiers[index - 1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: ReadonlyArray index yields T | undefined under tsc strict; ESLint sees T only via tsconfig.test.json project
        if (sourceModifier === undefined) return { labelKey: CUSTOM_LABEL_KEY, value: row.value };
        return {
            labelKey: sourceModifier.labelKey,
            value: row.value,
        };
    });

    const templateData = {
        gameSystem: 'ow',
        _gameSystemId: firstSystemId(this.actor),
        success,
        roll: rollTotal,
        target: composed.target,
        degreesOfSuccess,
        degreesOfFailure,
        breakdown: breakdownRows,
        outcomeKey: OUTCOME_LABEL_KEYS[resolution.outcome],
        hasBonusItem: bonusItemRoll !== null,
        bonusItemRoll,
    };

    const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ow-mission-gear-chat.hbs', templateData);
    await postChatCard(html);
}
