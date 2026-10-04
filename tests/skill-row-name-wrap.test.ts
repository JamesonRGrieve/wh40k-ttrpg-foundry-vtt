/**
 * Regression guard: a long skill name wraps between words, never inside one.
 *
 * History: the name span used `tw-truncate`, so in the two-column skills grid
 * (NPC sheets, ~1000px windows) "Interrogation", "Psyniscience" and "Sleight of
 * Hand" rendered as "Interroga…" / "Psynisci…" / "Sleight of…". Switching to
 * `break-words` then split words mid-syllable ("Interrogati|on"), and browser
 * hyphenation can't fix that: Foundry's Electron on Windows/Linux ships no
 * hyphenation dictionaries. The name and its characteristic suffix now sit in a
 * wrapping flex row, so the suffix drops under the name first and multi-word
 * names wrap at spaces.
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

    it('lets the characteristic suffix wrap under the name', () => {
        expect(rowClasses).toEqual(expect.arrayContaining(['tw-inline-flex', 'tw-flex-wrap']));
    });

    it('never truncates the name or breaks inside a word', () => {
        for (const forbidden of ['tw-truncate', 'tw-break-words', 'tw-break-all', 'tw-whitespace-nowrap']) {
            expect(nameClasses).not.toContain(forbidden);
        }
    });
});
