/**
 * DisorderRollDialog (#116) — content-migration guard.
 *
 * The disorder content (which disorder, its effect prose) was moved out of a
 * hardcoded `src/module/rules/disorders-table.ts` array into the compendium:
 * the "Disorders" RollTable in `dh2-core-rolltables` maps d100 ranges onto the
 * Mental Disorder items in `dh2-core-items-mental-disorders`. The dialog now
 * DRAWS from that table at runtime and resolves the referenced item, instead of
 * picking from an in-`src/` literal.
 *
 * Two surfaces are guarded here:
 *  - the pure text-extraction helpers (`htmlToPlainText` / `conciseEffect`) that
 *    turn a resolved item's HTML body into the concise chat-card effect line;
 *  - a source-scan proving the dialog reads the disorder from the compendium and
 *    no longer references the deleted rules module (the dialog itself can't be
 *    instantiated under happy-dom — it needs Foundry's ApplicationV2 globals).
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conciseEffect, htmlToPlainText } from './disorder-text.ts';

const DIALOG_SRC = readFileSync(resolve(__dirname, './disorder-roll-dialog.ts'), 'utf8');

describe('htmlToPlainText (#116)', () => {
    it('strips tags and collapses whitespace to a single line', () => {
        expect(htmlToPlainText('<p>The character has a\n  deep fear.</p>')).toBe('The character has a deep fear.');
    });

    it('flattens nested markup (e.g. <strong>) without leaving tag fragments', () => {
        expect(htmlToPlainText('<p><strong>Fear of the Dead:</strong> corpses.</p>')).toBe('Fear of the Dead: corpses.');
    });

    it('decodes the entities the disorder bodies use', () => {
        expect(htmlToPlainText('<p>a &amp; b &ndash; c &mdash; d&nbsp;e</p>')).toBe('a & b – c — d e');
    });

    it('returns an empty string for empty input', () => {
        expect(htmlToPlainText('')).toBe('');
    });
});

describe('conciseEffect (#116)', () => {
    const trigger = '<p>The character must pass a Willpower test.</p>';
    const effect = '<p>The character has a deep fear.</p><p><strong>Disorders and their severity:</strong> …</p>';

    it('prefers the trigger prose when present', () => {
        expect(conciseEffect(trigger, effect)).toBe('The character must pass a Willpower test.');
    });

    it('falls back to the first paragraph of the effect when there is no trigger', () => {
        expect(conciseEffect('', effect)).toBe('The character has a deep fear.');
    });

    it('falls back to the full stripped effect when it has no paragraph markup', () => {
        expect(conciseEffect('', 'Bare effect text.')).toBe('Bare effect text.');
    });

    it('returns an empty string when neither trigger nor effect carry text', () => {
        expect(conciseEffect('', '')).toBe('');
    });
});

describe('DisorderRollDialog compendium-read wiring (#116)', () => {
    it('draws the disorder from the Disorders RollTable in the dh2-core-rolltables compendium', () => {
        expect(DIALOG_SRC).toContain('RollTableUtils');
        expect(DIALOG_SRC).toContain("'Disorders'");
        expect(DIALOG_SRC).toContain('wh40k-rpg.dh2-core-rolltables');
        // Reads the drawn table result, not an in-src disorder array.
        expect(DIALOG_SRC).toContain('.rollTable(');
    });

    it('resolves the referenced Mental Disorder item by UUID at runtime', () => {
        expect(DIALOG_SRC).toContain('fromUuid(');
        expect(DIALOG_SRC).toContain('documentUuid');
    });

    it('no longer depends on the deleted hardcoded disorders-table module', () => {
        expect(DIALOG_SRC).not.toContain('disorders-table');
        expect(DIALOG_SRC).not.toContain('rollDisorder(this.severity)');
    });
});
