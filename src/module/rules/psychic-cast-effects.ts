/**
 * What a manifested psychic power applies, and to whom.
 *
 * A power's effects are DATA (Direction #7): its own embedded, non-transfer
 * ActiveEffects. Each one carries what Foundry already models: `changes` for
 * modifiers, `statuses` for conditions, `duration` for how long it lasts. A
 * successful cast copies each onto its recipient. Transfer effects are the
 * power's passive effect on its owner and are never cast.
 *
 * The recipient is the effect's own `flags.wh40k-rpg.castRecipient`
 * (`'self'` | `'target'`). When unset, a power whose target type is `self`
 * affects the psyker and any other power affects its target. A power cast with
 * no target lands on the psyker. Pure.
 */

/** Who a cast effect lands on. */
export type CastRecipient = 'self' | 'target';

const CAST_RECIPIENTS: readonly CastRecipient[] = ['self', 'target'];

/** The slice of an embedded ActiveEffect source this module reads. */
export interface PowerEffectSource {
    name?: string | undefined;
    /** Foundry V14 duration (`{value, units}`); a legacy `{rounds}` source migrates into it. */
    duration?: { value?: number | null | undefined; units?: string | null | undefined; rounds?: number | null | undefined } | undefined;
    transfer?: boolean | undefined;
    flags?: { 'wh40k-rpg'?: { castRecipient?: string | undefined } | undefined } | undefined;
}

/** One effect to create on a recipient: its source data, re-pointed at the casting power. */
export interface CastEffect<T extends PowerEffectSource> {
    recipient: CastRecipient;
    data: Omit<T, '_id'> & { origin: string; transfer: false };
}

function isCastRecipient(value: string | undefined): value is CastRecipient {
    return CAST_RECIPIENTS.some((r) => r === value);
}

/**
 * The effects a manifested power applies.
 * @param effects - the power's embedded ActiveEffect sources
 * @param powerTargetType - the power's `target.type` (`'self'` routes defaults to the psyker)
 * @param powerUuid - stamped as each created effect's `origin`
 * @param hasTarget - whether the cast named a target; without one every effect lands on the psyker
 */
export function castEffectsFor<T extends PowerEffectSource & { _id?: string | null | undefined }>(
    effects: readonly T[],
    powerTargetType: string,
    powerUuid: string,
    hasTarget: boolean,
): CastEffect<T>[] {
    const fallback: CastRecipient = powerTargetType === 'self' ? 'self' : 'target';
    return effects
        .filter((effect) => effect.transfer !== true)
        .map((effect) => {
            const declared = effect.flags?.['wh40k-rpg']?.castRecipient;
            const intended = isCastRecipient(declared) ? declared : fallback;
            const { _id: _dropped, ...rest } = effect;
            return {
                recipient: hasTarget ? intended : 'self',
                data: { ...rest, origin: powerUuid, transfer: false },
            };
        });
}
