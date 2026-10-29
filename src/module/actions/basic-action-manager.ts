// Import the dialog DIRECTLY, not through dialogs/_module.ts: the barrel re-exports
// every dialog, so importing it drags acquisition-dialog and the rest into this
// module's graph and formed 72 of the repo's import cycles for one symbol.
import ConfirmationDialog from '../applications/dialogs/confirmation-dialog.ts';
import { prepareAssignDamageRoll } from '../applications/prompts/assign-damage-dialog.ts';
import { GRENADE_LABELS } from '../applications/prompts/grenade-labels.ts';
import { buildDamageCardRider, type DamageCardRider } from '../applications/prompts/grenade-throw-view.ts';
import { activeTokenOf, tokensInAreaTemplate } from '../canvas/area-template-canvas.ts';
import { WH40K } from '../config.ts';
import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import type { ActionData } from '../rolls/action-data.ts';
import { areaResultRows } from '../rolls/area-statement.ts';
import { AssignDamageData, type ActorLike } from '../rolls/assign-damage-data.ts';
import { COUNTER_ATTACK_FLAG, currentCombatRound } from '../rolls/counter-attack-flow.ts';
import { Hit } from '../rolls/damage-data.ts';
import {
    closeEvasionPrompt,
    defenderWeaponsCanParry,
    EVASION_DECLINED_TEMPLATE,
    EVASION_OUTCOME_FLAG,
    EVASION_PROMPT_FLAG,
    type EvasionOutcome,
    type EvasionPromptContext,
    evasionGateFor,
    evasionOutcomeSummary,
    findEvasionOutcome,
    forcedAttackEvasion,
    messageSystemFlag,
    readEvasionOutcome,
    readEvasionPrompt,
    resolvedAttackEvasion,
} from '../rolls/evasion-flow.ts';
import { GRENADE_RIDER_FLAG, readRiderThrowFlag } from '../rolls/grenade-rider-flag.ts';
import { WeaponRollData } from '../rolls/roll-data.ts';
import { uuid, postChatCard, emitChatFromTemplate, rerenderActionDataInChat, roll1d100 } from '../rolls/roll-helpers.ts';
import { stampVehicleRows } from '../rolls/vehicle-card-rows.ts';
import { lookupVehicleCritical } from '../rolls/vehicle-critical-tables.ts';
import { crewTargetOf, parseVehicleStrike, resolveAboardVehicle, vehicleFuryResults, vehicleTargetProfileOnCanvas } from '../rolls/vehicle-strike.ts';
import { type AreaTargetResult, areaAvoidanceComponents, areaHitResult, avoidanceResult } from '../rules/area-template.ts';
import { assassinsStrikeTest } from '../rules/assassins-strike.ts';
import { isSameRound, readCombatRoundStamp } from '../rules/counter-attack.ts';
import { type EvasionSkill, evasionBlockReason, parryBlockReason } from '../rules/evasion.ts';
import { riderDamageSuffered } from '../rules/grenade-rider-resolution.ts';
import { DEFAULT_HIT_LOCATION, resolveHitLocationId } from '../rules/hit-locations.ts';
import { soakRows } from '../rules/target-soak.ts';
import { areaAvoidanceTest, type SubstitutionItemLike } from '../rules/test-substitution.ts';
import {
    armourCoveringLocation,
    warpWardingProperties,
    weaponHasQuality,
    weaponIgnoresArmor,
    type WornArmourCandidate,
} from '../rules/weapon-quality-effects.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { formatSigned } from '../utils/format.ts';
import { prepareModifierTooltipData } from '../utils/modifier-tooltip.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { damageControlReroll, disableSpentDamageControl } from './damage-control.ts';
import { grapplePushFromCard } from './grapple-controls.ts';
import { applyGrappleWritesFromMessage, postGrappleStart } from './grapple-relay.ts';
import { type RiderSource, type RiderToken, resolveRiderAgainst, riderSourceOf } from './grenade-rider-actions.ts';
import { applyComradeHitFromMessage, COMRADE_HIT_FLAG } from './ow-comrade-actions.ts';
import { DHTargetedActionManager } from './targeted-action-manager.ts';

type CanvasToken = foundry.canvas.placeables.Token;

/** The armour property ids a Warp Weapon cannot pass through (#414). */
const WARP_WARDING_PROPERTIES = warpWardingProperties(WH40K.armourProperties);

/** The card listing what a grenade's rider did to each creature caught (#623). */
const RIDER_RESULTS_TEMPLATE = 'systems/wh40k-rpg/templates/chat/grenade-rider-results-chat.hbs';

/** The card listing who an area attack caught (#599). */
const AREA_RESOLUTION_TEMPLATE = 'systems/wh40k-rpg/templates/chat/area-resolution-chat.hbs';

/**
 * Structural narrowing of WH40KBaseActor with the `rollSkill` method that
 * system-specific subclasses (Acolyte, Npc) define but the base type does
 * not surface. Foundry-side method shape; declared here so the cast at the
 * Foundry boundary stays localised.
 */
type WithRollSkill = WH40KBaseActorDocument & {
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollSkill options object is forwarded to Foundry's roll dispatcher
    rollSkill?: (skill: string, spec?: string, opts?: Record<string, unknown>) => Promise<void>;
};

/** An actor that can roll an evasion test against an attack (characters and NPCs, #414). */
type WithEvasionTest = WH40KBaseActorDocument & {
    rollEvasionTest?: (prompt: EvasionPromptContext, skill: EvasionSkill) => Promise<void>;
};

export class BasicActionManager {
    // This is stored rolls for allowing re-rolls, ammo refund, etc.
    storedRolls: Record<string, ActionData> = {};

