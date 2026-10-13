/**
 * @file The defender's Dodge / Parry test, resolved against the attack it answers (#414).
 *
 * Rolled through the defender's own skill pipeline — the unified roll dialog, every
 * situational and condition modifier as a sourced row on the card — and then
 * scored against the attack: a success negates the hit, and against a multi-hit
 * attack each degree of success negates one more (the line's rule, on its
 * game-system config). The card states the result and carries it as a flag, which
 * the client holding the attack applies (`basic-action-manager`). The Reaction is
 * spent once the test resolves.
 */

import { evasionRulesFor } from '../config/game-systems/index.ts';
import { SYSTEM_ID } from '../constants.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { t } from '../i18n/t.ts';
import { spendActionForActor } from '../rules/action-economy.ts';
import { type CounterAttackInput, counterAttackOffer, readCombatRoundStamp, spentCounterAttack } from '../rules/counter-attack.ts';
import { buildCharBonus, collectSkillTestComponents, type DynamicModifierContext, type DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import { type EvasionSkill, evasionHookSituation, evasionNegation } from '../rules/evasion.ts';
import { collectActorStates } from '../rules/situation-tags.ts';
import { weaponParryModifiers } from '../rules/weapon-quality-effects.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';
import { SimpleSkillData } from './action-data.ts';
import { COUNTER_ATTACK_FLAG, type CounterAttackCard, currentCombatRound, parryingWeapon, reactionHookSources } from './counter-attack-flow.ts';
import { EVASION_OUTCOME_FLAG, type EvasionOutcome, type EvasionPromptContext, evasionOutcomeSummary } from './evasion-flow.ts';
import type { RollModifierComponent } from './roll-data.ts';
import { resolveDegreesMethod } from './roll-helpers.ts';

/** The modifier bucket the attacking weapon's Parry penalty is folded under. */
const ATTACKER_WEAPON_BUCKET = 'attacker-weapon';
/** The modifier bucket the parrying weapon's own qualities are folded under. */
const PARRYING_WEAPON_BUCKET = 'parrying-weapon';
/** The modifier bucket the evader's own dynamic-modifier hooks on the test are folded under. */
const EVASION_HOOK_BUCKET = 'evasion-hooks';

/**
 * The evader's dynamic-modifier hooks on its evasion test, as sourced rows: every
 * additive hook aimed at the test's skill (`target: 'skill'`, `targetKey` =
 * `dodge` / `parry`) whose trigger fires in the evasion's situation. A Parry is
 * evaluated with `isParry`, so `when: 'onParry'` hooks reach the roll (#414). A
 * dice-valued magnitude is rolled here, before the dialog opens, so the dialog
 * and the card show the same number.
 */
async function evasionHookRows(actor: WH40KBaseActor, skill: EvasionSkill): Promise<RollModifierComponent[]> {
    const ctx: DynamicModifierContext = {
        charBonus: buildCharBonus(actor),
        charTotal: {},
        dos: 0,
        pr: 0,
        cb: 0,
        level: 0,
        penetration: 0,
        armourPoints: 0,
    };
    const situation = evasionHookSituation(skill, collectActorStates(actor));
    const rows: RollModifierComponent[] = [];
    for (const component of collectSkillTestComponents(actor.items as Iterable<DynamicModifierItemLike>, ctx, situation, skill)) {
        let value = component.value;
        if (component.valueFormula !== '') {
            const roll = new Roll(component.valueFormula, {});
            // eslint-disable-next-line no-await-in-loop -- sequential by design: each dice-valued hook rolls its own magnitude
            await roll.evaluate();
            value = roll.total ?? 0;
        }
        rows.push({ key: `${EVASION_HOOK_BUCKET}-${rows.length}`, label: component.label, value, source: component.source });
    }
    return rows;
}

/** The weapon a Parry is made with, and the sourced rows its qualities put on the test. */
export interface ParryWeapon {
    /** The weapon's item id ('' for bare hands is never a ParryWeapon — that is null). */
    readonly id: string;
    readonly rows: readonly RollModifierComponent[];
}

export class EvasionActionData extends SimpleSkillData {
    readonly prompt: EvasionPromptContext;
    readonly skill: EvasionSkill;
    /** The weapon the Parry is made with; null for a Dodge or a bare-handed Parry. */
    readonly parryWeapon: ParryWeapon | null;
    /** The outcome, once the test has resolved. */
    outcome: EvasionOutcome | null = null;
    /** The Counter Attack this evasion earned (#603) — rendered as the card's control; null for none. */
    counterAttack: CounterAttackCard | null = null;
    /** The item whose per-round Counter Attack this Parry would have earned but was already used this round (#603); null otherwise. */
    counterAttackSpent: string | null = null;

    constructor(prompt: EvasionPromptContext, skill: EvasionSkill, parryWeapon: ParryWeapon | null = null, hookRows: readonly RollModifierComponent[] = []) {
        super();
        this.prompt = prompt;
        this.skill = skill;
        this.parryWeapon = skill === 'parry' ? parryWeapon : null;
        // A Parry against a Fast weapon (DH1 Inquisitor's Handbook: "a –20 penalty")
        // is a sourced row naming the attacker's weapon, folded into the test target.
        if (skill === 'parry' && prompt.parryPenalty !== 0) {
            const label = t('WH40K.Evasion.AttackerWeaponParryPenalty', { weapon: prompt.weaponName });
            this.#addBucket(ATTACKER_WEAPON_BUCKET, [{ key: ATTACKER_WEAPON_BUCKET, label, value: prompt.parryPenalty, source: prompt.weaponName }]);
        }
        // The parrying weapon's own qualities (Balanced +10, Defensive +15, Unbalanced −10).
        if (this.parryWeapon !== null && this.parryWeapon.rows.length > 0) this.#addBucket(PARRYING_WEAPON_BUCKET, this.parryWeapon.rows);
        // The evader's own data-driven hooks on this test (an `onParry` hook on a Parry).
        if (hookRows.length > 0) this.#addBucket(EVASION_HOOK_BUCKET, hookRows);
    }

    /**
     * The evasion test a character makes against an attack (#414): a Parry is made
     * with the first equipped melee weapon that can parry, whose qualities become
     * sourced rows on the test. The evader's dynamic-modifier hooks on the test's
     * skill are evaluated first, in the evasion's situation, so a Parry fires its
     * `onParry` hooks.
     * @param {WH40KBaseActor} actor  The evading character.
     * @param {EvasionPromptContext} prompt  The attack being evaded.
     * @param {EvasionSkill} skill  The evasion skill.
     */
    static async forActor(actor: WH40KBaseActor, prompt: EvasionPromptContext, skill: EvasionSkill): Promise<EvasionActionData> {
        const hookRows = await evasionHookRows(actor, skill);
        const weapon = skill === 'parry' ? parryingWeapon(actor.items) : null;
        if (weapon === null) return new EvasionActionData(prompt, skill, null, hookRows);
        const line = firstSystemId(actor);
        // eslint-disable-next-line no-restricted-syntax -- boundary: an owned WH40KItem read through the duck-typed QualityItem the quality helpers accept
        const rows = weaponParryModifiers(weapon as Parameters<typeof weaponParryModifiers>[0], line).map((modifier) => ({
            key: `${PARRYING_WEAPON_BUCKET}-${modifier.quality}`,
            label: t('WH40K.Evasion.ParryingWeaponQuality', { quality: CONFIG.wh40k.getQualityLabel(modifier.quality), weapon: weapon.name }),
            value: modifier.value,
            source: weapon.name,
        }));
        return new EvasionActionData(prompt, skill, { id: weapon.id ?? '', rows }, hookRows);
    }

    /** Fold a provenance-bearing bucket into the test: its total on the target, its parts on the card. */
    #addBucket(bucket: string, rows: readonly RollModifierComponent[]): void {
        this.rollData.modifiers[bucket] = rows.reduce((total, row) => total + row.value, 0);
        this.rollData.expandedBuckets[bucket] = [...rows];
    }

    /** Score the test against the attack, state it on the card, flag it for the attacker, and spend the Reaction. */
    override async descriptionText(): Promise<void> {
        await super.descriptionText();
        const line = this.rollData.gameSystemId;
        const negation = evasionNegation({
            success: this.rollData.success,
            dos: this.rollData.dos,
            degreesMethod: resolveDegreesMethod(line),
            attack: { action: this.prompt.action, hitsLanded: this.prompt.hitsLanded, storm: this.prompt.storm, twinLinked: this.prompt.twinLinked },
            rules: evasionRulesFor(line),
        });
        const outcome: EvasionOutcome = {
            attackId: this.prompt.attackId,
            defenderName: this.prompt.defenderName,
            skill: this.skill,
            success: this.rollData.success,
            hitsLanded: this.prompt.hitsLanded,
            negated: negation.negated,
            remaining: negation.remaining,
            parts: negation.parts,
        };
        this.outcome = outcome;
        this.chatFlags = { [EVASION_OUTCOME_FLAG]: outcome };
        this.addEffect(t('WH40K.Evasion.EffectTitle'), evasionOutcomeSummary(outcome));

        const defender = this.rollData.sourceActor;
        if (defender === null) return;
        if (defender.id !== null) spendActionForActor(defender.id, 'reaction');
        const input = this.#counterAttackInput(defender);
        this.counterAttack = this.#counterAttackFor(defender, input);
        this.counterAttackSpent = spentCounterAttack(input);
    }

    /** What decides whether this evasion earns a Counter Attack (#603). */
    #counterAttackInput(defender: WH40KBaseActor): CounterAttackInput {
        return {
            skill: this.skill,
            success: this.rollData.success,
            sources: reactionHookSources(defender.items),
            lastUsed: readCombatRoundStamp(defender.getFlag(SYSTEM_ID, COUNTER_ATTACK_FLAG)),
            now: currentCombatRound(game.combat),
        };
    }

    /** The Counter Attack a successful Parry earned this character (#603), or null. */
    #counterAttackFor(defender: WH40KBaseActor, input: CounterAttackInput): CounterAttackCard | null {
        const actorUuid = defender.uuid;
        if (this.prompt.attackerUuid === '' || actorUuid === null) return null;
        const offer = counterAttackOffer(input);
        if (offer === null) return null;
        return {
            ...offer,
            actorUuid,
            attackerUuid: this.prompt.attackerUuid,
            attackerName: this.prompt.attackerName,
            weaponId: this.parryWeapon?.id ?? '',
        };
    }
}
