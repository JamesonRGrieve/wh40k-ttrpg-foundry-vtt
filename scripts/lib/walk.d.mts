/** Which files `walkFiles` yields, matched against each file name with `endsWith`. */
export interface WalkOptions {
    ext?: string | string[];
    exclude?: string | string[];
}

/** Recursively yield the file paths under `dir`, depth-first, joined with '/'. A missing directory yields nothing. */
export function walkFiles(dir: string, options?: WalkOptions): Generator<string>;
