/**
 * Character sheet: Possession track actions (#82).
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { isActorOnLine } from '../../../actions/actor-line-gate.ts';
import { promptGrappleItem } from '../../../actions/grapple-controls.ts';
import { grappleRulesFor } from '../../../config/game-systems/index.ts';
import { SYSTEM_ID } from '../../../constants.ts';
import type { WH40KBaseActor } from '../../../documents/base-actor.ts';
import { dealGrappleDamage } from '../../../rolls/grapple-damage.ts';
import { performGrappleOption } from '../../../rolls/grapple-flow.ts';
import { SMITE_THE_UNHOLY_FATE_COST, resolveSmiteTheUnholyDoS } from '../../../rules/crusader.ts';
import type { DynamicModifierItemLike } from '../../../rules/dynamic-modifiers.ts';
import { ENCOUNTER_GRANT_FLAG, HATRED_IDENTIFIER, hatredAgainstFoe } from '../../../rules/fanatic.ts';
import { grappleRoleOf, type GrappleRole, readGrappleState } from '../../../rules/grapple.ts';
import { applyManaclesCondition, liftManaclesCondition } from '../../../rules/manacles.ts';
import {
    applyMismanifest,
    canUnleashDaemon,
    resetSessionUnleash,
    resolveFrenzyTest,
    resolveMismanifestPossession,
    spendUnleashDaemon,
} from '../../../rules/possession.ts';
import { firstSystemId } from '../../../utils/chat-system-id.ts';
import { findItemUuidByIdentifier } from '../../../utils/compendium-query.ts';
import { errorMessage } from '../../../utils/error-message.ts';
import { openDaemonologyRitualDialog } from '../../prompts/daemonology-ritual-dialog.ts';
import { openRightStuffDialog } from '../../prompts/right-stuff-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';
import { isSkillRoller } from './sheet-support.ts';

/**
 * Spend one Unleash Daemon charge for the current session. Routes
 * through the pure `spendUnleashDaemon` helper to keep parity with the
 * engine; no-ops with a warning when the actor is in the `none` state
 * or has exhausted their per-session uses.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function unleashDaemon(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const slot = this._readPossessionSlot();
        if (!canUnleashDaemon(slot)) {
            this._notify('warning', game.i18n.localize('WH40K.Possession.UnleashUnavailable'), { duration: 3000 });
            return;
        }
        const next = spendUnleashDaemon(slot);
        await this._updateSystemField('system.possession.unleashUsed', next.unleashUsed);
        this._notify('info', game.i18n.localize('WH40K.Possession.UnleashSpent'), { duration: 2500 });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.UnleashDaemonFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Unleash daemon error:', error);
    }
}

/**
 * Reset the per-session Unleash Daemon counter to zero. GM-only — the
 * button only renders for GM users in the template, but we still gate
 * server-side in case the action is dispatched via console.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function resetPossessionSession(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        if (!game.user.isGM) {
            this._notify('warning', game.i18n.localize('WH40K.Possession.ResetGmOnly'), { duration: 3000 });
            return;
        }
        const slot = this._readPossessionSlot();
        const next = resetSessionUnleash(slot);
        await this._updateSystemField('system.possession.unleashUsed', next.unleashUsed);
        this._notify('info', game.i18n.localize('WH40K.Possession.ResetDone'), { duration: 2500 });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.PossessionResetFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Reset possession session error:', error);
    }
}

/**
 * Per-round Challenging (+0) Willpower test while the Possession power
 * is sustained (#132). Failure inflicts Frenzy
 * this round; the power must still be sustained.
 * @this {CharacterSheet}
 */
