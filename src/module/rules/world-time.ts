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
