/**
 * Regression guard: a long skill name wraps instead of clipping.
 *
 * History: the name span used `tw-truncate`, so in the two-column skills grid
 * (NPC sheets, ~1000px windows) "Interrogation", "Psyniscience" and "Sleight of
 * Hand" rendered as "Interroga…" / "Psynisci…" / "Sleight of…". The name now
 * clamps at two lines, and the characteristic suffix stays whole beside it.
 *
 * Source-text idiom, like the other template guards in tests/.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_ROW = readFileSync(resolve(__dirname, '..', 'src/templates/actor/partial/skill-row.hbs'), 'utf8');
const nameSpan = SKILL_ROW.match(/<span class="([^"]*)" data-testid="skill-name">/)?.[1] ?? '';

describe('skill-row name', () => {
    it('is found in the template', () => {
        expect(nameSpan).not.toBe('');
    });

    // Hyphenation (language from Foundry's `<html lang>`) comes first, so a wrap lands
    // at a syllable: break-words alone split "Interrogati|on" / "Psynicien|ce".
    it('wraps to two lines at words or hyphenated syllables instead of truncating', () => {
        expect(nameSpan.split(' ')).toEqual(expect.arrayContaining(['tw-line-clamp-2', 'tw-hyphens-auto', 'tw-break-words']));
        expect(nameSpan.split(' ')).not.toContain('tw-truncate');
    });
});
