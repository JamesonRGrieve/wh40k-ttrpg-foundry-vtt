/** The shortest run of shared words that counts as copied text. */
export const VERBATIM_WORDS: number;

/** One word of a text and its source offsets. */
export interface WordToken {
    word: string;
    start: number;
    end: number;
}

/** One stretch of a text the books share. */
export interface VerbatimRun {
    line: number;
    words: number;
    phrase: string;
    excerpt: string;
}

export function wordTokens(text: string): WordToken[];
export function shingles(text: string, n?: number): Set<string>;
export function verbatimRuns(text: string, isBookShingle: (shingle: string) => boolean, n?: number): VerbatimRun[];
