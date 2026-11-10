/**
 * Undo the last world-time advance (#703).
 *
 * The GM's clock only moves forward, so a misclick (a day instead of an hour)
 * used to need a hand edit of world time. An advance changes three things:
 *   - **fatigue** recovers over the elapsed hours (#431), written to each actor;
 *   - **timed effects** whose duration ran out are marked expired by Foundry
 *     (`duration.expired`, the default `CONFIG.ActiveEffect.expiryAction`);
 *   - **time gates** (#455) open, but a gate is an absolute world-time stamp, so
 *     winding the clock back closes it again with no write.
 *
 * Each forward advance stores one record: where the clock was, where it went,
 * and every fatigue level it changed. Undo winds the clock back to `from`, puts
 * back each fatigue level nothing has touched since, and clears the expiry of
 * every time-based effect whose end fell inside the advanced window. One level:
 * the next advance replaces the record, and any other backward move drops it.
 *
 * This module is the pure half: the record's shape, its parse, and which
 * restores apply. The widget and `HooksManager.onUpdateWorldTime` do the writes.
 */

/** One actor's fatigue before and after an advance's recovery. */
export interface FatigueChange {
    actorId: string;
    before: number;
    after: number;
}

/** The last forward advance of the world clock. */
export interface LastAdvance {
    /** World time before the advance. */
    from: number;
    /** World time after it. */
    to: number;
    fatigue: FatigueChange[];
}

/** The slice of an ActiveEffect the expiry restore reads. */
export interface TimedEffectState {
    /** The stored `duration.expired` flag. */
    expired: boolean;
    /** Whether the duration is measured in time units (seconds … years), not rounds or turns. */
    timeBased: boolean;
    /** `start.time`: the world time the effect began; null when it has no start. */
    startTime: number | null;
    /** The duration in seconds. */
    seconds: number;
}

/*
 * Validation is hand-written, not Zod, for the reason `scene-lighting.ts` gives:
 * the system ships unbundled tsc output, so a bare `zod` import fails in the browser.
 */

/** One value of the parsed JSON setting. */
type JsonValue = string | number | boolean | object | null;

/** A finite number, else null. */
function finite(value: JsonValue): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One stored fatigue change, or null when any field is missing or mistyped. */
function toFatigueChange(value: JsonValue): FatigueChange | null {
    if (typeof value !== 'object' || value === null || !('actorId' in value) || !('before' in value) || !('after' in value)) return null;
    const { actorId } = value;
    const before = finite(value.before as JsonValue);
    const after = finite(value.after as JsonValue);
    if (typeof actorId !== 'string' || actorId === '' || before === null || after === null) return null;
    return { actorId, before, after };
}

/**
 * Read a stored record. Anything malformed, or a record that does not move the
 * clock forward, reads as no record, so the widget offers no undo.
 * @param raw  The parsed `world-time-last-advance` setting.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: a world setting value is untyped until the field checks below
export function parseLastAdvance(raw: unknown): LastAdvance | null {
    if (typeof raw !== 'object' || raw === null || !('from' in raw) || !('to' in raw)) return null;
    const from = finite(raw.from as JsonValue);
    const to = finite(raw.to as JsonValue);
    if (from === null || to === null || to <= from) return null;
    // The setting is parsed JSON, so each entry is a JSON value.
    const entries = 'fatigue' in raw && Array.isArray(raw.fatigue) ? (raw.fatigue as JsonValue[]) : [];
    const fatigue = entries.flatMap((entry) => {
        const change = toFatigueChange(entry);
        return change === null ? [] : [change];
    });
    return { from, to, fatigue };
}

/** An undo applies only while the clock still sits where the advance left it. */
export function canUndoAdvance(record: LastAdvance | null, now: number): record is LastAdvance {
    return record !== null && now === record.to;
}

/**
 * The fatigue levels to put back: each one the advance changed and that still
 * reads its after-advance value. A level changed since (damage, a rest, a hand
 * edit) is the table's newer truth and is left alone.
 */
export function fatigueToRestore(record: LastAdvance, currentLevel: (actorId: string) => number | null): FatigueChange[] {
    return record.fatigue.filter((change) => currentLevel(change.actorId) === change.after);
}

/** Did this effect run out inside the advanced window, so the undo must clear its expiry? */
export function expiredByAdvance(effect: TimedEffectState, record: LastAdvance): boolean {
    if (!effect.expired || !effect.timeBased || effect.startTime === null) return false;
    const end = effect.startTime + effect.seconds;
    return end > record.from && end <= record.to;
}