export async function possessionFrenzyTest(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const slot = this._readPossessionSlot();
        if (slot.state !== 'latent') {
            this._notify('warning', game.i18n.localize('WH40K.Possession.FrenzyLoopUnavailable'), { duration: 3000 });
            return;
        }
        const wp = Math.trunc(Number(this.actor.system.characteristics.willpower.total));
        const rollResult = await new Roll('1d100').evaluate();
        const roll = Number(rollResult.total);
        const result = resolveFrenzyTest(roll, wp);
        await this._postPossessionChat({
            mode: 'frenzy',
            actorName: this.actor.name,
            roll,
            target: result.target,
            success: result.passed,
            stateBefore: 'latent',
            stateAfter: 'latent',
        });
        this._notify(
            result.passed ? 'info' : 'warning',
            game.i18n.localize(result.passed ? 'WH40K.Possession.FrenzyResistedNotify' : 'WH40K.Possession.FrenzyEnteredNotify'),
            { duration: 3000 },
        );
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.FrenzyFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Possession frenzy test error:', error);
    }
}

/**
 * Open the Exorcism dialog (#83, DH2) with this actor
 * as the exorcist. DH2-only: the ritual is that line's printed rule.
 */
export function performExorcism(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    if (!isActorOnLine(this.actor, 'dh2')) return;
    openDaemonologyRitualDialog(this.actor, 'exorcism');
}

/**
 * Open the Summoning dialog (#80, DH2) with this actor
 * as the summoner. DH2-only, like the Exorcism.
 */
export function performSummoning(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    if (!isActorOnLine(this.actor, 'dh2')) return;
    openDaemonologyRitualDialog(this.actor, 'summoning');
}

export async function possessionMismanifest(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const slot = this._readPossessionSlot();
        if (slot.state !== 'latent') {
            this._notify('warning', game.i18n.localize('WH40K.Possession.FrenzyLoopUnavailable'), { duration: 3000 });
            return;
        }
        const wp = Math.trunc(Number(this.actor.system.characteristics.willpower.total));
        const psykerRollResult = await new Roll('1d100').evaluate();
        const daemonRollResult = await new Roll('1d100').evaluate();
        const psykerRoll = Number(psykerRollResult.total);
        const daemonRoll = Number(daemonRollResult.total);
        const resolution = resolveMismanifestPossession(psykerRoll, wp, daemonRoll, wp, slot.state);
        const next = applyMismanifest(slot, resolution);
        await this._updateSystemField('system.possession.state', next.state);
        await this._postPossessionChat({
            mode: 'mismanifest',
            actorName: this.actor.name,
            roll: psykerRoll,
            target: wp,
            daemonRoll,
            daemonTarget: wp,
            psykerDoS: resolution.psykerDoS,
            daemonDoS: resolution.daemonDoS,
            success: resolution.psykerWon,
            stateBefore: slot.state,
            stateAfter: next.state,
        });
        this._notify(
            resolution.psykerWon ? 'info' : 'error',
            game.i18n.localize(resolution.psykerWon ? 'WH40K.Possession.MismanifestHeldNotify' : 'WH40K.Possession.MismanifestEscalated'),
            { duration: 3500 },
        );
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.MismanifestFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Possession mismanifest error:', error);
    }
}

/**
 * Fanatic role — Death to All Who Oppose Me! (#93, DH2).
 *
 * Spending 1 Fate grants Hatred toward the chosen foe until the encounter ends.
 *
 * Pipeline:
 *   - refuse without exactly one targeted foe, or with 0 Fate
 *   - find this line's Hatred talent document by `system.identifier`
 *   - decrement `system.fate.value` by 1
 *   - grant an encounter-scoped copy of that Hatred talent whose
 *     `vsSpecialization` hooks are re-aimed at the foe (`vsActor`), so the
 *     bonus is Hatred's own data; it is removed when the Combat is deleted
 *   - emit a chat card naming the foe (and the 1 Insanity for leaving combat
 *     against it, which is GM-adjudicated)
 *
 * Errors surface as in-sheet notifications.
 * @this {CharacterSheet}
 */
