/**
 * Regression guard: the "origin path incomplete" prompt must render above the
 * character sheet it is opened from, and must not stretch to the full auto
 * width of its long message.
 *
 * History: the prompt was spawned via `dialogV2.wait({...})` with no `modal`
 * flag and no `position`. Without `modal: true`, Foundry's DialogV2 calls
 * `this.element.show()` (a non-modal <dialog> in normal z-index flow), so the
 * character sheet — opened in the same `_onFirstRender` pass — covered it.
 * Without an explicit `position`, the dialog inherited `width: "auto"` and the
 * ~190-character prompt message stretched it across the screen. The fix sets
 * `modal: true` (Foundry then calls `element.showModal()`, placing the dialog
 * in the browser top layer, always above the sheet) and a narrow/taller
 * `position` so the message wraps comfortably.
 *
 * The test is source-scan rather than runtime: instantiating CharacterSheet
 * requires a live Foundry application API the test env does not provide, and
 * the contract here is a literal one on the dialog config object.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHEET_PATH = resolve(__dirname, '../src/module/applications/actor/character-sheet.ts');
const sheetSrc = readFileSync(SHEET_PATH, 'utf8');

/**
 * Extract a method body from the source by name. Returns the text between the
 * first `{` of the signature and its matching `}` (the codebase's 4-space
 * member indent, so the close brace is a line of exactly 4 spaces + `}`).
 */
function extractMethodBody(src: string, methodName: string): string {
    const sigRe = new RegExp(`^ {4}(?:override\\s+|protected\\s+|private\\s+|public\\s+)*(?:async\\s+)?${methodName}\\s*\\([^)]*\\)[^{]*\\{`, 'm');
    const sigMatch = sigRe.exec(src);
    if (sigMatch === null) {
        throw new Error(`method ${methodName} not found`);
    }
    const start = sigMatch.index + sigMatch[0].length;
    const endIdx = src.indexOf('\n    }\n', start);
    if (endIdx === -1) {
        throw new Error(`method ${methodName} has no matching close brace`);
    }
    return src.slice(start, endIdx);
}

describe('origin-path-incomplete prompt layout', () => {
    const body = extractMethodBody(sheetSrc, '#maybePromptOriginPathIncomplete');

    it('opens the dialog as modal so it renders above the character sheet', () => {
        // `modal: true` => Foundry's DialogV2 calls element.showModal(), which
        // puts the <dialog> in the browser top layer (always above the sheet).
        expect(body).toMatch(/modal:\s*true/);
    });

    it('constrains the dialog to an explicit narrow width and taller height', () => {
        // An explicit position prevents the long message from stretching the
        // auto-width dialog. Width must be set and narrower than the height.
        const posMatch = /position:\s*\{\s*width:\s*(\d+)\s*,\s*height:\s*(\d+)\s*\}/.exec(body);
        expect(posMatch).not.toBeNull();
        const width = Number(posMatch?.[1]);
        const height = Number(posMatch?.[2]);
        expect(width).toBeGreaterThan(0);
        // "half as wide and taller" — narrow column, taller than it is wide.
        expect(height).toBeGreaterThan(width);
    });
});
