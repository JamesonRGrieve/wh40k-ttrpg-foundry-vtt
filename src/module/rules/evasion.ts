/**
 * @file Evasion (#414): a Dodge or Parry resolved against the attack it answers.
 *
 * DH2 core ch. VII, Evasion: "If he succeeds on the test … the hit is negated
 * and the attack is considered to have missed." Against an attack that
 * inflicts several hits, "each degree of success on the Evasion test negates
 * one additional hit" — and against Storm, "each degree of success on the test
 * negates two hits". Which attacks count as multi-hit differs per line, so that
 * part is data on each game-system config ({@link EvasionRules}):
 *
 *   - DH2: Swift / Lightning Attacks, Semi- / Full Auto Bursts, Twin-Linked,
 *     "or any other attacks that would inflict multiple hits"; Storm: two per degree.
 *   - OW: the same list without the catch-all; Storm: two per degree.
 *   - BC: bursts (Dodge) and Swift / Lightning Attacks (Dodge or Parry).
 *   - DH1, RT, DW: Semi- / Full Auto Bursts only.
 *
 * "Participants in a Grapple cannot use Reactions" (every line), and a Reaction
 * is spent per evasion. Parry answers melee only; a Flexible weapon "cannot be
 * Parried" and an Unwieldy one "cannot be used to Parry".
 *
 * Degrees of success are counted the way the line prints them: Gen 2 (DH2)
 * counts the bare success as one degree, Gen 1 counts only full tens of
 * margin. The roll pipeline's `dos` always counts the success as one, so the
 * printed count is `dos` under Gen 2 and `dos − 1` under Gen 1.
 *
 * Pure: no Foundry globals, no document reads.
 */

import type { I18nKey } from '../types/i18n-keys';
import type { ActionLimit } from './condition-mechanics.ts';

/** The two evasion skills. */
export type EvasionSkill = 'dodge' | 'parry';

/** A line's printed rule for which attacks a degree of success can thin out. */
export interface EvasionRules {
    /** Declared actions whose extra hits each degree of success negates. */
    readonly multiHitActions: readonly string[];
    /** Whether a Twin-Linked attack's extra hit counts. */
    readonly twinLinked: boolean;
    /** Whether ANY attack that inflicts several hits counts (DH2's catch-all). */
    readonly anyMultiHit: boolean;
    /** Whether each degree negates two hits against a Storm weapon. */
    readonly stormTwoPerDegree: boolean;
}

/** The attack being evaded, as the evasion sees it. */
export interface EvasionAttack {
    /** The declared action (`Full Auto Burst`, `Swift Attack`, …). */
    readonly action: string;
    /** Hits the attack landed on the evading character. */
    readonly hitsLanded: number;
    /** The attacking weapon carries Storm. */
    readonly storm: boolean;
    /** The attacking weapon carries Twin-Linked. */
    readonly twinLinked: boolean;
}

/**
 * One provenance-bearing part of the hits an evasion negated, for the card:
 *   - `hit`     — the hit a success negates;
 *   - `degrees` — one more per printed degree of success (multi-hit attacks);
 *   - `storm`   — two per degree against Storm;
 *   - `cap`     — the cut to the hits that actually landed.
 */
export interface EvasionNegationPart {
    readonly key: 'hit' | 'degrees' | 'storm' | 'cap';
    readonly value: number;
}

/** What an evasion test did to the attack. */
export interface EvasionNegation {
    /** Hits negated (never more than landed). */
    readonly negated: number;
    /** Hits that still land. */
    readonly remaining: number;
    /** Whether the attack counted as multi-hit for this line. */
    readonly multiHit: boolean;
    /** The parts {@link negated} is built from; they sum to it. */
    readonly parts: readonly EvasionNegationPart[];
}

/** Whether a line lets degrees of success thin out this attack. */
export function isMultiHitAttack(attack: EvasionAttack, rules: EvasionRules | null): boolean {
    if (rules === null || attack.hitsLanded <= 1) return false;
    if (rules.anyMultiHit) return true;
    if (rules.multiHitActions.includes(attack.action)) return true;
    return rules.twinLinked && attack.twinLinked;
}

/** Inputs to {@link evasionNegation}. */
export interface EvasionNegationInput {
    readonly success: boolean;
    /** The roll pipeline's degrees of success (≥ 1 on a success; counts the success itself). */
    readonly dos: number;
    /** How the evading actor's line counts degrees. */
    readonly degreesMethod: 'gen1' | 'gen2';
    readonly attack: EvasionAttack;
    /** The line's multi-hit rule, or null for a line that models only the single negated hit. */
    readonly rules: EvasionRules | null;
}

/**
 * The hits an evasion test negates.
 * @param {EvasionNegationInput} input  The test result, the attack and the line's rule.
 * @returns {EvasionNegation}  Hits negated and remaining, with their parts.
 */
