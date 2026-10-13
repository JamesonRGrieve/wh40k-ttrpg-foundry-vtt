/**
 * The Mutant background card (#91) must not offer an action nothing handles.
 *
 * Regression: the card carried a "Convert Failed Malignancy" button
 * (`data-action="convertMalignancy"`) with no handler anywhere, so clicking it
 * did nothing. The conversion is the Twisted Flesh choice offered when an owed
 * Malignancy Test is rolled from the sheet; the card now states that rule
 * instead. Source scan: chat cards render outside any ApplicationV2, so a
 * `data-action` on one only works through a hook the system registers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const card = readFileSync(resolve(__dirname, '../src/templates/chat/mutant-background-chat.hbs'), 'utf8');

describe('mutant-background-chat.hbs (#91)', () => {
    it('has no dead action button', () => {
        expect(card).not.toMatch(/data-action=/);
        expect(card).not.toContain('ConvertMalignancy');
    });

    it('gives the +N starting Corruption its own light text colour (it read dark on the dark card)', () => {
        expect(card).toMatch(/<span class="[^"]*tw-text-\[#e8e4d9\][^"]*">\+\{\{startingCorruption\}\}<\/span>/);
    });

    it('states the Twisted Flesh rule the flag grants', () => {
        expect(card).toContain('WH40K.Malignancy.TwistedFlesh.OutcomeHint');
    });
});
