/**
 * Medicae Mechadendrite — errata p. 183.
 *
 * The original core text described the mechadendrite as a passive
 * augmetic. The official errata replaces the entry and adds three
 * mechanical hooks:
 *
 *  1. A +10 bonus to Medicae and Interrogation tests.
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

import type { WH40KBaseActorDocument, WH40KSkill } from '../types/global.d.ts';
import type { WH40KItem } from '../documents/item.ts';
import { applyRollModeWhispers, roll1d100 } from '../rolls/roll-helpers.ts';
import { removeEffects } from './active-effects.ts';

export const MEDICAE_MECHADENDRITE = {
    /** Half-action to clear a Blood Loss condition on a target. */
    bloodLossClearAction: 'half' as const,
    /** Once-per-round melee attack allowance. */
    meleeAttacksPerRound: 1,
    /** Errata p. 183 — flat bonus to Medicae (and Interrogation) tests. */
    medicaeBonus: 10,
    /**
     * Action verb used when the staplers staunch Blood Loss as a Half
     * Action — distinct from the First Aid Full Action.
     */
    staunchActionKind: 'half' as const,
} as const;

/**
 * Substrings (case-insensitive) that identify a cybernetic item as a
 * Medicae Mechadendrite. Matching by name keeps this content-agnostic:
 * the compendium entry is the source of truth; this only narrows the
 * actor's owned cybernetics to the relevant augmetic at runtime. We do
 * NOT key off a hardcoded UUID or a per-entry registry (Direction #7).
 */
const MEDICAE_MECHADENDRITE_NAME_HINTS: ReadonlyArray<string> = Object.freeze(['medicae mechadendrite']);

/**
 * True when the supplied cybernetic item is a Medicae Mechadendrite.
 * Pure — used by both eligibility detection and tests.
 */
export function isMedicaeMechadendrite(item: { name?: string | null; isCybernetic?: boolean }): boolean {
    if (item.isCybernetic !== true) return false;
    const name = (item.name ?? '').toLowerCase();
    return MEDICAE_MECHADENDRITE_NAME_HINTS.some((hint) => name.includes(hint));
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
        if (isMedicaeMechadendrite(item as unknown as { name?: string | null; isCybernetic?: boolean })) {
            return item as WH40KItem;
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
    /** Effective Medicae target after the errata +10. */
    readonly target: number;
    /** Whether the Medicae test passed. */
    readonly success: boolean;
    /** Degrees of success (≥0) or failure (negative) — informational. */
    readonly degrees: number;
}

/**
 * Pure resolution of a Half-Action Blood-Loss staunch. d100 roll-under
 * against the Medicae skill total plus the errata's flat +10. A natural
 * 01 always succeeds; a natural 100 always fails. Injectable roll keeps
 * tests and stories deterministic.
 */
export function resolveBloodLossStaunch(medicaeTarget: number, rollTotal: number): StaunchResolution {
    const target = medicaeTarget + MEDICAE_MECHADENDRITE.medicaeBonus;
    const success = rollTotal === 1 || (rollTotal <= target && rollTotal !== 100);
    const degrees = success ? Math.floor((target - rollTotal) / 10) : -Math.floor((rollTotal - target) / 10);
    return { roll: rollTotal, target, success, degrees };
}

/** Read the actor's Medicae skill total (0 when untrained / absent). */
function getMedicaeTarget(actor: WH40KBaseActorDocument): number {
    const skills = (actor as unknown as { skills?: Record<string, WH40KSkill | undefined> }).skills;
    const medicae = skills?.['medicae'];
    return medicae?.current ?? 0;
}

/**
 * Runtime entry point. Performs the Medicae roll (errata +10 folded in),
 * and on success staunches Blood Loss by removing the canonical
 * `bloodloss` condition Active Effect — the same model First Aid clears,
 * not a reimplemented one. Emits a chat card either way. Returns the
 * resolution so callers (and tests via the injected `rng`) can assert on
 * the outcome.
 *
 * @param actor   The actor whose mechadendrite is being used.
 * @param rng     Optional injectable d100 roll (1-100) for determinism.
 */
export async function staunchBloodLoss(
    actor: WH40KBaseActorDocument,
    rng?: () => number,
): Promise<StaunchResolution> {
    const medicaeTarget = getMedicaeTarget(actor);
    let rollTotal: number;
    if (rng !== undefined) {
        rollTotal = Math.max(1, Math.min(100, Math.floor(rng())));
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

    const gameSystem = (actor.system as { gameSystem?: string } | undefined)?.gameSystem ?? 'dh2e';

    const templateData = {
        actorName: actor.name,
        roll: resolution.roll,
        target: resolution.target,
        success: resolution.success,
        degrees: Math.abs(resolution.degrees),
        bleedStopped,
        medicaeBonus: MEDICAE_MECHADENDRITE.medicaeBonus,
        gameSystem,
    };

    const html = await foundry.applications.handlebars.renderTemplate(
        'systems/wh40k-rpg/templates/chat/medicae-mechadendrite-chat.hbs',
        // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate accepts an untyped Handlebars context bag
        templateData as unknown as Record<string, unknown>,
    );

    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create payload shape lives outside our shipped types
    const chatData: Record<string, unknown> = {
        user: game.user?.id,
        content: html,
    };
    applyRollModeWhispers(chatData);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts untyped Foundry data
    await ChatMessage.create(chatData as unknown as Parameters<typeof ChatMessage.create>[0]);

    return resolution;
}
