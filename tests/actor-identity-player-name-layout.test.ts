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

    it('carries a browser-native size= fallback (field-sizing is not emitted by Tailwind / unsupported on older runtimes)', () => {
        // The CSS `field-sizing: content` rule never reaches the bundle, so the
        // input must also shrink/grow via the HTML `size` attribute, computed from
        // the player name with an 8-char floor for the placeholder.
        expect(playerInput).toMatch(/size="\{\{inputSize system\.bio\.playerName 8\}\}"/);
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

describe('actor-identity player-name is PC-only (#253)', () => {
    it('gates the player-name block on {{#unless isNPC}} so NPC sheets never render it', () => {
        // NPCs carry a truthy-but-empty `system.bio` getter, so `{{#if system.bio}}`
        // alone let the player input leak onto NPC sheets. The isNPC guard is what
        // suppresses it (isNPC is set true in npc-sheet.ts context).
        expect(src).toMatch(/\{\{#unless isNPC\}\}[\s\S]*name="system\.bio\.playerName"[\s\S]*\{\{\/unless\}\}/);
    });

    it('still keeps the inner system.bio guard (skips vehicles/starships with no bio)', () => {
        expect(src).toMatch(/\{\{#unless isNPC\}\}\s*\{\{#if system\.bio\}\}/);
    });
});