export async function deathToAllWhoOpposeMe(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const targets = Array.from(game.user.targets);
        const foe = targets.length === 1 ? targets[0]?.actor ?? null : null;
        const foeUuid = foe?.uuid ?? null;
        if (foe === null || foeUuid === null) {
            this._notify('warning', game.i18n.localize('WH40K.Fanatic.NoTarget'), { duration: 3000 });
            return;
        }

        const fateValue = this.actor.system.fate.value;
        if (fateValue <= 0) {
            this._notify('warning', game.i18n.localize('WH40K.Fanatic.NoFatePoints'), { duration: 3000 });
            return;
        }

        const hatredUuid = await findItemUuidByIdentifier('talent', HATRED_IDENTIFIER, this._resolveGameSystemId() ?? '');
        const hatred = hatredUuid === null ? null : await fromUuid(hatredUuid);
        if (!(hatred instanceof Item)) {
            this._notify('warning', game.i18n.localize('WH40K.Fanatic.NoHatred'), { duration: 3000 });
            return;
        }

        await this._updateSystemField('system.fate.value', fateValue - 1);

        const source = hatred.toObject();
        const hatredHooks = (hatred as DynamicModifierItemLike).system.modifiers?.dynamicModifiers ?? [];
        const grant = foundry.utils.mergeObject(source, {
            'system.specialization': foe.name,
            'system.modifiers.dynamicModifiers': hatredAgainstFoe(hatredHooks, foeUuid),
            [`flags.${SYSTEM_ID}.${ENCOUNTER_GRANT_FLAG}`]: true,
        });
        await this.actor.createEmbeddedDocuments('Item', [grant]);

        const gameSystem = this._resolveGameSystemId() ?? '';
        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/fanatic-chat.hbs', {
            _gameSystemId: firstSystemId(this.actor),
            actorName: this.actor.name,
            foeName: foe.name,
            hatredName: hatred.name,
            gameSystem,
        });
        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.DeathToAllFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Death to All Who Oppose Me error:', error);
    }
}

/**
 * Crusader role — Smite the Unholy (#141).
 * Spend 1 Fate to auto-pass a Fear test with DoS = WPB.
 */
export async function smiteTheUnholy(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const fateValue = this.actor.system.fate.value;
        if (fateValue < SMITE_THE_UNHOLY_FATE_COST) {
            this._notify('warning', game.i18n.localize('WH40K.Crusader.NoFatePoints'), { duration: 3000 });
            return;
        }
        await this._updateSystemField('system.fate.value', fateValue - SMITE_THE_UNHOLY_FATE_COST);
        const wp = this.actor.system.characteristics.willpower.total;
        const dos = resolveSmiteTheUnholyDoS(wp);
        const gameSystem = this._resolveGameSystemId() ?? '';
        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/crusader-chat.hbs', {
            _gameSystemId: firstSystemId(this.actor),
            actorName: this.actor.name,
            willpowerBonus: dos,
            gameSystem,
        });
        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.SmiteFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Smite the Unholy error:', error);
    }
}

/** Manacles condition — apply (#105, errata). */
export async function applyManacles(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        await applyManaclesCondition(this.actor);
        this._notify('info', game.i18n.localize('WH40K.Condition.Manacles.AppliedNotification'), { duration: 2500 });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.ManacledApplyFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('applyManacles error:', error);
    }
}

/** Manacles condition — lift (#105). */
export async function liftManacles(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        const removed = await liftManaclesCondition(this.actor);
        if (removed > 0) {
            this._notify('info', game.i18n.localize('WH40K.Condition.Manacles.LiftedNotification'), { duration: 2500 });
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.ManacledLiftFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('liftManacles error:', error);
    }
}

/** Ace role — Right Stuff Fate-spend (#100). */
export function openRightStuff(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    try {
        openRightStuffDialog({ actor: this.actor });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.RightStuffFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('openRightStuff error:', error);
    }
}

/**
 * Take one of the line's grapple options (#120; DH2). The button
 * names the option and the role it belongs to. A combatant takes its own role's
 * options; the GM also sees the other role's, and takes those for the opponent.
 * The option is tested as its line prints it (`rolls/grapple-flow.ts`).
 */