    initializeHooks(): void {
        // The evasion window (#414) rides on chat messages every client receives.
        Hooks.on('createChatMessage', (message: ChatMessage) => {
            this.#onCreateChatMessage(message);
        });
        // Add show/hide support for chat messages
        Hooks.on('renderChatMessageHTML', (message: ChatMessage, html: HTMLElement, context: ChatMessage.MessageData) => {
            game.wh40k.log('renderChatMessageHTML', { message, html, context });
            // Tailwind's `important: '.wh40k-rpg'` config scopes every tw-* utility
            // under `.wh40k-rpg`. Chat messages render outside the system's sheet
            // root, so without this class the chat cards lose all Tailwind styling.
            html.classList.add('wh40k-rpg');
            // Surface the speaker actor's game system on the card root so per-system
            // Tailwind variants (`bc:`/`dh2:`/…) resolve via `[data-wh40k-system]` in
            // chat, which renders outside any sheet root. Without this the inline
            // 7-system chains on chat cards fall back to their base colour (#422).
            const chatSystem = (message as { speakerActor?: { system?: { gameSystem?: string } } | null }).speakerActor?.system?.gameSystem;
            if (chatSystem !== undefined && chatSystem !== '') html.dataset['wh40kSystem'] = chatSystem;
            html.querySelectorAll('.roll-control__hide-control').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    this._toggleExpandChatMessage(ev);
                });
            });
            html.querySelectorAll('.roll-control__refund').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._refundResources(ev);
                });
            });
            html.querySelectorAll('.roll-control__variant-reroll').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._variantReroll(ev);
                });
            });
            html.querySelectorAll('.roll-control__fate-add-dos').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._fateAddDoS(ev);
                });
            });
            html.querySelectorAll('.roll-control__assign-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._assignDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__roll-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._rollDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__begin-grapple').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._beginGrapple(ev);
                });
            });
            // A won Push Opponent (#665): the GM confirms the direction and moves the tokens.
            html.querySelectorAll<HTMLButtonElement>('.roll-control__grapple-push').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    ev.preventDefault();
                    void grapplePushFromCard(el);
                });
            });
            html.querySelectorAll('.roll-control__apply-damage').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._applyDamage(ev);
                });
            });
            html.querySelectorAll('.roll-control__replace-damage-die').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._replaceDamageDieWithDoS(ev);
                });
            });
            html.querySelectorAll('.roll-control__assassins-strike').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._assassinsStrike(ev);
                });
            });
            html.querySelectorAll('.roll-control__horde-break-test').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._hordeBreakTest(ev);
                });
            });
            html.querySelectorAll<HTMLButtonElement>('.roll-control__counter-attack').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._counterAttack(ev);
                });
            });
            // Evasion prompt (#414): the defender's owners / the GM answer the attack.
            const prompt = readEvasionPrompt(messageSystemFlag(message, EVASION_PROMPT_FLAG));
            if (prompt !== null) this.#wireEvasionPrompt(html, prompt);
            html.querySelectorAll('.roll-control__resolve-area').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._resolveArea(ev);
                });
            });
            html.querySelectorAll('.roll-control__resolve-rider').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    void this._resolveRider(ev);
                });
            });
            // Damage Control (#678): re-roll a vehicle's Righteous Fury roll, once.
            disableSpentDamageControl(html, message);
            html.querySelectorAll<HTMLButtonElement>('.roll-control__damage-control').forEach((el) => {
                el.addEventListener('click', (ev: Event) => {
                    ev.preventDefault();
                    void damageControlReroll(el, message);
                });
            });
        });
    }

    /**
     * Wire a rendered evasion prompt (#414): Dodge / Parry / Take the hit for the
     * defender's owners and the GM. A prompt the defender has already answered
     * renders closed.
     */
    #wireEvasionPrompt(html: HTMLElement, prompt: EvasionPromptContext): void {
        if (findEvasionOutcome(prompt.attackId) !== null) {
            closeEvasionPrompt(html, prompt.attackId, t('WH40K.Evasion.AlreadyAnswered'));
            return;
        }
        html.querySelectorAll<HTMLButtonElement>('.roll-control__evade').forEach((el) => {
            el.addEventListener('click', (ev: Event) => {
                const skill = el.dataset['skill'];
                if (skill === 'dodge' || skill === 'parry') void this._evade(ev, prompt, skill);
            });
        });
        html.querySelectorAll<HTMLButtonElement>('.roll-control__take-hit').forEach((el) => {
            el.addEventListener('click', (ev: Event) => {
                void this._takeHit(ev, prompt);
            });
        });
    }

    /**
     * Handle a newly created chat message for the evasion window (#414): notify a
     * prompt's recipients, and apply an outcome to the attack this client holds.
     */
    #onCreateChatMessage(message: ChatMessage): void {
        // A grapple started or ended (#450): the active GM writes both participants' flags.
        applyGrappleWritesFromMessage(message);
        // A hit struck a PC's Comrade instead (#152): the active GM moves its state track.
        applyComradeHitFromMessage(message);
        const prompt = readEvasionPrompt(message.getFlag(SYSTEM_ID, EVASION_PROMPT_FLAG));
        if (prompt !== null && !message.isAuthor && message.whisper.includes(game.user.id)) {
            ui.notifications.info(t('WH40K.Evasion.PromptNotice', { defender: prompt.defenderName, attacker: prompt.attackerName }));
        }
        const outcome = readEvasionOutcome(message.getFlag(SYSTEM_ID, EVASION_OUTCOME_FLAG));
        if (outcome === null) return;
        for (const element of document.querySelectorAll<HTMLElement>(`[data-evasion-prompt="${CSS.escape(outcome.attackId)}"]`)) {
            closeEvasionPrompt(element, outcome.attackId, t('WH40K.Evasion.AlreadyAnswered'));
        }
        void this.applyEvasionOutcome(outcome);
    }

    /**
     * The defender answers the attack with Dodge or Parry (#414). Only the defender's
     * owners and the GM may answer; the test is refused, with the reason, for a
     * defender in a grapple or without a Reaction, and a Parry for a ranged attack,
     * a Flexible attacking weapon, or a defender holding only Unwieldy weapons.
     */
    async _evade(event: Event, prompt: EvasionPromptContext, skill: EvasionSkill): Promise<void> {
        event.preventDefault();
        const defender = await this.#evasionDefender(prompt);
        if (defender === null) return;
        const blocked =
            evasionBlockReason(evasionGateFor(defender)) ??
            (skill === 'parry'
                ? parryBlockReason({
                      isMeleeAttack: prompt.isMeleeAttack,
                      attackerPreventsParry: prompt.attackerPreventsParry,
                      defenderWeaponsCanParry: defenderWeaponsCanParry(defender.items),
                  })
                : null);
        if (blocked !== null) {
            ui.notifications.warn(t(blocked));
            return;
        }
        const roller = defender as WithEvasionTest;
        if (roller.rollEvasionTest === undefined) {
            ui.notifications.warn(t('WH40K.Notify.Action.DefenderReactionFailed'));
            return;
        }
        await roller.rollEvasionTest(prompt, skill);
    }

    /**
     * Counter Attack (#603): the parrying character strikes back at the opponent with
     * the weapon that parried, the talent's modifier a sourced row on the attack. Only
     * the character's owners and the GM may take it; a per-round hook is stamped on the
     * character with the combat round so it is not offered again until the round advances.
     */
    async _counterAttack(event: Event): Promise<void> {
        event.preventDefault();
        const button = event.currentTarget as HTMLButtonElement;
        const { actorUuid, attackerUuid, weaponId, modifier, source, limit } = button.dataset;
        const actor = await this.#actorFromUuid(actorUuid ?? '');
        const opponent = await this.#actorFromUuid(attackerUuid ?? '');
        if (actor === null || opponent === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoActor'));
            return;
        }
        if (!game.user.isGM && !actor.isOwner) {
            ui.notifications.warn(t('WH40K.Evasion.NotYours', { defender: actor.name }));
            return;
        }
        const now = currentCombatRound(game.combat);
        if (limit === 'perRound') {
            if (isSameRound(readCombatRoundStamp(actor.getFlag(SYSTEM_ID, COUNTER_ATTACK_FLAG)), now)) {
                ui.notifications.warn(t('WH40K.Evasion.CounterAttackSpent'));
                return;
            }
            if (now !== null) await actor.setFlag(SYSTEM_ID, COUNTER_ATTACK_FLAG, now);
        }
        button.disabled = true;
        const weapon = weaponId === undefined || weaponId === '' ? null : actor.items.get(weaponId) ?? null;
        const sourceName = source ?? '';
        DHTargetedActionManager.performWeaponAttack(actor, opponent, weapon, {
            key: 'counter-attack',
            label: sourceName,
            value: Number(modifier ?? 0),
            source: sourceName,
        });
    }

    /** The defender takes the hit (#414): no test, no Reaction spent, and the attack's damage proceeds. */
    async _takeHit(event: Event, prompt: EvasionPromptContext): Promise<void> {
        event.preventDefault();
        const defender = await this.#evasionDefender(prompt);
        if (defender === null) return;
        const outcome: EvasionOutcome = {
            attackId: prompt.attackId,
            defenderName: prompt.defenderName,
            skill: null,
            success: false,
            hitsLanded: prompt.hitsLanded,
            negated: 0,
            remaining: prompt.hitsLanded,
            parts: [],
        };
        await emitChatFromTemplate(
            EVASION_DECLINED_TEMPLATE,
            { summary: evasionOutcomeSummary(outcome), actor: defender },
            { speaker: ChatMessage.getSpeaker({ actor: defender }), flags: { [EVASION_OUTCOME_FLAG]: outcome } },
        );
    }

    /** The prompt's defender, when this user may answer for it and the attack is still open; null (with a notice) otherwise. */
    async #evasionDefender(prompt: EvasionPromptContext): Promise<WH40KBaseActorDocument | null> {
        const defender = await this.#actorFromUuid(prompt.defenderUuid);
        if (defender === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Combat.NoDefender'));
            return null;
        }
        if (!game.user.isGM && !defender.isOwner) {
            ui.notifications.warn(t('WH40K.Evasion.NotYours', { defender: defender.name }));
            return null;
        }
        if (findEvasionOutcome(prompt.attackId) !== null) {
            ui.notifications.warn(t('WH40K.Evasion.AlreadyAnswered'));
            return null;
        }
        return defender;
    }

    /**
     * Apply the defender's evasion to the attack this client posted (#414): drop the
     * negated hits, re-render the attack card, and let damage proceed on what is left.
     * Every other client holds no ActionData for the attack and ignores the outcome;
     * an attack whose damage was already rolled over a pending window keeps it.
     */
    async applyEvasionOutcome(outcome: EvasionOutcome): Promise<void> {
        const actionData = this.getActionData(outcome.attackId);
        if (actionData?.evasion?.status !== 'pending') return;
        actionData.evasion = resolvedAttackEvasion(outcome);
        await rerenderActionDataInChat(actionData);
        await actionData.maybeAutoRollDamage();
    }

    _toggleExpandChatMessage(event: Event): void {
        game.wh40k.log('roll-control-toggle');
        event.preventDefault();
        const displayToggle = event.currentTarget as HTMLElement;
        const span = displayToggle.querySelector('span');
        if (span != null) {
            span.classList.toggle('active');
        }
        const target = displayToggle.dataset['toggle'];
        const targetEl = target != null && target !== '' ? document.getElementById(target) : null;
        if (targetEl != null) {
            targetEl.style.display = targetEl.style.display === 'none' ? '' : 'none';
        }
    }

    async _rollDamage(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.Notify.Action.RollDataUnavailable'));
        // A weapon that deals no damage never renders this button (#601); a card
        // posted before that gate still must not roll the legacy default dice.
        if (actionData == null || (actionData.rollData instanceof WeaponRollData && actionData.rollData.noDamage)) return;

        // The evasion window (#414): every hit evaded leaves nothing to roll; while the
        // defender has yet to answer, only the GM may roll over it (and closes it).
        if (actionData.evasion?.outcome?.remaining === 0) {
            ui.notifications.info(t('WH40K.Evasion.FullyEvaded', { defender: actionData.evasion.defenderName }));
            return;
        }
        if (actionData.evasion?.status === 'pending') {
            if (!game.user.isGM) {
                ui.notifications.warn(t('WH40K.Evasion.AwaitingDefender', { defender: actionData.evasion.defenderName }));
                return;
            }
            actionData.evasion = forcedAttackEvasion(actionData.evasion);
            await rerenderActionDataInChat(actionData);
        }

        // Disable button to prevent double-rolling
        btn.disabled = true;
        const statusSpan = btn.querySelector('span:last-child');
        if (statusSpan != null) statusSpan.textContent = 'Rolled';

        // Calculate hits (deferred from attack roll). Idempotent: if hits were
        // already produced (e.g. auto-roll-damage front-ran this), don't append
        // a second set of hits — re-post the existing damage card instead.
        if ((actionData.damageData?.hits.length ?? 0) === 0) {
            await actionData.calculateHits();
        }

        // Propagate attack DoS to each hit so the chat card can offer the
        // "replace damage die with DoS" action (#129 — DH2 core).
        const attackDoS = actionData.rollData.dos;
        for (const hit of actionData.damageData?.hits ?? []) {
            hit.dos = attackDoS;
        }

        await this._postDamageCard(actionData);
    }

    /**
     * Begin Grapple (#450): a grapple attempt that hit and was not evaded starts a
     * grapple the attacker controls (DH2). Like Roll Damage, it waits for the
     * defender's evasion answer; only the GM may proceed over an open window. The
     * start card carries both participants' flag writes for the active GM.
     */
    async _beginGrapple(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.Notify.Action.RollDataUnavailable'));
        if (actionData?.rollData.success !== true) return;
        const attacker = actionData.rollData.sourceActor;
        const target = actionData.rollData.targetActor;
        if (attacker?.uuid == null || target?.uuid == null) {
            ui.notifications.warn(t('WH40K.Grapple.Start.NoTarget'));
            return;
        }
        if (actionData.evasion?.outcome?.remaining === 0) {
            ui.notifications.info(t('WH40K.Grapple.Start.Evaded', { target: target.name }));
            return;
        }
        if (actionData.evasion?.status === 'pending') {
            if (!game.user.isGM) {
                ui.notifications.warn(t('WH40K.Evasion.AwaitingDefender', { defender: actionData.evasion.defenderName }));
                return;
            }
            actionData.evasion = forcedAttackEvasion(actionData.evasion);
            await rerenderActionDataInChat(actionData);
        }
        btn.disabled = true;
        await postGrappleStart(
            { name: attacker.name, uuid: attacker.uuid },
            { name: target.name, uuid: target.uuid },
            firstSystemId(attacker) ?? '',
            ChatMessage.getSpeaker({ actor: attacker }),
        );
    }

    /**
     * Render `damage-roll-chat.hbs` for an existing ActionData and post it
     * to the chat log. Extracted so the "replace damage die with DoS"
     * action (#129) can re-emit the card after mutating a Hit's dice.
     */
    async _postDamageCard(actionData: ActionData): Promise<void> {
        const damageRolls = actionData.damageData?.hits.map((h: Hit) => h.damageRoll).filter((r: Roll | undefined): r is Roll => r != null);

        // Tag each hit with whether the source weapon carries the Explosive
        // quality so the chat-card assign-damage button can propagate it
        // through to AssignDamageData (DW horde branch: +1 Magnitude per
        // Explosive hit per RAW). `weaponHasQuality` walks effectiveSpecial
        // / special / embedded attackSpecial items — the existing helper
        // is the single point of truth for quality detection (no string
        // literal name match anywhere else in src/).
        // eslint-disable-next-line no-restricted-syntax -- boundary: actionData.rollData.weapon is a typed WH40KItemDocument; the quality helpers accept a duck-typed QualityItem
        const weapon = (actionData.rollData.weapon ?? actionData.rollData.power) as Parameters<typeof weaponHasQuality>[0];
        const explosive = weaponHasQuality(weapon, 'explosive');
        for (const hit of actionData.damageData?.hits ?? []) {
            hit.isExplosive = explosive;
        }

        // Auto-calculate effective damage vs the current target (#247): when the attack
        // resolved against a target, surface the post-armour/TB damage on the card up
        // front. The manual "Assign Damage" button below still performs the application.
        const damageTarget = actionData.rollData.targetActor;
        const hits = actionData.damageData?.hits ?? [];
        // Area hits each name their own creature; "effective vs <target>" would name the wrong one.
        const targetName: string | null = hits.some((hit) => hit.targetUuid !== '') ? null : damageTarget?.name ?? null;
        let autoApplied = false;
        // Auto-apply (#248) runs only on a GM client: applying damage updates the
        // target actor, so it must happen once on a client with permission. The card
        // HTML is generated here, so a GM-rolled attack bakes in autoApplied=true (and
        // hides the manual button) for everyone; player-rolled attacks fall back to the
        // manual "Assign Damage" button.
        const autoApply = WH40KSettings.isAutoApplyDamageEnabled() && game.user.isGM;
        // Process hits as a sequential promise chain (not a for-await loop): each
        // auto-apply writes the target's wounds, so they must run one at a time to
        // avoid racing actor.update. An area hit (#599) lands on its own creature;
        // every other hit lands on the card's target.
        // A vehicle hit's Righteous Fury rows read their chart text up front (content#28).
        const vehicleFuries = await Promise.all(
            hits.map(async (hit) =>
                hit.vehicleStrike === null
                    ? []
                    : vehicleFuryResults(hit.vehicleStrike.righteousFury, hit.vehicleStrike.line, hit.vehicleStrike.location, lookupVehicleCritical),
            ),
        );
        await hits.reduce<Promise<void>>(async (previous, hit, index) => {
            await previous;
            const hitTarget = hit.targetUuid === '' ? damageTarget : await this.#actorFromUuid(hit.targetUuid);
            if (hitTarget == null) return;
            // Warp Weapon (#414): the hit passes through this target's armour and cover
            // unless a warded piece covers the struck location.
            hit.armourIgnored = weaponIgnoresArmor(
                weapon,
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's actor.items is an EmbeddedCollection of untyped-system Items; armourCoveringLocation reads only type / equipped / coverage / properties
                armourCoveringLocation(hitTarget.items as unknown as Iterable<WornArmourCandidate>, hit.location),
                WARP_WARDING_PROPERTIES,
            );
            // eslint-disable-next-line no-restricted-syntax -- boundary: the target is an opaque Foundry Actor; AssignDamageData consumes the untyped ActorLike system shape
            const assign = new AssignDamageData(hitTarget as unknown as ActorLike, hit);
            assign.update();
            stampVehicleRows(hit, hitTarget, index, vehicleFuries[index] ?? []);
            const preview = assign.previewReducedDamage();
            hit.hasEffective = true;
            hit.effectiveDamage = preview.effective;
            hit.effectiveArmour = preview.armour;
            hit.effectiveTb = preview.toughnessBonus;
            hit.effectiveAbsorbed = preview.absorbed;
            const soakTitle = t('WH40K.Chat.Damage.Soak.Title');
            const soak = soakRows(hit.totalDamage, assign.soakParts, assign.coverAP, preview.penetration, preview.toughnessBonus, assign.ignoreArmour).map(
                (row) => ({
                    name: t(row.labelKey),
                    value: row.value,
                }),
            );
            hit.effectiveRows = soak.map((row) => ({ label: row.name, value: formatSigned(row.value) }));
            hit.effectiveTooltip = prepareModifierTooltipData(soakTitle, soak);
            if (autoApply) {
                // finalize() applies wounds + rolls critical damage; performAction…()
                // writes the wound/critical update and posts the assign-damage card
                // (incl. the critical-injury status item).
                await assign.finalize();
                await assign.performActionAndSendToChat();
                autoApplied = true;
            }
        }, Promise.resolve());

        const templateData = {
            weaponName: actionData.rollData.name,
            hits: actionData.damageData?.hits,
            targetActor: actionData.rollData.targetActor,
            targetName,
            autoApplied,
            rollId: actionData.id,
            // The replacement option is offered while the original ActionData is still
            // resident in `storedRolls` — once it expires (page reload, etc.) the
            // button is omitted from re-rendered cards.
            canReplaceDie: true,
            // eslint-disable-next-line no-restricted-syntax -- boundary: psychicEffect is a system extension not declared in ActionData type
            psychicEffect: (actionData as unknown as { psychicEffect?: unknown }).psychicEffect ?? null,
            // A rider grenade that deals damage (#622): its rider follows the damage onto
            // everyone the attack struck.
            damageRider: this.#damageCardRider(actionData, targetName),
            // `templateData` carries no `actor`/`sourceActor` key and no speaker,
            // so the helper cannot derive `_gameSystemId` — keep it set from the
            // rolling actor for per-system theming (#422).
            _gameSystemId: firstSystemId(actionData.rollData.sourceActor),
        };

        // A hit that struck the target's Comrade instead (#152) is stated on the card; the
        // first card that states it also carries it for the active GM to apply, so a
        // re-posted card (a die swapped for DoS) does not wound the Comrade twice.
        const comradeHit = actionData.comradeHit;
        const relayComradeHit = comradeHit !== null && !actionData.comradeHitRelayed;
        actionData.comradeHitRelayed ||= relayComradeHit;

        const template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';
        await emitChatFromTemplate(
            template,
            { ...templateData, comradeHit },
            { rolls: damageRolls, applyWhispers: true, ...(relayComradeHit ? { flags: { [COMRADE_HIT_FLAG]: comradeHit } } : {}) },
        );
    }

    /**
     * The rider a damage card states after its hits (#622): the weapon's rider and the
     * creatures it struck — each area hit's own creature, else the card's target. Null
     * when the roll's weapon carries no rider.
     */
    #damageCardRider(actionData: ActionData, cardTargetName: string | null): DamageCardRider | null {
        const weapon = actionData.rollData.weapon;
        if (weapon?.id == null) return null;
        const struck = (actionData.damageData?.hits ?? []).map((hit) => (hit.targetName !== '' ? hit.targetName : cardTargetName ?? ''));
        return buildDamageCardRider({ id: weapon.id, name: weapon.name, system: weapon.system }, struck, GRENADE_LABELS);
    }

    /**
     * Handle the chat-card "Replace die with DoS" button (#129 — DH2 core).
     * Looks up the original ActionData by `data-roll-id`,
     * mutates the targeted Hit's lowest active damage die to the attack's
     * DoS, then re-emits the damage chat card with the updated total. A
     * short announcement card narrates the swap.
     */
    async _replaceDamageDieWithDoS(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const hitIndexRaw = btn.dataset['hitIndex'];
        const dosRaw = btn.dataset['dos'];

        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        const hitIndex = hitIndexRaw !== undefined && hitIndexRaw !== '' ? Number.parseInt(hitIndexRaw, 10) : 0;
        const dos = dosRaw !== undefined && dosRaw !== '' ? Number.parseInt(dosRaw, 10) : actionData.rollData.dos;
        const hit = actionData.damageData?.hits[hitIndex];
        if (hit === undefined || dos <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAddDoSNotSuccess'));
            return;
        }

        // Capture pre-replacement totals for the announcement.
        const before = hit.totalDamage;
        const replaced = hit.replaceDamageDieWithDoS(dos);
        if (!replaced) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoDamageDie'));
            return;
        }

        // Disable the button so the player cannot double-spend on the same Hit.
        btn.disabled = true;

        // Re-emit the damage card with the updated hit totals.
        await this._postDamageCard(actionData);

        // Short announcement of what was swapped — keeps the audit trail in chat.
        // `delta = total_after - total_before = dos - previous_die`, so
        // `previous_die = dos - delta`.
        const delta = hit.totalDamage - before;
        const announcement = game.i18n.format('WH40K.DamageDieReplacement.ReplacedDieMessage', {
            weapon: actionData.rollData.name,
            previous: String(dos - delta),
            dos: String(dos),
            total: String(hit.totalDamage),
        });
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-[var(--wh40k-card-gold)] tw-bg-amber-500/20 tw-text-[var(--wh40k-card-text)] tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    /**
     * Handle the chat-card "Assassin's Strike" button (#149 — DH2 errata).
     * Looks up the stored ActionData by `data-roll-id` so the
     * Acrobatics test is dispatched against the same actor that just
     * resolved the melee attack, then opens the unified roll dialog for
     * the test the talent document authors in its rollConfig (DH2:
     * Challenging (+0) Acrobatics). On success, the GM narrates
     * the Half Move (Agility-bonus metres) as a Free Action per the
     * errata — the dispatch posts a short announcement so the audit
     * trail stays in chat.
     */
    async _assassinsStrike(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        const sourceActor: WithRollSkill | null = actionData.rollData.sourceActor;
        if (sourceActor == null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoSourceActor'));
            return;
        }

        // The test (skill + modifier) is authored on the talent document's
        // rollConfig; an actor without the talent has nothing to roll.
        const strikeTest = assassinsStrikeTest(sourceActor);
        if (strikeTest === null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.AcrobaticsDispatchFailed'));
            return;
        }

        // Disable the button so the action cannot be double-dispatched.
        btn.disabled = true;

        try {
            await sourceActor.rollSkill?.(strikeTest.skill, undefined, {
                modifier: strikeTest.modifier,
                flavor: game.i18n.localize('WH40K.AssassinsStrike.TestTitle'),
            });
        } catch {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.AcrobaticsDispatchFailed'));
            btn.disabled = false;
            return;
        }

        // Short announcement keeps the audit trail in chat so the GM can
        // narrate the Half Move (Agility-bonus metres) immediately after.
        const announcement = game.i18n.localize('WH40K.AssassinsStrike.SuccessChatLine');
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-gray-700 tw-bg-gray-800/60 tw-text-gray-100 tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    /**
     * Chat-card "Willpower test to hold" button (#166 — DW Horde RAW).
     * Resolves the target horde from the dataset UUID, then dispatches a
     * Willpower characteristic test with the resolver-supplied modifier
     * (0 for a normal hold test, -10 when Magnitude has dropped below
     * 50%). Auto-break / Fearless / "no test required" cases do not emit
     * a button — the resolver short-circuits to the label-only render.
     */
    async _hordeBreakTest(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const targetUuid = btn.dataset['targetUuid'];
        const modifierRaw = btn.dataset['willpowerModifier'];

        if (targetUuid == null || targetUuid === '') {
            ui.notifications.warn(game.i18n.localize('WH40K.DW.Horde.Break.NoTest'));
            return;
        }

        const doc = await fromUuid(targetUuid);
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid result may be a TokenDocument with .actor; the field is opaque on the base Document type
        const resolved = doc instanceof Actor ? doc : (doc as { actor?: Actor | null } | null)?.actor;
        if (!(resolved instanceof Actor)) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: rollCharacteristic comes from system-specific Actor subclasses not surfaced on the base Actor type
        const actor = resolved as unknown as WH40KBaseActorDocument & { rollCharacteristic?: (key: string, flavor?: string) => void | Promise<void> };

        const modifier = modifierRaw !== undefined && modifierRaw !== '' ? Number.parseInt(modifierRaw, 10) : 0;
        const flavorKey = modifier < 0 ? 'WH40K.DW.Horde.Break.TestPenalised' : 'WH40K.DW.Horde.Break.TestNormal';
        btn.disabled = true;
        try {
            await Promise.resolve(actor.rollCharacteristic('willpower', game.i18n.localize(flavorKey)));
        } catch {
            btn.disabled = false;
        }
    }

    /**
     * Resolve an area attack against the tokens inside its template (#599). The template
     * is read as it stands now, so the user may have moved or rotated it after the
     * attack placed it. The firer is never caught. An `avoid` area (Spray) has each
     * creature roll its avoidance test — Agility, or Dodge with Leaping Dodge (#101,
     * #103) — with the quality's difficulty and the wielder's untrained / unbraced-Heavy
     * bonuses as provenance rows; a failure is a hit. A `hit` area (Blast) hits everyone
     * inside. The results post as a card whose Roll Damage rolls one hit per creature hit.
     */
    async _resolveArea(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        const rollData = actionData?.rollData;
        if (actionData == null || !(rollData instanceof WeaponRollData) || rollData.areaTemplate === null) return;
        const spec = rollData.areaTemplate;
        const firerTokenIds = new Set((rollData.sourceActor?.getActiveTokens() ?? []).map((token) => token.id));
        const caught = rollData.areaTemplateRef === null ? null : tokensInAreaTemplate(rollData.areaTemplateRef, firerTokenIds);
        if (caught === null) {
            ui.notifications.warn(t('WH40K.AreaAttack.NoTemplate'));
            return;
        }
        if (caught.length === 0) {
            ui.notifications.info(t('WH40K.AreaAttack.NoTargets'));
            return;
        }

        btn.disabled = true;
        const wielder = rollData.areaAvoidanceWielder();
        const rolls: Roll[] = [];
        const results: AreaTargetResult[] = [];
        // Crew aboard a vehicle that shelters them is out of the blast (content#28); a craft
        // under the template is struck on the facing the firer's token sees.
        const sheltered: string[] = [];
        const firerToken = activeTokenOf(rollData.sourceActor) ?? undefined;
        for (const token of caught) {
            const defender = token.actor;
            // An actor's UUID is null only before it is persisted; such a token cannot take a hit.
            const actorUuid = defender?.uuid ?? null;
            if (defender === null || actorUuid === null) continue;
            const name = token.name;
            const crew = crewTargetOf(defender, rollData.sourceActor, resolveAboardVehicle);
            if (crew !== null && crew.targeting === 'sheltered') {
                sheltered.push(t('WH40K.Vehicle.CrewTargeting.ShelteredFromArea', { name, vehicle: crew.vehicleName }));
                continue;
            }
            const vehicle = vehicleTargetProfileOnCanvas(defender, token, firerToken);
            if (vehicle !== null) rollData.vehicleTargets[actorUuid] = vehicle;
            if (spec.avoid === null) {
                results.push(areaHitResult(token.id, actorUuid, name));
                continue;
            }
            const items = Array.from(defender.items, (item) => ({ name: item.name, system: item.system as SubstitutionItemLike['system'] }));
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.json types characteristics[key] as possibly undefined, tsconfig.test.json does not
            const agility = defender.characteristics['agility']?.total ?? 0;
            const skills = (defender.system as { skills?: Partial<Record<string, { current: number }>> }).skills;
            const test = areaAvoidanceTest(items, agility, (skill) => skills?.[skill]?.current);
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each creature's d100 is its own roll on the card
            const roll = await roll1d100();
            rolls.push(roll);
            results.push(
                avoidanceResult({
                    tokenId: token.id,
                    actorUuid,
                    name,
                    skill: test.skill,
                    base: test.target,
                    components: areaAvoidanceComponents(spec.avoid, wielder),
                    roll: roll.total ?? 0,
                }),
            );
        }

        rollData.areaResults = results;
        // A fresh resolution replaces any hits rolled from an earlier one.
        if (actionData.damageData !== undefined) actionData.damageData.hits = [];
        await emitChatFromTemplate(
            AREA_RESOLUTION_TEMPLATE,
            {
                rollId: actionData.id,
                weaponName: rollData.name,
                summary: rollData.areaStatement,
                results: areaResultRows(results),
                sheltered,
                anyHit: results.some((result) => result.hit),
                // A no-damage area weapon (smoke, stun, #601) catches creatures for its
                // qualities only: the card lists who is caught and offers no Roll Damage.
                noDamage: rollData.noDamage,
                _gameSystemId: firstSystemId(rollData.sourceActor),
            },
            { rolls },
        );
    }

    /**
     * Resolve a grenade's rider (#623) from the card that offers it. A damage card (a
     * grenade that deals damage, #622) carries its roll id: the rider resolves against the
     * creatures the attack struck — each area hit's creature, else the card's target. A
     * throw card (a grenade that deals none) carries the rider's placed area in its flags:
     * the rider resolves against the tokens inside it now, the thrower excepted.
     */
    async _resolveRider(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLButtonElement;
        const rollId = btn.dataset['rollId'] ?? '';
        const target = rollId === '' ? await this.#throwCardRiderTarget(btn) : this.#damageCardRiderTarget(btn);
        if (target === null) return;
        btn.disabled = true;
        await resolveRiderAgainst(target.source, target.tokens, {
            rollD100: async () => roll1d100(),
            post: async (card, rolls) => emitChatFromTemplate(RIDER_RESULTS_TEMPLATE, { ...card }, { rolls }),
        });
    }

    /** The grenade and the creatures struck, for a damage card's Resolve Rider. */
    #damageCardRiderTarget(btn: HTMLElement): { source: RiderSource; tokens: RiderToken[] } | null {
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        const rollData = actionData?.rollData;
        const weapon = rollData?.weapon;
        if (rollData == null || weapon?.id == null) return null;
        const isArea = rollData instanceof WeaponRollData && rollData.areaResults.length > 0;
        const struck = isArea
            ? rollData.areaResults.filter((result) => result.hit).map((result) => canvas.tokens?.get(result.tokenId) ?? null)
            : [activeTokenOf(rollData.targetActor)];
        // What each creature suffered from the hits, for a rider whose test scales with it (#698).
        const hits = actionData?.damageData?.hits ?? [];
        const tokens = struck.flatMap((token) =>
            token === null
                ? []
                : [{ id: token.id, name: token.name, actor: token.actor, damageSuffered: riderDamageSuffered(hits, token.actor?.uuid ?? '', !isArea) }],
        );
        return {
            source: { item: { id: weapon.id, name: weapon.name, uuid: weapon.uuid, system: weapon.system }, thrower: rollData.sourceActor ?? null },
            tokens,
        };
    }

    /** The grenade and the tokens inside its placed area, for a throw card's Resolve Rider. */
    async #throwCardRiderTarget(btn: HTMLElement): Promise<{ source: RiderSource; tokens: RiderToken[] } | null> {
        const messageId = btn.closest<HTMLElement>('[data-message-id]')?.dataset['messageId'];
        const message = messageId === undefined ? undefined : game.messages.get(messageId);
        const flag = message === undefined ? null : readRiderThrowFlag(message.getFlag(SYSTEM_ID, GRENADE_RIDER_FLAG));
        const thrower = flag === null ? null : await this.#actorFromUuid(flag.actorUuid);
        const source = flag === null || thrower === null ? null : riderSourceOf(thrower, flag.itemId);
        if (flag === null || source === null) {
            ui.notifications.warn(t('WH40K.GrenadeRider.NoArea'));
            return null;
        }
        const throwerTokenIds = new Set((source.thrower?.getActiveTokens() ?? []).map((token) => token.id));
        const caught = tokensInAreaTemplate(flag, throwerTokenIds);
        if (caught === null) {
            ui.notifications.warn(t('WH40K.GrenadeRider.NoArea'));
            return null;
        }
        // A grenade thrown from its dialog deals no damage, so no creature suffered any.
        return { source, tokens: caught.map((token) => ({ id: token.id, name: token.name, actor: token.actor, damageSuffered: 0 })) };
    }

    async _refundResources(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const actionData = this.#resolveStoredAction(div, game.i18n.localize('WH40K.Notify.Action.ActionDataExpired'));
        if (actionData == null) return;

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.Dialog.Refund.Title'),
            content: game.i18n.localize('WH40K.Dialog.Refund.Content'),
            confirmLabel: game.i18n.localize('WH40K.Dialog.Refund.Confirm'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });

        if (confirmed) {
            await actionData.refundResources();
            ui.notifications.info(game.i18n.localize('WH40K.Notify.Action.ResourcesRefunded'));
        }
    }

    async _fateReroll(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const actionData = this.#resolveStoredAction(div, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        if (!WH40KSettings.isMultipleFateBurnAllowed() && (actionData.fateUses.reroll || actionData.fateUses.addDoS)) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAlreadySpent'));
            return;
        }

        const sourceActor = actionData.rollData.sourceActor;
        const sourceFate = (sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate?.value ?? 0;
        if (sourceFate <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateInsufficient'));
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.FateRerollConfirmTitle'),
            content: game.i18n.localize('WH40K.FateRerollConfirmContent'),
            confirmLabel: game.i18n.localize('WH40K.FateReroll'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });

        if (confirmed) {
            // Generate new ID for action data
            actionData.id = uuid();
            // Use a FP
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- spendFate is a system extension; may not exist on all WH40KBaseActorDocument subtypes
            await sourceActor?.spendFate?.();
            actionData.fateUses.reroll = true;
            // Refund Initial Resources
            await actionData.refundResources();
            // Reset (preserves fateUses by design — single-spend lockout survives the reroll)
            actionData.reset();
            // Run it back
            await actionData.performActionAndSendToChat();
        }
    }

    /**
     * Generalized re-roll handler for the per-variant card buttons. The global
     * Fate variant (`kind === 'fate'`) delegates to `_fateReroll` (preserving the
     * single-spend fate logic); talent/trait variants apply their declared
     * modifier to the re-rolled test, consume one windowed use, and re-run.
     * Availability is re-derived from the live actor so a stale/duplicated card
     * cannot double-spend a windowed use.
     */
    async _variantReroll(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;

        if ((div.dataset['variantKind'] ?? '') === 'fate') {
            await this._fateReroll(event);
            return;
        }

        const variantId = div.dataset['variantId'] ?? '';
        const modifier = Number.parseInt(div.dataset['variantModifier'] ?? '0', 10) || 0;

        const actionData = this.#resolveStoredAction(div, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;
        const sourceActor = actionData.rollData.sourceActor;
        if (sourceActor == null) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.weapon is a WH40KItem; isMelee/isRanged are DataModel getters not surfaced on that union at this layer
        const reWeapon = actionData.rollData.weapon as { isMelee?: boolean; isRanged?: boolean } | undefined;
        const option = sourceActor
            .getRerollOptions({
                success: actionData.rollData.success,
                type: actionData.rollData.type,
                rollKey: actionData.rollData.rollKey,
                isMelee: reWeapon?.isMelee === true,
                isRanged: reWeapon?.isRanged === true,
            })
            .find((o) => o.id === variantId);
        if (option === undefined || option.disabled) {
            const freq =
                option?.frequency === 'per-session'
                    ? game.i18n.localize('WH40K.Reroll.Frequency.PerSession')
                    : game.i18n.localize('WH40K.Reroll.Frequency.PerEncounter');
            ui.notifications.warn(game.i18n.format('WH40K.Reroll.Exhausted', { frequency: freq }));
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.Reroll.ConfirmTitle'),
            content: game.i18n.format('WH40K.Reroll.ConfirmContent', { source: option.source }),
            confirmLabel: game.i18n.localize('WH40K.Reroll.Button'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });
        if (!confirmed) return;

        // Inject the variant modifier into the re-rolled test: survives reset() and
        // is summed into modifiedTarget + surfaced on the card's modifier breakdown.
        if (modifier !== 0) actionData.rollData.modifiers['reroll'] = modifier;
        actionData.id = uuid();
        await actionData.refundResources();
        actionData.reset();
        await sourceActor.consumeRerollUse(variantId);

        const announcement = game.i18n.format('WH40K.Reroll.UsedChat', { name: sourceActor.name, source: option.source });
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-[var(--wh40k-powers-border)] tw-bg-[var(--wh40k-powers-bg)] tw-text-[var(--wh40k-powers-secondary)] tw-text-[0.85rem]">${announcement}</div>`,
        );

        await actionData.performActionAndSendToChat();
    }

    async _fateAddDoS(event: Event): Promise<void> {
        event.preventDefault();
        const btn = event.currentTarget as HTMLElement;
        const actionData = this.#resolveStoredAction(btn, game.i18n.localize('WH40K.FateActionExpired'));
        if (actionData == null) return;

        if (!actionData.rollData.success) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAddDoSNotSuccess'));
            return;
        }

        if (!WH40KSettings.isMultipleFateBurnAllowed() && (actionData.fateUses.reroll || actionData.fateUses.addDoS)) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateAlreadySpent'));
            return;
        }

        const sourceActor = actionData.rollData.sourceActor;
        const sourceFate = (sourceActor?.system as { fate?: { value?: number } } | undefined)?.fate?.value ?? 0;
        if (sourceFate <= 0) {
            ui.notifications.warn(game.i18n.localize('WH40K.FateInsufficient'));
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.FateAddDoSConfirmTitle'),
            content: game.i18n.localize('WH40K.FateAddDoSConfirmContent'),
            confirmLabel: game.i18n.localize('WH40K.FateAddDoS'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });
        if (!confirmed) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- spendFate is a system extension; may not exist on all WH40KBaseActorDocument subtypes
        await sourceActor?.spendFate?.();
        actionData.fateUses.addDoS = true;
        actionData.rollData.dos += 1;

        // eslint-disable-next-line no-restricted-syntax -- boundary: programmatic actor-name fallback, not a player-facing label
        const actorName = sourceActor?.name ?? 'Actor';
        const announcement = game.i18n.format('WH40K.FateAddDoSChat', {
            name: actorName,
            dos: String(actionData.rollData.dos),
        });
        await postChatCard(
            `<div class="wh40k-rpg tw-font-ui tw-px-3 tw-py-2 tw-rounded-md tw-border tw-border-[var(--wh40k-powers-border)] tw-bg-[var(--wh40k-powers-bg)] tw-text-[var(--wh40k-powers-secondary)] tw-text-[0.85rem]">${announcement}</div>`,
        );
    }

    async _assignDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;

        const location = div.dataset['location'];
        const totalDamage = div.dataset['totalDamage'];
        const totalPenetration = div.dataset['totalPenetration'];
        const totalFatigue = div.dataset['totalFatigue'];
        const damageType = div.dataset['damageType'];
        const isExplosive = div.dataset['isExplosive'];

        const hitData = new Hit();
        hitData.location = resolveHitLocationId(location) ?? DEFAULT_HIT_LOCATION;
        // dataset values are strings; the AssignDamageData consumer parses them.
        /* eslint-disable no-restricted-syntax -- boundary: Hit fields are typed as number but dataset values are strings; cast through unknown is necessary */
        const hitWritable = hitData as unknown as { totalDamage: unknown; totalPenetration: unknown; totalFatigue: unknown };
        /* eslint-enable no-restricted-syntax */
        hitWritable.totalDamage = totalDamage;
        hitWritable.totalPenetration = totalPenetration;
        hitWritable.totalFatigue = totalFatigue;
        hitData.damageType = damageType ?? 'Impact';
        // Handlebars renders booleans as "true"/"false" strings on dataset
        // attributes; coerce explicitly so the DW horde branch reads a real
        // boolean for `magnitudeLossForHit(damage, isExplosive)`.
        hitData.isExplosive = isExplosive === 'true';
        hitData.armourIgnored = div.dataset['armourIgnored'] === 'true';
        // A hit on a vehicle (content#28) carries where it struck; its location is a vehicle location.
        hitData.vehicleStrike = parseVehicleStrike(div.dataset['vehicleStrike']);
        if (hitData.vehicleStrike !== null) hitData.location = hitData.vehicleStrike.location;

        const targetUuid = div.dataset['targetUuid'];

        let targetActor: WH40KBaseActorDocument | undefined;
        if (targetUuid != null && targetUuid !== '') {
            targetActor = (await this.#actorFromUuid(targetUuid)) ?? undefined;
        } else {
            const targetedObjects = game.user.targets;
            if (targetedObjects.size > 0) {
                const token = targetedObjects.values().next().value as CanvasToken;
                targetActor = token.actor as WH40KBaseActorDocument | undefined;
            }
        }
        if (targetActor == null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoTargetActor'));
            return;
        }

        /* eslint-disable no-restricted-syntax -- boundary: AssignDamageData/prepareAssignDamageRoll use untyped system internals; cast through unknown is necessary */
        const assignData = new AssignDamageData(targetActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
        /* eslint-enable no-restricted-syntax */
    }

    async _applyDamage(event: Event): Promise<void> {
        event.preventDefault();
        const div = event.currentTarget as HTMLElement;
        const targetUuid = div.dataset['uuid'];
        const damageType = div.dataset['type'];
        const ignoreArmour = div.dataset['ignoreArmour'];
        const location = div.dataset['location'];
        const damage = div.dataset['damage'];
        const penetration = div.dataset['penetration'];
        const fatigue = div.dataset['fatigue'];

        if (targetUuid == null || targetUuid === '') {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoTargetUuid'));
            return;
        }

        const targetActor = await this.#actorFromUuid(targetUuid);

        if (targetActor == null) {
            ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoActor'));
            return;
        }
        for (const field of [damage, penetration, fatigue]) {
            if (field != null && field !== '' && Number.isNaN(parseInt(field, 10))) {
                ui.notifications.warn(game.i18n.localize('WH40K.Notify.Action.NoDamageToAssign'));
                return;
            }
        }

        const hit = new Hit();
        if (location != null && location !== '') hit.location = resolveHitLocationId(location) ?? location;
        if (damage != null && damage !== '') hit.totalDamage = Number.parseInt(damage, 10);
        if (penetration != null && penetration !== '') hit.totalPenetration = Number.parseInt(penetration, 10);
        if (fatigue != null && fatigue !== '') hit.totalFatigue = Number.parseInt(fatigue, 10);
        if (damageType != null && damageType !== '') hit.damageType = damageType;
        // Handlebars renders booleans as "true"/"false" strings on dataset.
        hit.isExplosive = div.dataset['isExplosive'] === 'true';

        // eslint-disable-next-line no-restricted-syntax -- boundary: AssignDamageData accepts untyped system ActorLike; cast through unknown is necessary
        const assignDamageData = new AssignDamageData(targetActor as unknown as ActorLike, hit);
        if (ignoreArmour === 'true' || ignoreArmour === 'TRUE') {
            assignDamageData.ignoreArmour = true;
        }

        assignDamageData.update();
        await assignDamageData.finalize();
        await assignDamageData.performActionAndSendToChat();
    }

    assignDamageTool(): void {
        const sourceToken = DHTargetedActionManager.getSourceToken();
        const sourceActor = sourceToken?.actor as WH40KBaseActorDocument | undefined;
        if (sourceActor == null) return;

        const hitData = new Hit();
        /* eslint-disable no-restricted-syntax -- boundary: AssignDamageData/prepareAssignDamageRoll use untyped system internals; cast through unknown is necessary */
        const assignData = new AssignDamageData(sourceActor as unknown as ActorLike, hitData);
        prepareAssignDamageRoll(assignData as unknown as Record<string, unknown>);
        /* eslint-enable no-restricted-syntax */
    }

    /** The actor a UUID names: an Actor, or the actor of a token document. Null when it resolves to neither. */
    async #actorFromUuid(documentUuid: string): Promise<WH40KBaseActorDocument | null> {
        const doc = await fromUuid(documentUuid);
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns an untyped document that may be a TokenDocument carrying .actor
        const actor = doc instanceof Actor ? doc : (doc as unknown as { actor?: unknown } | null)?.actor;
        // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid's Actor is narrowed by instanceof; the system's document type is not surfaced on it
        return actor instanceof Actor ? (actor as unknown as WH40KBaseActorDocument) : null;
    }

    getActionData(id: string | undefined): ActionData | null {
        if (id == null || id === '') return null;
        return this.storedRolls[id] ?? null;
    }

    /**
     * Resolve the stored ActionData for a clicked control's `data-roll-id`, warning
     * with `expiredMessage` and returning null when the roll has expired. Collapses
     * the `dataset.rollId → getActionData → warn` idiom repeated across the chat
     * action handlers (#278). Callers keep their own early `return` on null.
     */
    #resolveStoredAction(element: HTMLElement, expiredMessage: string): ActionData | null {
        const actionData = this.getActionData(element.dataset['rollId']);
        if (actionData == null) {
            ui.notifications.warn(expiredMessage);
        }
        return actionData;
    }

    storeActionData(actionData: ActionData): void {
        this.storedRolls[actionData.id] = actionData;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied vocalize payload is untyped; Record<string, unknown> is the correct boundary type
    async sendItemVocalizeChat(data: Record<string, unknown>): Promise<void> {
        // Callers set `_gameSystemId` on `data`, so the helper keeps it (#422).
        await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/item-vocalize-chat.hbs', data, { applyWhispers: true });
    }
}

export const DHBasicActionManager = new BasicActionManager();
