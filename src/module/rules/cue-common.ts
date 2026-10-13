/**
 * @file The pieces every canvas cue shares, whatever triggers it: attack cues (#594)
 * and status-effect visuals (#595) both author a `#rrggbb` tint and per-event sound
 * (or animation) files in their compendium `_source`, and both read them back off an
 * untyped payload the same way.
 *
 * Pure: no Foundry globals.
 */

/** An authored file for one event of a cue vocabulary. */
export interface CueAssetOf<E extends string> {
    event: E;
    src: string;
}

/** An authored asset entry before narrowing. */
export interface CueAssetSource {
    event?: string | undefined;
    src?: string | undefined;
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

/** An authored tint as lower-case `#rrggbb`, or '' when it is not one. */
export function readHexTint(value: string | null | undefined): string {
    const tint = value ?? '';
    return HEX_COLOUR.test(tint) ? tint.toLowerCase() : '';
}

/** A `#rrggbb` tint as a PIXI colour number, or `fallback` when the tint is ''. */
export function tintColour(tint: string, fallback: number): number {
    return tint === '' ? fallback : Number.parseInt(tint.slice(1), 16);
}

/** Narrow an authored asset list: entries with an unknown event or no file are dropped, never guessed. */
export function readCueAssets<E extends string>(list: readonly CueAssetSource[] | null | undefined, isEvent: (value: string) => value is E): CueAssetOf<E>[] {
    const assets: CueAssetOf<E>[] = [];
    for (const entry of list ?? []) {
        const event = entry.event ?? '';
        const src = (entry.src ?? '').trim();
        if (src !== '' && isEvent(event)) assets.push({ event, src });
    }
    return assets;
}

/** One authored asset entry off an untyped payload. */
function assetSource(entry: object): CueAssetSource {
    return {
        ...('event' in entry && typeof entry.event === 'string' ? { event: entry.event } : {}),
        ...('src' in entry && typeof entry.src === 'string' ? { src: entry.src } : {}),
    };
}

/** An authored asset list off an untyped payload; anything but a list of objects reads as empty. */
export function cueAssetSources<T>(list: T): CueAssetSource[] {
    if (!Array.isArray(list)) return [];
    return list.filter((entry): entry is object => typeof entry === 'object' && entry !== null).map(assetSource);
}

/** One authored file for an event, picked at random when several are authored; '' when none. */
export function pickCueAsset<E extends string>(assets: readonly CueAssetOf<E>[], event: E, rng: () => number): string {
    const matching = assets.filter((asset) => asset.event === event);
    if (matching.length === 0) return '';
    const index = Math.min(matching.length - 1, Math.max(0, Math.floor(rng() * matching.length)));
    return matching[index]?.src ?? '';
}
