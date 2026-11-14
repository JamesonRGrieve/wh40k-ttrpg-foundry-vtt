// Verbatim book text in the public tree (copyright audit).
//
// The public tree may describe what a rule does, in its own words; it may not
// carry the books' wording. A run of VERBATIM_WORDS or more consecutive words
// that also appears in the transcribed books is copied text. Words compare
// lower-cased, punctuation and line comment markers dropped, so a passage
// re-wrapped into a code comment still matches.

/** The shortest run of shared words that counts as copied text. */
export const VERBATIM_WORDS = 14;

const WORD = /[a-z0-9']+/gu;

/** Word tokens of `text` with their source offsets, lower-cased. */
export function wordTokens(text) {
    const lower = text.toLowerCase();
    return [...lower.matchAll(WORD)].map((match) => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
}

/** Every run of `n` consecutive words in `text`, joined by single spaces. */
export function shingles(text, n = VERBATIM_WORDS) {
    const words = wordTokens(text).map((token) => token.word);
    const out = new Set();
    for (let i = 0; i + n <= words.length; i += 1) out.add(words.slice(i, i + n).join(' '));
    return out;
}

/**
 * The runs of `text` that the books share: maximal stretches covered by shared
 * `n`-word shingles, each with its 1-based line, word count and an excerpt.
 */
export function verbatimRuns(text, isBookShingle, n = VERBATIM_WORDS) {
    const tokens = wordTokens(text);
    const covered = new Array(tokens.length).fill(false);
    for (let i = 0; i + n <= tokens.length; i += 1) {
        if (
            isBookShingle(
                tokens
                    .slice(i, i + n)
                    .map((token) => token.word)
                    .join(' '),
            )
        )
            covered.fill(true, i, i + n);
    }
    const runs = [];
    for (let i = 0; i < tokens.length; i += 1) {
        if (!covered[i]) continue;
        let j = i;
        while (j < tokens.length && covered[j]) j += 1;
        const start = tokens[i].start;
        runs.push({
            line: text.slice(0, start).split('\n').length,
            words: j - i,
            phrase: tokens
                .slice(i, j)
                .map((token) => token.word)
                .join(' '),
            excerpt: text
                .slice(start, tokens[j - 1].end)
                .replace(/\s+/gu, ' ')
                .slice(0, 120),
        });
        i = j;
    }
    return runs;
}
