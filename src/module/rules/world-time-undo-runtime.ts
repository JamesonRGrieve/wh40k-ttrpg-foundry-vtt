/**
 * Apply the world-time undo (#703): wind the clock back over the last advance
 * and put back what that advance changed. The pure rules (record shape, which
 * restores apply) are in `world-time-undo.ts`; this is the Foundry-facing half.
 */

import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { canUndoAdvance, expiredByAdvance, fatigueToRestore, type TimedEffectState } from './world-time-undo.ts';

/** The slice of an ActiveEffect the expiry restore reads and writes. */
interface UndoEffect {
    _source: { duration: { expired: boolean } };
    start: { time: number } | null;
    duration: { units: string; seconds: number };
    update: (data: object) => Promise<object | undefined>;
}

/** The slice of an actor the undo reads and writes. */
interface UndoActor {
    id: string | null;
    fatigueLevel?: number | null;
    restoreFatigueLevel?: (level: number) => Promise<void>;
    allApplicableEffects: () => Iterable<UndoEffect>;
}

/** What an undo did, for the widget's notice. */
export type UndoOutcome = { kind: 'none' } | { kind: 'stale' } | { kind: 'undone'; seconds: number; fatigueRestored: number; effectsRestored: number };

/** The world's actors: the ones the advance recovered fatigue on. */
function worldActors(): UndoActor[] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.actors holds Foundry Actor documents; narrowed to the surface the undo touches
    return game.actors.contents as unknown as UndoActor[];
}

/** Each unlinked token's own (synthetic) actor, whose effects live on the token, not the world actor. */
function unlinkedTokenActors(): UndoActor[] {
    // eslint-disable-next-line no-restricted-syntax -- boundary: TokenDocument#actor (an unlinked token's synthetic actor) is a Foundry document
    const tokens = game.scenes.contents.flatMap((scene) => scene.tokens.contents) as unknown as Array<{ actorLink: boolean; actor: UndoActor | null }>;
    return tokens.flatMap((token) => (!token.actorLink && token.actor !== null ? [token.actor] : []));
}

function timedState(effect: UndoEffect): TimedEffectState {
    return {
        expired: effect._source.duration.expired,
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONST.ACTIVE_EFFECT_TIME_DURATION_UNITS is Foundry's frozen list of time units
        timeBased: (CONST.ACTIVE_EFFECT_TIME_DURATION_UNITS as readonly string[]).includes(effect.duration.units),
        startTime: effect.start?.time ?? null,
        seconds: effect.duration.seconds,
    };
}

/** Put an effect back in Foundry's expiry registry, which dropped it when it ran out. */
function reRegister(effect: UndoEffect): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: ActiveEffect.registry (V14 ActiveEffectRegistry) is not in the shipped typings
    (foundry.documents.ActiveEffect as unknown as { registry: { add: (e: UndoEffect) => unknown } }).registry.add(effect);
}

/**
 * Undo the last forward advance. The clock goes back first, so the restored
 * effects have time remaining when they are re-registered; the record is dropped
 * before the rewind so the rewind itself is never recorded.
 */
export async function undoLastWorldTimeAdvance(): Promise<UndoOutcome> {
    const record = WH40KSettings.getLastWorldTimeAdvance();
    if (record === null) return { kind: 'none' };
    if (!canUndoAdvance(record, game.time.worldTime)) return { kind: 'stale' };

    await WH40KSettings.setLastWorldTimeAdvance(null);
    await game.time.advance(record.from - record.to);

    // A synthetic actor shares its base actor's id, so fatigue looks up world actors only.
    const world = worldActors();
    const byId = new Map(world.flatMap((actor) => (actor.id === null ? [] : [[actor.id, actor] as const])));
    const fatigue = fatigueToRestore(record, (id) => byId.get(id)?.fatigueLevel ?? null);
    for (const change of fatigue) {
        // eslint-disable-next-line no-await-in-loop -- sequential per-actor updates; a handful of actors on a rare GM action
        await byId.get(change.actorId)?.restoreFatigueLevel?.(change.before);
    }

    let effectsRestored = 0;
    for (const actor of [...world, ...unlinkedTokenActors()]) {
        for (const effect of actor.allApplicableEffects()) {
            if (!expiredByAdvance(timedState(effect), record)) continue;
            // eslint-disable-next-line no-await-in-loop -- sequential per-effect updates; only effects the advance ran out
            await effect.update({ 'duration.expired': false });
            reRegister(effect);
            effectsRestored += 1;
        }
    }
    return { kind: 'undone', seconds: record.to - record.from, fatigueRestored: fatigue.length, effectsRestored };
}