export async function grappleOption(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const optionId = target.dataset['grappleOption'];
        const buttonRole = target.dataset['grappleRole'];
        const ownRole = grappleRoleOf(readGrappleState(this.actor.flags, SYSTEM_ID));
        const rules = grappleRulesFor(this._resolveGameSystemId() ?? undefined);
        const option = rules?.options.find((entry) => entry.id === optionId && entry.role === buttonRole);
        if (rules === null || option === undefined || ownRole === null) return;
        const opponent = await this._grappleOpponent();
        if (opponent === null) {
            this._notify('warning', game.i18n.localize('WH40K.Grapple.NoOpponent'), { duration: 4000 });
            return;
        }
        // The other role's options are the GM's, taken for the opponent.
        const actsForOpponent = option.role !== ownRole;
        if (actsForOpponent && !game.user.isGM) return;
        const actor: WH40KBaseActor = actsForOpponent ? opponent : this.actor;
        const other: WH40KBaseActor = actsForOpponent ? this.actor : opponent;
        const actorRole: GrappleRole = option.role;
        await performGrappleOption({
            option,
            actor,
            opponent: other,
            actorRole,
            rules,
            gameSystem: this._resolveGameSystemId() ?? '',
            rollSkill: async (skill, instance) => {
                if (isSkillRoller(actor)) await actor.rollSkill(skill, undefined, { instance });
            },
            dealDamage: async (rule, testRoll) => {
                await dealGrappleDamage({ controller: actor, opponent: other, rule, testRoll });
            },
            pickItem: async (declared) => promptGrappleItem(actor, declared),
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.GrappleFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Grapple action error:', error);
    }
}

/**
 * Shock — Snap Out of It (#66, "Shock And Snapping Out Of It").
 *
 * Rolls a d100 Willpower test (Challenging +0 — target equals the
 * actor's Willpower total). On success, decrements `system.shock.value`
 * by 1 via `actor.applyShock(-1)`. Either outcome is narrated to chat
 * via the shock-snap-chat template.
 *
 * Errors surface as in-sheet notifications.
 * @this {CharacterSheet}
 */
export async function snapOutOfShock(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        // eslint-disable-next-line no-restricted-syntax -- boundary: shock slot is optional on the typed system union; cast through unknown is necessary
        const shock = (this.actor.system as { shock?: { value: number; max: number } }).shock;
        const shockBefore = shock?.value ?? 0;
        if (shockBefore <= 0) {
            this._notify('info', game.i18n.localize('WH40K.Shock.Header'), { duration: 2500 });
            return;
        }

        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is keyed by characteristic slug
        const characteristics = (this.actor.system as { characteristics?: Record<string, { total?: number } | undefined> }).characteristics;
        const willpower = characteristics?.['willpower']?.total ?? 0;

        // Challenging +0 — target equals the unmodified Willpower total.
        const roll = await new Roll('1d100').evaluate();
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Roll.total is typed loosely; we know it's a number after evaluate()
        const rollValue = Math.trunc(Number((roll as unknown as { total?: number }).total ?? 0));
        const success = rollValue <= willpower;

        if (success) {
            await this.actor.applyShock(-1);
        }
        const shockAfter = Math.max(0, shockBefore - (success ? 1 : 0));

        const content = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/shock-snap-chat.hbs', {
            _gameSystemId: firstSystemId(this.actor),
            actorName: this.actor.name,
            willpower,
            roll: rollValue,
            success,
            shockBefore,
            shockAfter,
        });
        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.SnapOutOfShockFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Snap Out of It error:', error);
    }
}

/**
 * Roll a Pinning resist test (Challenging +0 Willpower). Routes through the
 * actor's unified-roll method so Willpower talents/traits surface as
 * situational modifiers before resolving ("Pinning").
 * @this {CharacterSheet}
 */
export function rollPinningTest(this: CharacterSheet, _event: Event, _target: HTMLElement): void {
    this.actor.rollPinningTest();
}

