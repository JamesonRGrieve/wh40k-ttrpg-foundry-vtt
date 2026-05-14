/**
 * Regression guard: sheet methods reachable from `_onClose` must not touch
 * `this.element` without a null guard.
 *
 * History: Foundry's close path tears down the DOM before all our cleanup
 * runs. `_onClose` -> `_saveSheetState` -> `_captureScrollPositions` was
 * calling `this.element.querySelectorAll(...)` on an element that had
 * already been nulled out, throwing
 * `Cannot read properties of null (reading 'querySelectorAll')` and
 * leaving the close half-finished. `_applyScrollPositions` is the
 * symmetric restore method — same crash latent there if the sheet is
 * ever re-rendered against a torn-down element.
 *
 * The test is intentionally source-scan rather than runtime: instantiating
 * the sheet requires a live Foundry application API, which the test env
 * does not provide. The pattern we need to enforce is a literal one
 * (`this.element` is null after teardown — every read path needs a guard)
 * and is more durable as a static check than a mocked-runtime one.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BASE_PATH = resolve(__dirname, '../src/module/applications/actor/base-actor-sheet.ts');
const baseSrc = readFileSync(BASE_PATH, 'utf8');

/**
 * Extract a method body from the source by name. Returns just the text
 * between the first `{` of the signature and its matching `}`. Assumes the
 * codebase's 4-space indent style: the closing brace lives on a line of
 * exactly 4 spaces + `}` (the indent of class members).
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

describe('actor sheet close-path null safety', () => {
    const captureBody = extractMethodBody(baseSrc, '_captureScrollPositions');
    const applyBody = extractMethodBody(baseSrc, '_applyScrollPositions');

    it('_captureScrollPositions early-returns when this.element is null', () => {
        // Sentinel guard the fix introduced: `const root = this.element as HTMLElement | null;`
        // followed by an early return on null. We assert the presence of both the cast and the
        // null check so a future refactor that drops either re-introduces the crash.
        expect(captureBody).toMatch(/this\.element\s+as\s+HTMLElement\s*\|\s*null/);
        expect(captureBody).toMatch(/if\s*\(\s*root\s*===\s*null\s*\)\s*return/);
    });

    it('_applyScrollPositions early-returns when this.element is null', () => {
        expect(applyBody).toMatch(/this\.element\s+as\s+HTMLElement\s*\|\s*null/);
        expect(applyBody).toMatch(/if\s*\(\s*root\s*===\s*null\s*\)\s*return/);
    });

    it('_captureScrollPositions does not read this.element after the guard (uses local `root` instead)', () => {
        // After the guard, the method must dereference `root` (not `this.element` again),
        // because `this.element` is still typed as non-null and would mask the very issue
        // we are guarding against.
        const afterGuard = captureBody.split(/if\s*\(\s*root\s*===\s*null\s*\)\s*return;?/)[1] ?? '';
        expect(afterGuard).not.toMatch(/this\.element\./);
        expect(afterGuard).toMatch(/root\.querySelectorAll/);
    });

    it('_applyScrollPositions does not read this.element after the guard (uses local `root` instead)', () => {
        const afterGuard = applyBody.split(/if\s*\(\s*root\s*===\s*null\s*\)\s*return;?/)[1] ?? '';
        expect(afterGuard).not.toMatch(/this\.element\./);
        expect(afterGuard).toMatch(/root\.querySelectorAll/);
    });
});

describe('close-reachable methods do not touch this.element unguarded', () => {
    /**
     * `_onClose` -> `_saveSheetState` -> `_captureScrollPositions` is the
     * documented close chain. We verify `_saveSheetState` itself does not
     * read `this.element` directly (it only delegates to the guarded
     * `_captureScrollPositions`). If a future edit inlines element work
     * back into `_saveSheetState`, this test fails and reminds the editor
     * to add a guard.
     */
    const saveStateBody = extractMethodBody(baseSrc, '_saveSheetState');

    it('_saveSheetState does not read this.element directly', () => {
        expect(saveStateBody).not.toMatch(/this\.element\b/);
    });

    it('_onClose only calls _saveSheetState and cleanup — no direct this.element access', () => {
        const onCloseBody = extractMethodBody(baseSrc, '_onClose');
        // Stripped of comments, _onClose must not read this.element. (Cleanup of
        // listeners and observers is fine — those are non-DOM references stored
        // on `this`.)
        const stripped = onCloseBody.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(stripped).not.toMatch(/this\.element\b/);
    });
});
