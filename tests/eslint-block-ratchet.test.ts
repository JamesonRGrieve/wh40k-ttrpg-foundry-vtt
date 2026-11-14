/**
 * Guard (#719): the block eslint-disable scanner. A block that never re-enables
 * runs to end of file and is a hard fail; the covered-line count is ratcheted.
 */
import { describe, expect, it } from 'vitest';
import { scanBlocks } from '../scripts/lib/eslint-blocks.mjs';

const lines = (...rows: string[]): string => rows.join('\n');

describe('block eslint-disable scanning (#719)', () => {
    it('counts the lines between a disable and its enable', () => {
        expect(scanBlocks(lines('a', '/* eslint-disable no-console */', 'b', 'c', '/* eslint-enable no-console */', 'd'))).toEqual({
            covered: 2,
            unclosed: null,
        });
    });

    it('reports a block that never re-enables, counting it to end of file', () => {
        expect(scanBlocks(lines('a', '/* eslint-disable no-restricted-syntax -- why */', 'b', 'c'))).toEqual({ covered: 2, unclosed: 2 });
    });

    it('treats a disable inside an open block as the same block', () => {
        expect(scanBlocks(lines('/* eslint-disable a */', 'x', '/* eslint-disable b */', 'y', '/* eslint-enable */'))).toEqual({ covered: 3, unclosed: null });
    });

    it('ignores single-line suppressions', () => {
        expect(
            scanBlocks(lines('// eslint-disable-next-line no-console', 'x', '/* eslint-disable-next-line no-console */', 'y', 'z // eslint-disable-line')),
        ).toEqual({
            covered: 0,
            unclosed: null,
        });
    });
});
