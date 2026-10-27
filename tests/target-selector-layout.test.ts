/**
 * The unified roll dialog's target row (#701). Its combatant select read
 * "Select a Ta" and the selection hint "No target — tar…": the select could
 * shrink to nothing (min-w-0) and the hint was truncated. The partial is
 * shared by every line's weapon and skill-use panels and has no per-line
 * branches, so one layout serves all of them.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const TEMPLATE = readRepoFile('src/templates/prompt/unified/target-selector.hbs');
const SELECT = /<select data-wh40k-hook="target-combatant-select"[^>]*>/u.exec(TEMPLATE)?.[0] ?? '';
const HINTS = TEMPLATE.match(/<span data-wh40k-hook="target-selection"[^>]*>/gu) ?? [];

describe('roll dialog target row (#701)', () => {
    it('never lets the select shrink below its widest option', () => {
        expect(SELECT).toContain('tw-min-w-fit');
        expect(SELECT).not.toContain('tw-min-w-0');
    });

    it('puts the selection hint whole on its own line, never truncated', () => {
        expect(HINTS).toHaveLength(2);
        for (const hint of HINTS) {
            expect(hint).toContain('tw-basis-full');
            expect(hint).not.toContain('tw-truncate');
        }
    });

    it('has no per-line branch, so every line gets the same layout', () => {
        expect(TEMPLATE).not.toMatch(/\b(?:bc|dh1|dh2|dw|ow|rt|im):tw-/u);
    });
});
