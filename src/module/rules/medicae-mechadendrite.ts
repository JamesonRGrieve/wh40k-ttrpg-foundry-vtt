/**
 * Medicae Mechadendrite — errata p. 183.
 *
 * The original core text described the mechadendrite as a passive
 * augmetic. The official errata replaces the entry and adds three
 * mechanical hooks:
 *
 *  1. A +10 bonus to Medicae and Interrogation tests — authored on the
 *     cybernetic document's `modifiers.skills` and already folded into the
 *     bearer's skill totals by the central item-modifier path, so it is
 *     never added again here.
 *  2. The flesh-staplers may staunch Blood Loss as a **Half Action**
 *     (faster than the standard First Aid Full Action).
 *  3. Once per round the mechadendrite may be used as a melee weapon
 *     (Half Action or Reaction Standard Attack; Balanced, 1d5 Rending,
 *     Pen 0) in addition to its medicae use.
 *
 * This module is pure logic plus one runtime entry point. The dialog
 * (`medicae-mechadendrite-dialog.ts`) gates a "Staunch Blood Loss
 * (Half Action)" button on `actorHasMedicaeMechadendrite()`, then calls
 * `staunchBloodLoss()`. The blood-loss model is NOT reimplemented here —
 * the `bloodloss` condition Active Effect (see
 * `src/module/rules/active-effects.ts`) is the single source of truth;
 * a successful staunch removes it via the shared `removeEffects()` and a
 * stabilising effect mirrors the Unconscious-stable handling already used
 * by First Aid.
 */

import type { WH40KItem } from '../documents/item.ts';
import { emitChatFromTemplate, getDegreeForMode, isD100Success, roll1d100 } from '../rolls/roll-helpers.ts';
import type { WH40KBaseActorDocument, WH40KSkill } from '../types/global.d.ts';
import { type Rng, rollD100 } from './_dice.ts';
import { removeEffects } from './active-effects.ts';

export const MEDICAE_MECHADENDRITE = {
    /** Half-action to clear a Blood Loss condition on a target. */
    bloodLossClearAction: 'half' as const,
    /** Once-per-round melee attack allowance. */
    meleeAttacksPerRound: 1,
    /**
     * Action verb used when the staplers staunch Blood Loss as a Half
     * Action — distinct from the First Aid Full Action.
     */
    staunchActionKind: 'half' as const,
} as const;

/** The Medicae Mechadendrite document's `system.identifier` (camelCase form). */
const MEDICAE_MECHADENDRITE_IDENTIFIER = 'medicaeMechadendrite';

