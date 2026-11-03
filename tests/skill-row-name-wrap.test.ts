/**
 * Regression guard: a skill row is one thin strip, and its name never breaks
 * inside a word.
 *
 * History: the name span used `tw-truncate`, so in the two-column skills grid
 * "Interrogation", "Psyniscience" and "Sleight of Hand" rendered as "Interroga…".
 * Switching to `break-words` then split words mid-syllable ("Interrogati|on"), and
 * browser hyphenation can't fix that: Foundry's Electron on Windows/Linux ships no
 * hyphenation dictionaries. The row then wrapped to two lines below 22rem (#267),
 * which at the usual two-column width put every name on its own centred line above
 * its pips — the operator's "jumbled" rows. The operator's call: every row is a
 * single thin strip. The name and the pips are sized so the longest names fit a
 * two-column row; only in a narrower strip does a name end in an ellipsis, never
 * mid-word, and the characteristic suffix always stays whole beside it.
 *
 * Source-text idiom, like the other template guards in tests/.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_ROW = readFileSync(resolve(__dirname, '..', 'src/templates/actor/partial/skill-row.hbs'), 'utf8');
const nameMatch = SKILL_ROW.match(/<span class="([^"]*)"><span class="([^"]*)" data-testid="skill-name">/);
const rowClasses = (nameMatch?.[1] ?? '').split(' ');
const nameClasses = (nameMatch?.[2] ?? '').split(' ');

describe('skill-row name', () => {
    it('is found in the template', () => {
        expect(nameMatch).not.toBeNull();
    });

    it('keeps the name and its characteristic suffix on one line', () => {
        expect(rowClasses).toEqual(expect.arrayContaining(['tw-inline-flex', 'tw-flex-nowrap']));
        expect(rowClasses).not.toContain('tw-flex-wrap');
    });

    it('never breaks the name inside a word; a name too long for the strip ends in an ellipsis', () => {
        for (const forbidden of ['tw-break-words', 'tw-break-all']) {
            expect(nameClasses).not.toContain(forbidden);
        }
        expect(nameClasses).toContain('tw-truncate');
    });

    it('does not drop any cell to a second line at a narrow width', () => {
        expect(SKILL_ROW).not.toMatch(/@container\(max-width:[^)]*\)\]:tw-col-(span-full|start-2)/);
    });
});