/**
 * Roll the end-of-turn escape-from-pinning test. Prompts for the favourable
 * condition (in cover OR not being shot at grants +30, non-stacking) then
 * routes through the actor's unified-roll method.
 * @this {CharacterSheet}
 */
export async function escapePinning(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const DialogV2 = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    let favourable = false;
    if (DialogV2 !== undefined) {
        const result = await DialogV2.prompt({
            window: { title: 'WH40K.Pinning.EscapeLabel' },
            content: `<div class="form-group"><label><input type="checkbox" name="favourable" /> ${game.i18n.localize(
                'WH40K.Pinning.FavourableBonus',
            )}</label></div>`,
            ok: {
                label: 'WH40K.Common.Roll',
                callback: (_evt: Event, button: HTMLButtonElement): boolean => {
                    const form = button.form ?? null;
                    return (form?.elements.namedItem('favourable') as HTMLInputElement | null)?.checked === true;
                },
            },
            rejectClose: false,
        });
        if (result === null) return;
        // DialogV2.prompt types the resolved value as string|null; our ok-callback
        // returns the checkbox boolean, so coerce the runtime value.
        favourable = Boolean(result);
    }
    this.actor.rollEscapePinningTest({ inCover: favourable, notBeingShotAt: false });
}

/**
 * Apply (or heal) recoverable characteristic damage ("Characteristic
 * Damage"). Prompts for the characteristic + amount, then routes through the
 * document's `applyCharacteristicDamage` — positive damages, negative heals
 * (clamped at 0). The effective value is `total − damage`.
 * @this {CharacterSheet}
 */
export async function applyCharacteristicDamage(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const DialogV2 = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (DialogV2 === undefined) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is a dynamic record keyed by characteristic slug on the actor's DataModel
    const chars = (this.actor.system as { characteristics?: Record<string, { label?: string; damage?: number } | undefined> }).characteristics ?? {};
    const options = Object.entries(chars)
        .map(([key, char]) => {
            const label = game.i18n.localize(char?.label ?? key);
            const dmg = char?.damage ?? 0;
            return `<option value="${key}">${label}${dmg > 0 ? ` (−${dmg})` : ''}</option>`;
        })
        .join('');
    const content = `<div class="form-group"><label>${game.i18n.localize(
        'WH40K.Characteristic.SelectLabel',
    )}</label><select name="characteristic">${options}</select></div><div class="form-group"><label>${game.i18n.localize(
        'WH40K.Characteristic.AmountLabel',
    )}</label><input type="number" name="amount" value="1" step="1" autofocus /></div><p class="notes">${game.i18n.localize(
        'WH40K.Characteristic.DamageHint',
    )}</p>`;

    // Capture the picked values in the OK callback via a box (a bare local would
    // stay narrowed to `null` past the await, since TS can't see the callback
    // run); the prompt's resolved value only signals cancel. Avoids casting the
    // string|null return type onto our object shape.
    const picked: { value: { characteristic: string; amount: number } | null } = { value: null };
    const result = await DialogV2.prompt({
        window: { title: 'WH40K.Characteristic.ApplyDamageTitle' },
        content,
        ok: {
            label: 'WH40K.Common.Apply',
            callback: (_evt: Event, button: HTMLButtonElement): boolean => {
                const form = button.form ?? null;
                const char = (form?.elements.namedItem('characteristic') as HTMLSelectElement | null)?.value ?? '';
                const amt = Number.parseInt((form?.elements.namedItem('amount') as HTMLInputElement | null)?.value ?? '0', 10);
                picked.value = { characteristic: char, amount: amt };
                return true;
            },
        },
        rejectClose: false,
    });
    if (result === null || picked.value === null) return;
    const { characteristic, amount } = picked.value;
    if (characteristic === '' || !Number.isFinite(amount) || amount === 0) {
        ui.notifications.warn(game.i18n.localize('WH40K.Characteristic.NoneSelected'));
        return;
    }
    await this.actor.applyCharacteristicDamage(characteristic, amount);
}
