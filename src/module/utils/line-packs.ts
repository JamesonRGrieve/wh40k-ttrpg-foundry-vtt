/**
 * Which compendium packs hold one game line's content of one category.
 *
 * Every declared pack carries `flags["wh40k-rpg"] = { line, category, homebrew }` in
 * its manifest entry: the game line, the kind of content (`weapons`, `talents`,
 * `origins-homeworlds`, `rolltables`, `actors-npcs`), and whether it is homebrew.
 * Code selects packs by those flags, never by a pack's id, so it names no book and
 * a newly added pack of the same line and category is picked up as it is (#674).
 */

/** A pack's line and category, as its manifest entry declares them. */
export interface PackLineFlags {
    /** The game line (`dh2`, `rt`, …), or `generic` for cross-line homebrew. */
    readonly line: string;
    /** The kind of content, with any `items-` prefix dropped. */
    readonly category: string;
    readonly homebrew: boolean;
    /** A content split of the same category (`gw-copyright`, `gw-mild`), when there is one. */
    readonly variant?: string;
    /** The pack's place among the line's packs the character builder reads origins from (1 = first). */
    readonly originBuilder?: number;
    /** The pack's place among the line's packs the builder offers starting equipment from (1 = first). */
    readonly startingEquipment?: number;
}

/** A use the character builder makes of a pack, declared with its position on the pack. */
export type BuilderPackRole = 'originBuilder' | 'startingEquipment';

/** The part of a pack's metadata this module reads. */
export interface PackMetadataLike {
    readonly name: string;
    readonly flags?: { readonly 'wh40k-rpg'?: Partial<PackLineFlags> } | null;
}

/** A pack's declared line and category, or null for a pack that declares none. */
export function packLineFlags(metadata: PackMetadataLike): PackLineFlags | null {
    const flags = metadata.flags?.['wh40k-rpg'];
    if (flags === undefined || typeof flags.line !== 'string' || typeof flags.category !== 'string') return null;
    return {
        line: flags.line,
        category: flags.category,
        homebrew: flags.homebrew === true,
        ...(flags.variant === undefined ? {} : { variant: flags.variant }),
        ...(typeof flags.originBuilder === 'number' ? { originBuilder: flags.originBuilder } : {}),
        ...(typeof flags.startingEquipment === 'number' ? { startingEquipment: flags.startingEquipment } : {}),
    };
}

/**
 * The packs `line`'s character builder reads for `role`, in the order their flags
 * declare. Order matters: where two packs hold the same document, the builder keeps
 * the first copy it reads.
 */
export function builderPacks<T extends { readonly metadata: PackMetadataLike }>(packs: Iterable<T>, line: string, role: BuilderPackRole): T[] {
    const ranked: Array<{ pack: T; rank: number }> = [];
    for (const pack of packs) {
        const flags = packLineFlags(pack.metadata);
        const rank = flags?.[role];
        if (flags !== null && flags.line === line && rank !== undefined) ranked.push({ pack, rank });
    }
    return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.pack);
}

/** The first of `line`'s book packs of exactly `category`, or undefined when there is none. */
export function lineCategoryPack<T extends { readonly metadata: PackMetadataLike }>(packs: Iterable<T>, line: string, category: string): T | undefined {
    for (const pack of packs) {
        const flags = packLineFlags(pack.metadata);
        if (flags !== null && !flags.homebrew && flags.line === line && flags.category === category) return pack;
    }
    return undefined;
}

/** The lines whose skills pack serves as the shared skill reference, most complete first. */
const SKILL_REFERENCE_LINES = ['dh2', 'rt', 'dw'] as const;

/** The skills pack read for skill descriptions and info sheets: the first reference line's that is installed. */
export function skillReferencePack<T extends { readonly metadata: PackMetadataLike }>(packs: Iterable<T>): T | undefined {
    const all = [...packs];
    for (const line of SKILL_REFERENCE_LINES) {
        const pack = lineCategoryPack(all, line, 'skills');
        if (pack !== undefined) return pack;
    }
    return undefined;
}

/** All of `line`'s book packs of `category` (or a sub-grouping of it), in manifest order. */
export function lineBookPacks<T extends { readonly metadata: PackMetadataLike }>(packs: Iterable<T>, line: string, category: string): T[] {
    return [...packs].filter((pack) => isLineBookPack(pack.metadata, line, category));
}

/** Does `category` name `wanted` itself or a sub-grouping of it (`talents-specializations` under `talents`)? */
function inCategory(category: string, wanted: string): boolean {
    return category === wanted || category.startsWith(`${wanted}-`);
}

/** Is the pack one of `line`'s book packs of `category`? Homebrew packs never are. */
export function isLineBookPack(metadata: PackMetadataLike, line: string, category: string): boolean {
    const flags = packLineFlags(metadata);
    return flags !== null && !flags.homebrew && flags.line === line && inCategory(flags.category, category);
}

/** Is the pack one of `line`'s book packs of origin-path items (any `origins-…` category)? */
export function isLineOriginPack(metadata: PackMetadataLike, line: string): boolean {
    return isLineBookPack(metadata, line, 'origins');
}

/**
 * One entry per name, case-insensitively. Across a line's books the same power can be
 * printed twice: an adventure restates a core power for its pregenerated characters.
 * Where copies collide, the one `isPreferred` accepts wins (the copy carrying the
 * printed values); otherwise the first, in input order.
 * @param entries      Entries in pack order.
 * @param isPreferred  Whether an entry is the copy to keep over its namesakes.
 */
export function uniqueByName<T extends { name: string }>(entries: readonly T[], isPreferred: (entry: T) => boolean): T[] {
    const kept = new Map<string, T>();
    for (const entry of entries) {
        const key = entry.name.toLowerCase();
        const current = kept.get(key);
        if (current === undefined || (!isPreferred(current) && isPreferred(entry))) kept.set(key, entry);
    }
    return [...kept.values()];
}
