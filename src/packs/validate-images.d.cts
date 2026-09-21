/**
 * Type declarations for `validate-images.cjs`.
 *
 * The image-coverage validator is authored as node-runnable CommonJS so the pack
 * tooling and the ratchet can require it directly; this hand-written `.d.cts`
 * gives the consuming `.ts` test full types under `tsconfig.test.json` without
 * pulling the script into `allowJs`. Same arrangement as `validate-actors.d.cts`.
 */

/** The Foundry document class a pack `_source` document is bucketed under. */
export type ImageClass = 'Actor' | 'Item' | 'JournalEntry' | 'RollTable' | 'Adventure' | 'Other';

/** A document whose `img` is a replaceable default rather than curated art. */
export interface ImagePlaceholder {
    class: ImageClass;
    file: string;
    img: string;
}

/** Options for a whole-tree image-coverage run. */
export interface ValidateImagePacksOptions {
    /** Packs root to walk; defaults to the validator's own directory. */
    rootDir?: string;
    /** List every placeholder document. */
    verbose?: boolean;
    /** Output sink; defaults to stdout. */
    log?: (msg: string) => void;
}

/** Result of a whole-tree run. */
export interface ImageCoverageResult {
    scanned: number;
    /** Documents skipped as art-exempt (e.g. RollTables — see NO_ART_CLASSES). */
    exempt: number;
    byClass: Record<string, { arted: number; total: number }>;
    /** Per-class real-art count — the covered totals the ratchet protects. */
    arted: Record<string, number>;
    placeholders: ImagePlaceholder[];
}

/** True when `img` is curated art (a `…/images/**` asset or an `https://` hotlink). */
export function hasRealArt(img: unknown): boolean;

/** The Foundry document class of a parsed pack document, from its shape. */
export function imageClassOf(doc: unknown): ImageClass;

/** Walk every pack `_source` document and tally real-art coverage per class. */
export function validateImagePacks(opts?: ValidateImagePacksOptions): ImageCoverageResult;

/** Document classes exempt from image coverage (their default icon is the final state). */
export const NO_ART_CLASSES: Set<ImageClass>;
