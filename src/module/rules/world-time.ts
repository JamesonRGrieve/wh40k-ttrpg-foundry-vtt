/**
 * In-universe time (#455) — the shared clock primitive for every time-based rule:
 * RAW use cooldowns (First Aid once per 24 hours per patient), drugs wearing off,
 * fatigue recovery, and the effects panel's live time-remaining readout.
 *
 * Foundry V14 core already provides the clock: `game.time.worldTime` (seconds since
 * the world epoch), `game.time.calendar` / `CONFIG.time.worldCalendarConfig`
 * (defaulted to SIMPLIFIED_GREGORIAN — a 24-hour day, which is all these rules need),
 * and the GM-only `game.time.advance(delta)`. This module does NOT reinvent any of
 * that; it is the pure arithmetic + formatting layer over it, so the rules that
 * depend on elapsed time are unit-testable without a live world.
 *
 * The clock READ (`game.time.worldTime`) stays at the caller's boundary — every
 * function here takes `now` explicitly.
 */

/** Seconds in one in-universe hour. */
export const HOUR_SECONDS = 3600;
/** Seconds in one in-universe day (SIMPLIFIED_GREGORIAN: a 24-hour day). */
export const DAY_SECONDS = 24 * HOUR_SECONDS;

/** In-universe hours elapsed between `stamp` and `now` (never negative). */
export function hoursSince(stamp: number, now: number): number {
    return Math.max(0, now - stamp) / HOUR_SECONDS;
}

/** In-universe days elapsed between `stamp` and `now` (never negative). */
export function daysSince(stamp: number, now: number): number {
    return Math.max(0, now - stamp) / DAY_SECONDS;
}

/**
 * The **Day-since-inception counter** for the world-time widget (#487): the
 * integer number of *completed* in-universe days between the campaign's
 * inception stamp and `now`. Day 0 is the day of inception itself (0 completed
 * days), Day 1 the following day, and so on — matching the "Day 0 / 1 / 2 / 3 …"
 * enumeration in #487. Never negative (a clock wound back before inception reads
 * Day 0), since {@link daysSince} already floors elapsed time at zero.
 */
export function dayNumberSince(inceptionStamp: number, now: number): number {
    return Math.floor(daysSince(inceptionStamp, now));
}

/** The unit a GM advance step is expressed in (#487 advance controls). */
export type TimeAdvanceUnit = 'hour' | 'day';

/**
 * Seconds to advance the world clock by, for a GM "advance N hours/days" control
 * (#487). Pure arithmetic over {@link HOUR_SECONDS} / {@link DAY_SECONDS}: the
 * count is truncated to a whole unit; a non-finite count yields 0 (a no-op
 * advance) so a blank/garbage input never throws at `game.time.advance`. A
 * negative count is preserved (Foundry's `advance` rewinds on a negative delta),
 * but the widget's controls only ever pass a positive count.
 */
export function advanceSeconds(count: number, unit: TimeAdvanceUnit): number {
    if (!Number.isFinite(count)) return 0;
    const unitSeconds = unit === 'day' ? DAY_SECONDS : HOUR_SECONDS;
    return Math.trunc(count) * unitSeconds;
}

/** Zero-pad a whole-number time part to two digits (`5` → `"05"`). */
function padTimePart(value: number): string {
    return Math.trunc(value).toString().padStart(2, '0');
}

/**
 * A zero-padded `HH:MM` (or `HH:MM:SS` when `second` is given) clock readout from
 * decomposed time-of-day components (#487). Pure and Foundry-free — digits and
 * colons only, no translatable prose — so the world-time widget can render a
 * time-of-day fallback from `game.time.components` when the native
 * `game.time.calendar.format()` timestamp is unavailable (e.g. a world with no
 * calendar configured).
 */
export function formatClock(hour: number, minute: number, second?: number): string {
    const hhmm = `${padTimePart(hour)}:${padTimePart(minute)}`;
    return second === undefined ? hhmm : `${hhmm}:${padTimePart(second)}`;
}

/**
 * Whether a per-target time gate is open — i.e. in-universe time has reached the
 * gate's recorded **expiry**. An unset gate (`null`) is open.
 *
 * The gate stores an expiry rather than a "last used" stamp so a single mechanism
 * covers both **fixed** windows (First Aid: now + 24h) and **random** ones
 * (Interrogation: now + 1d5 days) — a stamp plus a declared constant window cannot
 * express the latter.
 */
export function isGateOpen(expiry: number | null, now: number): boolean {
    if (expiry === null) return true;
    return now >= expiry;
}

/** Seconds of in-universe time before a gate reopens (0 once open / unset). */
export function gateRemaining(expiry: number | null, now: number): number {
    if (expiry === null) return 0;
    return Math.max(0, expiry - now);
}

/**
 * Human-readable in-universe duration for the effects panel and the "why is this
 * blocked" readout — e.g. `90` → "1m 30s", `5400` → "1h 30m", `172800` → "2 days".
 * Rounds down to the largest two sensible units; returns "0s" at or below zero.
 */
export function formatRemaining(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    if (total === 0) return '0s';

    const days = Math.floor(total / DAY_SECONDS);
    const hours = Math.floor((total % DAY_SECONDS) / HOUR_SECONDS);
    const minutes = Math.floor((total % HOUR_SECONDS) / 60);
    const secs = total % 60;

    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
    return `${secs}s`;
}
