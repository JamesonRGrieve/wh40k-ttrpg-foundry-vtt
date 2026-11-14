/**
 * Unit tests for the copyright gate's verbatim check (`scripts/lib/verbatim-text.mjs`):
 * a run of VERBATIM_WORDS or more words the books share is copied text, however
 * the public file wraps it. The "book" text here is invented.
 */
import { describe, expect, it } from 'vitest';
import { shingles, VERBATIM_WORDS, verbatimRuns } from '../scripts/lib/verbatim-text.mjs';

const BOOK = 'the quick brown fox jumps over the lazy dog while seven grey geese circle the old stone tower at dusk';

describe('verbatim book text', () => {
    const book = shingles(BOOK);
    const shared = (shingle: string): boolean => book.has(shingle);

    it('finds a copied passage re-wrapped into a code comment, with its line and length', () => {
        const source = [
            'const x = 1;',
            '// The Quick brown fox jumps over the lazy dog,',
            '// while seven grey geese circle the old stone tower at dusk.',
        ].join('\n');
        const runs = verbatimRuns(source, shared);
        expect(runs.map((run) => [run.line, run.words])).toEqual([[2, 20]]);
    });

    it('passes a paraphrase and a shared run shorter than the threshold', () => {
        expect(verbatimRuns('A fox leaps the sleeping dog as geese wheel above an old tower.', shared)).toEqual([]);
        const short = BOOK.split(' ')
            .slice(0, VERBATIM_WORDS - 1)
            .join(' ');
        expect(verbatimRuns(short, shared)).toEqual([]);
    });

    it('reports exactly the threshold-length run', () => {
        const exact = BOOK.split(' ').slice(0, VERBATIM_WORDS).join(' ');
        expect(verbatimRuns(`intro ${exact} outro`, shared).map((run) => run.words)).toEqual([VERBATIM_WORDS]);
    });
});