/** Normalise a kebab-case identifier to camelCase, so `medicae-mechadendrite` and `medicaeMechadendrite` compare equal. */
function camelIdentifier(identifier: string): string {
    return identifier.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/** The owned-item surface the mechadendrite readers need. */
interface MechadendriteItemLike {
    isCybernetic?: boolean;
    system?: { identifier?: string; modifiers?: { skills?: Record<string, number | undefined> } };
}

/**
 * True when the supplied cybernetic item is a Medicae Mechadendrite, matched by
 * its document `system.identifier` (never its name). Pure.
 */
export function isMedicaeMechadendrite(item: MechadendriteItemLike): boolean {
    if (item.isCybernetic !== true) return false;
    return camelIdentifier(item.system?.identifier ?? '') === MEDICAE_MECHADENDRITE_IDENTIFIER;
}

/**
 * The Medicae bonus the mechadendrite's document authors (`modifiers.skills.medicae`),
 * for display only — the central item-modifier path has already added it to the
 * bearer's Medicae total. 0 when the document authors none.
 */
export function mechadendriteMedicaeBonus(item: MechadendriteItemLike | null): number {
    return item?.system?.modifiers?.skills?.['medicae'] ?? 0;
}

/**
 * The Half-Action staunch is errata-gated to the FFG d100 family. DH2 is
 * the canonical default; the errata path also applies to its siblings,
 * but Imperium Maledictum does not ship the FFG mechadendrite entry, so
 * the gate excludes it. Returning `true` for the six FFG systems and
 * `false` for `im` keeps homologation explicit rather than accidental.
 */
export function isMedicaeMechadendriteSystem(gameSystem: string | undefined): boolean {
    return gameSystem !== undefined && gameSystem !== 'im';
}

/**
 * Find the actor's Medicae Mechadendrite cybernetic, if any. Eligibility
 * for the Half-Action staunch requires both a matching cybernetic AND a
 * non-IM (FFG-family) game system.
 */
export function findMedicaeMechadendrite(actor: WH40KBaseActorDocument): WH40KItem | null {
    const gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem;
    if (!isMedicaeMechadendriteSystem(gameSystem)) return null;
    for (const item of actor.items) {
        if (isMedicaeMechadendrite(item)) {
            return item;
        }
    }
    return null;
}

/** True when the actor may invoke the Half-Action Blood-Loss staunch. */
export function actorHasMedicaeMechadendrite(actor: WH40KBaseActorDocument): boolean {
    return findMedicaeMechadendrite(actor) !== null;
}

/** Outcome of resolving a Half-Action Blood-Loss staunch. */
export interface StaunchResolution {
    /** d100 roll total. */
    readonly roll: number;
    /** The Medicae target (the skill total, which already carries the mechadendrite's bonus). */
    readonly target: number;
    /** Whether the Medicae test passed. */
    readonly success: boolean;
    /** Degrees of success (≥0) or failure (negative) — informational. */
    readonly degrees: number;
}

/**
 * Pure resolution of a Half-Action Blood-Loss staunch. d100 roll-under
 * against the Medicae skill total — which already includes the
 * mechadendrite's document-authored bonus. A natural 01 always succeeds;
 * a natural 100 always fails. Injectable roll keeps tests and stories
 * deterministic.
 */
export function resolveBloodLossStaunch(medicaeTarget: number, rollTotal: number): StaunchResolution {
    const target = medicaeTarget;
    const success = isD100Success(rollTotal, target);
    // Degrees route through the shared engine (gen-2 tens-digit method, the DH2
    // default) instead of a hand-rolled margin calculation; sign marks success.
    const degrees = success ? getDegreeForMode('gen2', target, rollTotal) : -getDegreeForMode('gen2', rollTotal, target);
    return { roll: rollTotal, target, success, degrees };
}

/** Read the actor's Medicae skill total (0 when untrained / absent). */
function getMedicaeTarget(actor: WH40KBaseActorDocument): number {
    // eslint-disable-next-line no-restricted-syntax -- boundary: derived `.skills` accessor lives on the WH40KBaseActor prototype but is not (yet) reflected on the document overrides type
    const skills = (actor as unknown as { skills?: Record<string, WH40KSkill | undefined> }).skills;
    const medicae = skills?.['medicae'];
    return medicae?.current ?? 0;
}

/**
 * Runtime entry point. Performs the Medicae roll (the mechadendrite's bonus
 * is already in the skill total),
 * and on success staunches Blood Loss by removing the canonical
 * `bloodloss` condition Active Effect — the same model First Aid clears,
 * not a reimplemented one. Emits a chat card either way. Returns the
 * resolution so callers (and tests via the injected `rng`) can assert on
 * the outcome.
 *
 * @param actor   The actor whose mechadendrite is being used.
 * @param rng     Optional `[0, 1)` float source (the shared `_dice.Rng`
 *                contract) for determinism; routed through `rollD100` so the
 *                injected branch produces a real 1-100 roll rather than the
 *                always-1 result of flooring a fractional value.
 */
export async function staunchBloodLoss(actor: WH40KBaseActorDocument, rng?: Rng): Promise<StaunchResolution> {
    const medicaeTarget = getMedicaeTarget(actor);
    let rollTotal: number;
    if (rng !== undefined) {
        rollTotal = rollD100(rng);
    } else {
        const roll = await roll1d100();
        rollTotal = roll.total ?? 100;
    }

    const resolution = resolveBloodLossStaunch(medicaeTarget, rollTotal);

    let bleedStopped = false;
    if (resolution.success) {
        // Reuse the shared AE remover — the bloodloss condition's flag is
        // the single source of truth; we do not duplicate the model.
        await removeEffects(actor, (effect: ActiveEffect): boolean => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ActiveEffect.flags is an untyped open bag
            const flags = (effect as unknown as { flags?: Record<string, { bloodloss?: boolean } | undefined> }).flags;
            return flags?.['wh40k-rpg']?.bloodloss === true;
        });
        bleedStopped = true;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: `gameSystem` is declared on each concrete actor DataModel (character/NPC/vehicle) but not on the shared WH40KActorSystemData surface this helper is generic over, so a runtime fallback is required
    const gameSystem = (actor.system as { gameSystem?: string }).gameSystem ?? 'dh2';

    const templateData = {
        actorName: actor.name,
        roll: resolution.roll,
        target: resolution.target,
        success: resolution.success,
        degrees: Math.abs(resolution.degrees),
        bleedStopped,
        medicaeBonus: mechadendriteMedicaeBonus(findMedicaeMechadendrite(actor)),
        gameSystem,
    };

    await emitChatFromTemplate(
        'systems/wh40k-rpg/templates/chat/medicae-mechadendrite-chat.hbs',
        // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts an untyped Handlebars context bag
        templateData,
        { applyWhispers: true },
    );

    return resolution;
}
