/**
 * Regression guard: the parenthesised player-name input in the actor identity
 * row must shrink to fit its content (the typed name / placeholder) rather than
 * reserving a wide fixed width.
 *
 * History (#249): the input used a fixed flex basis (`flex-[0_1_140px]`), which
 * reserved ~140px regardless of content. Later attempts used `field-sizing:
 * content` (never emitted into the bundle) and an HTML `size` attribute (computed
 * from the content) — but the field still spanned the header width. Root cause:
 * Foundry's core `foundry2.css` declares `input[type=text] { width: 100% }`, and a
 * CSS `width` overrides the HTML `size` attribute. The prefixed Tailwind utility
 * `.wh40k-rpg .tw-w-auto` did not reliably win that cascade, so the input stayed
 * 100% wide and `size` was ignored. The fix forces `width: auto !important`
 * (`!tw-w-auto`), which beats the non-important Foundry rule unconditionally;
 * `size` (8-char floor) then sizes the input to its content, bounded by a 3rem
 * floor and a 200px cap.
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

    it('forces width:auto with !important so Foundry’s input[type=text]{width:100%} cannot win', () => {
        // A CSS `width` overrides the HTML `size` attribute, so the size= fallback
        // is dead unless width:auto wins the cascade. Foundry's core rule is
        // layered + non-important; `!tw-w-auto` (width:auto !important) beats it
        // unconditionally. field-sizing:content stays as progressive enhancement.
        expect(playerInput).toContain('!tw-w-auto');
        expect(playerInput).not.toMatch(/[^!]tw-w-auto/);
        expect(playerInput).toContain('tw-[field-sizing:content]');
    });

    it('carries a browser-native size= fallback that now actually applies (width:auto no longer overridden)', () => {
        // With width:auto winning, the HTML `size` attribute sizes the input to the
        // player name (8-char floor for the placeholder).
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
