/**
 * Regression guard: the parenthesised player-name input in the actor identity
 * row must shrink to fit its content (the typed name / placeholder) rather than
 * reserving a wide fixed width.
 *
 * History (#249): the input used a fixed flex basis (`flex-[0_1_140px]`), which
 * reserved ~140px regardless of content, so a short player name (or the empty
 * placeholder) left a large gap inside the `( … )` punctuation. The fix sizes
 * the input to its content via the CSS `field-sizing: content` property, with a
 * 3rem floor (so an empty field still shows the placeholder) and a 200px cap.
 *
 * The test is a source scan rather than runtime: rendering the partial requires
 * Foundry's Handlebars + sheet context the unit env does not provide, and the
 * contract here is a literal one on the input's utility classes.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PARTIAL_PATH = resolve(__dirname, '../src/templates/actor/partial/actor-identity.hbs');
const src = readFileSync(PARTIAL_PATH, 'utf8');

/** Pull the full `<input ...>` tag that carries the given name attribute. */
function inputWithName(name: string): string {
    const re = new RegExp(`<input[^>]*name="${name.replace(/[.[\]]/g, '\\$&')}"[^>]*>`);
    const match = re.exec(src);
    if (match === null) {
        throw new Error(`input name="${name}" not found in actor-identity.hbs`);
    }
    return match[0];
}

describe('actor-identity player-name input layout (#249)', () => {
    const playerInput = inputWithName('system.bio.playerName');

    it('sizes the player-name input to its content', () => {
        // field-sizing: content makes the input width track the typed value /
        // placeholder instead of a fixed basis.
        expect(playerInput).toContain('tw-[field-sizing:content]');
        expect(playerInput).toContain('tw-w-auto');
    });

    it('keeps a usable floor and a cap so it neither collapses nor sprawls', () => {
        expect(playerInput).toContain('tw-min-w-[3rem]');
        expect(playerInput).toContain('tw-max-w-[200px]');
    });

    it('does not reserve a wide fixed flex basis (the reverted behaviour)', () => {
        // The old fixed-basis form reserved width regardless of content.
        expect(playerInput).not.toMatch(/tw-flex-\[0_1_\d+px\]/);
        expect(playerInput).not.toMatch(/tw-basis-\[\d+px\]/);
    });
});
