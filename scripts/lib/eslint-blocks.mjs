// Block `/* eslint-disable … */` scanning (#719).
//
// CLAUDE.md forbids file-level eslint-disable blocks: inside one, new code gets
// no check from the disabled rules and the lint ratchet cannot see it. This
// scanner measures how many lines block disables cover and finds blocks that
// never re-enable (they run to end of file).
//
// A block opens at a `/* eslint-disable` comment and closes at the next
// `/* eslint-enable`. A second disable inside an open block is part of the same
// block. `eslint-disable-next-line` / `-line` are single-line suppressions and
// are not blocks.

const OPEN = /^\s*\/\*\s*eslint-disable(?![-\w])/;
const CLOSE = /^\s*\/\*\s*eslint-enable(?![-\w])/;

/**
 * Scan one file's source.
 * @param {string} source
 * @returns {{ covered: number, unclosed: number | null }} lines inside blocks, and
 *   the 1-based line of a block that never closes (null when every block closes)
 */
export function scanBlocks(source) {
    const lines = source.split('\n');
    let open = null;
    let covered = 0;
    lines.forEach((line, i) => {
        if (open === null && OPEN.test(line)) open = i;
        else if (open !== null && CLOSE.test(line)) {
            covered += i - open - 1;
            open = null;
        }
    });
    if (open === null) return { covered, unclosed: null };
    return { covered: covered + lines.length - open - 1, unclosed: open + 1 };
}
