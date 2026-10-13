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
import { t } from '../i18n/t.ts';
import { spendActionForActor } from '../rules/action-economy.ts';
import { type EvasionSkill, evasionNegation } from '../rules/evasion.ts';
import { SimpleSkillData } from './action-data.ts';
import { EVASION_OUTCOME_FLAG, type EvasionOutcome, type EvasionPromptContext, evasionOutcomeSummary } from './evasion-flow.ts';
import { resolveDegreesMethod } from './roll-helpers.ts';

/** The modifier bucket the attacking weapon's Parry penalty is folded under. */
const ATTACKER_WEAPON_BUCKET = 'attacker-weapon';

export class EvasionActionData extends SimpleSkillData {
    readonly prompt: EvasionPromptContext;
    readonly skill: EvasionSkill;
    /** The outcome, once the test has resolved. */
    outcome: EvasionOutcome | null = null;

    constructor(prompt: EvasionPromptContext, skill: EvasionSkill) {
        super();
        this.prompt = prompt;
        this.skill = skill;
        // A Parry against a Fast weapon (DH1 Inquisitor's Handbook: "a –20 penalty")
        // is a sourced row naming the attacker's weapon, folded into the test target.
        if (skill === 'parry' && prompt.parryPenalty !== 0) {
            const label = t('WH40K.Evasion.AttackerWeaponParryPenalty', { weapon: prompt.weaponName });
            this.rollData.modifiers[ATTACKER_WEAPON_BUCKET] = prompt.parryPenalty;
            this.rollData.expandedBuckets[ATTACKER_WEAPON_BUCKET] = [
                { key: ATTACKER_WEAPON_BUCKET, label, value: prompt.parryPenalty, source: prompt.weaponName },
            ];
        }
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

        const defenderId = this.rollData.sourceActor?.id ?? null;
        if (defenderId !== null) spendActionForActor(defenderId, 'reaction');
    }
}
