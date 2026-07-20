/**
 * Ordered magazine (clip loadout) — the content-agnostic core.
 *
 * A weapon's clip is an **ordered list of round-segments**, each a run of the same
 * ammunition type with a `count`. Firing consumes from the FRONT (the chambered
 * round); the chambered segment's cached ammo determines that shot's modifiers,
 * qualities, and clip-size delta. When a segment empties it is dropped and the
 * next becomes chambered.
 *
 * This generalises the previous single `loadedAmmo` + `clip.value` model: the RAW
 * "one type per clip" case is a single-segment magazine, and a mixed clip is
 * several ordered segments. The functions here are pure — the DataModel
 * (`data/item/weapon.ts`), the fire path (`rules/ammo.ts`), and the reload flow
 * (`actions/reload-action-manager.ts`) call them; no game content lives here.
 */

/** A run of one ammunition type in the magazine, caching the ammo's effect (mirrors the legacy `loadedAmmo` shape) + a round count. */
export interface MagazineSegment {
    /** UUID of the ammunition item this segment holds (for reload / return-to-inventory). */
    ammoUuid: string;
    /** Display name of the ammunition (provenance / chat). */
    ammoName: string;
    /** Rounds of this type remaining in this segment. */
    count: number;
    /** Flat stat deltas the ammo applies while chambered. */
    modifiers: { damage: number; penetration: number; range: number };
    /** Clip-size delta this ammo imposes (e.g. Hot-shot → clip reduced). */
    clipModifier: number;
    /** Weapon qualities this ammo adds while chambered. */
    addedQualities: readonly string[];
    /** Weapon qualities this ammo removes while chambered. */
    removedQualities: readonly string[];
}

/** The legacy single-loaded-ammo cache shape (pre-magazine), read during migration. */
export interface LegacyLoadedAmmo {
    uuid: string;
    name: string;
    modifiers: { damage: number; penetration: number; range: number };
    clipModifier: number;
    addedQualities: Iterable<string>;
    removedQualities: Iterable<string>;
}

/** Total rounds across all segments — the derived `clip.value`. */
export function magazineTotal(magazine: readonly MagazineSegment[] | undefined | null): number {
    if (magazine === undefined || magazine === null) return 0;
    let total = 0;
    for (const seg of magazine) total += Math.max(0, seg.count);
    return total;
}

/** The chambered (front) segment, or null when the magazine is empty. */
export function frontSegment(magazine: readonly MagazineSegment[] | undefined | null): MagazineSegment | null {
    if (magazine === undefined || magazine === null) return null;
    for (const seg of magazine) {
        if (seg.count > 0) return seg;
    }
    return null;
}

/**
 * Consume `rounds` from the front of the magazine, spanning segment boundaries.
 * Returns a NEW magazine (input untouched) with empty segments dropped, plus the
 * number actually consumed (capped at what was available). `rounds <= 0` is a no-op.
 */
export function consumeRounds(magazine: readonly MagazineSegment[], rounds: number): { magazine: MagazineSegment[]; consumed: number } {
    if (rounds <= 0) return { magazine: magazine.map((s) => ({ ...s })), consumed: 0 };
    let remaining = rounds;
    let consumed = 0;
    const out: MagazineSegment[] = [];
    for (const seg of magazine) {
        if (remaining <= 0 || seg.count <= 0) {
            if (seg.count > 0) out.push({ ...seg });
            continue;
        }
        const take = Math.min(seg.count, remaining);
        remaining -= take;
        consumed += take;
        const left = seg.count - take;
        if (left > 0) out.push({ ...seg, count: left });
    }
    return { magazine: out, consumed };
}

/**
 * Return `rounds` to the front of the magazine (a re-roll refund). If the front
 * segment is the same ammo (by UUID, else by name), its count grows; otherwise a
 * fresh front segment is prepended from `template`. Returns a NEW magazine.
 */
export function refundRounds(magazine: readonly MagazineSegment[], rounds: number, template: MagazineSegment): MagazineSegment[] {
    if (rounds <= 0) return magazine.map((s) => ({ ...s }));
    const out = magazine.map((s) => ({ ...s }));
    // The ternary keeps `front` typed `MagazineSegment | undefined` under both the
    // main tsconfig and tsconfig.strict.json, so the guard below is never redundant.
    const front = out.length > 0 ? out[0] : undefined;
    if (front !== undefined && ((template.ammoUuid !== '' && front.ammoUuid === template.ammoUuid) || front.ammoName === template.ammoName)) {
        front.count += rounds;
        return out;
    }
    out.unshift({ ...template, count: rounds });
    return out;
}

/**
 * Build a one-segment magazine from the legacy `loadedAmmo` + `clip.value` shape,
 * for `_migrateData` back-compat. Returns `[]` when there is no loaded ammo /
 * count (an empty or ammo-less clip).
 */
export function magazineFromLegacy(loadedAmmo: LegacyLoadedAmmo | undefined | null, clipValue: number): MagazineSegment[] {
    if (loadedAmmo === undefined || loadedAmmo === null || loadedAmmo.uuid === '' || clipValue <= 0) return [];
    return [
        {
            ammoUuid: loadedAmmo.uuid,
            ammoName: loadedAmmo.name,
            count: clipValue,
            modifiers: { damage: loadedAmmo.modifiers.damage, penetration: loadedAmmo.modifiers.penetration, range: loadedAmmo.modifiers.range },
            clipModifier: loadedAmmo.clipModifier,
            addedQualities: Array.from(loadedAmmo.addedQualities),
            removedQualities: Array.from(loadedAmmo.removedQualities),
        },
    ];
}