export function evasionNegation(input: EvasionNegationInput): EvasionNegation {
    const landed = Math.max(0, Math.trunc(input.attack.hitsLanded));
    if (!input.success || landed === 0) return { negated: 0, remaining: landed, multiHit: false, parts: [] };

    const multiHit = isMultiHitAttack(input.attack, input.rules);
    const dos = Number.isFinite(input.dos) ? Math.max(1, Math.trunc(input.dos)) : 1;
    const printedDegrees = input.degreesMethod === 'gen1' ? dos - 1 : dos;

    let parts: EvasionNegationPart[];
    if (!multiHit) {
        parts = [{ key: 'hit', value: 1 }];
    } else if (input.attack.storm && input.rules?.stormTwoPerDegree === true) {
        // "each degree of success on the test negates two hits" — and a bare Gen 1
        // success, with no printed degree, still negates the hit (two Storm shots).
        parts = [{ key: 'storm', value: 2 * Math.max(1, printedDegrees) }];
    } else {
        parts = [{ key: 'hit', value: 1 }];
        if (printedDegrees > 0) parts.push({ key: 'degrees', value: printedDegrees });
    }

    const raw = parts.reduce((sum, part) => sum + part.value, 0);
    const negated = Math.min(raw, landed);
    if (negated < raw) parts.push({ key: 'cap', value: negated - raw });
    return { negated, remaining: landed - negated, multiHit, parts };
}

/** What the evading actor's state allows. */
export interface EvasionGate {
    /** Reactions left this round, or null out of combat (no budget to spend). */
    readonly reactionRemaining: number | null;
    /** The governing condition action limit. */
    readonly actionLimit: ActionLimit;
    /** The actor is a participant in a grapple (controlling or controlled). */
    readonly inGrapple: boolean;
}

/**
 * Why the actor cannot evade at all, or null when it can.
 * @param {EvasionGate} gate  The actor's reaction budget, conditions and grapple state.
 * @returns {I18nKey | null}  The refusal, or null.
 */
export function evasionBlockReason(gate: EvasionGate): I18nKey | null {
    // "Participants in a Grapple cannot use Reactions." The Grappled condition
    // (`grappleOnly`) and the grapple controller's flag both make a participant.
    if (gate.inGrapple || gate.actionLimit === 'grappleOnly') return 'WH40K.Evasion.Blocked.Grappled';
    if (gate.reactionRemaining !== null && gate.reactionRemaining <= 0) {
        return gate.actionLimit === 'noActions' ? 'WH40K.Combat.ReactionBlockedByCondition' : 'WH40K.Combat.ReactionUsed';
    }
    return null;
}

/** What decides whether a Parry is open, beyond the actor's own state. */
export interface ParryGate {
    /** The attack is a melee attack. */
    readonly isMeleeAttack: boolean;
    /** The attacking weapon cannot be Parried (Flexible). */
    readonly attackerPreventsParry: boolean;
    /** Whether each melee weapon the defender holds can parry; empty = unarmed. */
    readonly defenderWeaponsCanParry: readonly boolean[];
}

/**
 * Why a Parry is closed for this attack, or null when it is open.
 * @param {ParryGate} gate  The attack's kind, the attacking weapon and the defender's weapons.
 * @returns {I18nKey | null}  The refusal, or null.
 */
export function parryBlockReason(gate: ParryGate): I18nKey | null {
    if (!gate.isMeleeAttack) return 'WH40K.Evasion.Blocked.ParryRanged';
    if (gate.attackerPreventsParry) return 'WH40K.Evasion.Blocked.Flexible';
    // Bare hands can parry; a defender holding only weapons that cannot (Unwieldy) cannot.
    if (gate.defenderWeaponsCanParry.length > 0 && !gate.defenderWeaponsCanParry.includes(true)) return 'WH40K.Evasion.Blocked.Unwieldy';
    return null;
}

/**
 * Remove the hits an evasion negated from an attack's allocation: the LAST
 * `negated` hits that landed on the evading (declared) target. Hits a burst moved
 * onto other targets are theirs to evade, and the first hit — the one whose
 * location the attack roll set — is the last to go.
 * @param {readonly T[]} allocation  The attack's hits, in order.
 * @param {string} evaderId  The evading target's allocation id.
 * @param {number} negated  Hits the evasion negated.
 * @returns {T[]}  The hits that still land.
 */
export function withoutNegatedHits<T extends { readonly target: { readonly id: string } }>(allocation: readonly T[], evaderId: string, negated: number): T[] {
    let toDrop = Math.max(0, Math.trunc(negated));
    const kept: T[] = [];
    for (const hit of [...allocation].reverse()) {
        if (toDrop > 0 && hit.target.id === evaderId) {
            toDrop--;
            continue;
        }
        kept.unshift(hit);
    }
    return kept;
}

/** How many hits of an allocation land on the evading target. */
export function hitsOnTarget(allocation: readonly { readonly target: { readonly id: string } }[], evaderId: string): number {
    return allocation.filter((hit) => hit.target.id === evaderId).length;
}
