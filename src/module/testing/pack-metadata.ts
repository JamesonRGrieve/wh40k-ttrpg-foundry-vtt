/**
 * Test helper: a compendium pack's metadata carrying the manifest flags that
 * place it (`line-packs.ts`), so a test selects packs the way the system does —
 * by declared line and category, never by a pack's name.
 */

import type { PackMetadataLike } from '../utils/line-packs.ts';

/** Metadata for a pack named `name`, flagged as one of `line`'s `category` packs. */
export function packMetadata(name: string, line: string, category: string, homebrew = false): PackMetadataLike & { id: string; label: string } {
    return { id: `wh40k-rpg.${name}`, label: name, name, flags: { 'wh40k-rpg': { line, category, homebrew } } };
}
