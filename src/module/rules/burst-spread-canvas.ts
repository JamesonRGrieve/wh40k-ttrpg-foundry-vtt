/**
 * @file Canvas adapter for burst hit-spreading (#513).
 *
 * The eligibility rule is pure and lives in `burst-spread.ts`; this is the half
 * that has to touch the scene. It finds the tokens near the declared target and
 * measures what each would have cost to hit, then hands them to that rule.
 *
 * Split this way for a specific reason: the RAW constraint ("within two metres,
 * none harder to hit") is testable, and a canvas walk is not. Fusing them would
 * have left the rule itself unverifiable.
 *
 * Note the system deliberately refuses multi-token targeting
 * (`targeted-action-manager.ts` warns "Multi-token targeting is not yet added"),
 * which is correct for RAW here: the attacker declares ONE target, and extra hits
 * may then be moved onto nearby enemies. So the candidates are derived from the
 * scene rather than from what the player targeted.
 */

import { calculateTokenDistance } from '../utils/range-calculator.ts';
import { eligibleSpreadTargets, type SpreadCandidate } from './burst-spread.ts';
import type { AllocationTarget } from './hit-allocation.ts';
import { targetSizeModifier } from './target-size.ts';

/* eslint-disable no-restricted-syntax -- boundary: Foundry canvas placeables and their actor `system` are loosely-typed framework surfaces; every read below is structural and guarded */

/** The token surface this adapter reads. */
interface TokenLike {
    id?: string | null | undefined;
    name?: string | null | undefined;
    actor?: { system?: { size?: number | string | null | undefined } | null | undefined } | null | undefined;
    document?: { disposition?: number | null | undefined } | null | undefined;
}

/** Foundry's numeric disposition for a friendly token; excluded from spread candidates. */
const DISPOSITION_FRIENDLY = 1;

/** Read a token's size as the number `targetSizeModifier` expects, defaulting to average. */
function sizeOf(token: TokenLike): number {
    const raw = token.actor?.system?.size;
    const n = typeof raw === 'string' ? Number(raw) : raw;
    return typeof n === 'number' && Number.isFinite(n) ? n : 4;
}

/**
 * Find the targets a burst's extra hits may be spread onto.
 *
 * Returns an empty list when there is no declared target or no canvas, so the
 * caller falls back to single-target allocation unchanged.
 *
 * Friendly tokens are excluded. RAW does not forbid hitting an ally with a stray
 * burst, but silently auto-allocating hits onto the party is a far worse failure
 * than omitting them — a GM who wants that can assign it manually.
 * @param {TokenLike | null | undefined} declaredTarget  The token the attacker declared.
 * @returns {AllocationTarget[]}  Eligible spread targets, nearest first.
 */
export function findSpreadTargets(declaredTarget: TokenLike | null | undefined): AllocationTarget[] {
    if (declaredTarget === null || declaredTarget === undefined) return [];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: the compiler types `canvas.tokens` as always present, but it is undefined before the scene draws and in headless contexts (tests, chat re-render), where this must degrade to "no spread targets" rather than throw
    const placeables = canvas?.tokens?.placeables;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive: see above
    if (placeables === null || placeables === undefined) return [];

    const originalToHitModifier = targetSizeModifier(sizeOf(declaredTarget));
    const candidates: SpreadCandidate[] = [];
    for (const token of placeables as unknown as TokenLike[]) {
        if (token.id === declaredTarget.id) continue;
        if (token.actor === null || token.actor === undefined) continue;
        if (token.document?.disposition === DISPOSITION_FRIENDLY) continue;
        const id = token.id;
        if (typeof id !== 'string') continue;
        candidates.push({
            id,
            name: typeof token.name === 'string' ? token.name : id,
            metresFromOriginal: calculateTokenDistance(
                declaredTarget as unknown as foundry.canvas.placeables.Token,
                token as unknown as foundry.canvas.placeables.Token,
            ),
            toHitModifier: targetSizeModifier(sizeOf(token)),
        });
    }

    return eligibleSpreadTargets({ originalToHitModifier, candidates });
}

/* eslint-enable no-restricted-syntax */
