/**
 * Regression guard: system windows have an opaque surface.
 *
 * History: Foundry's window body is translucent, and system dialogs set no
 * background, so the canvas art showed through dialog text (the Character
 * Advancement screenshot read as text over a d20 watermark). A Tailwind utility
 * cannot fix this — `.window-content` is emitted by ApplicationV2 and the frame
 * root is itself `.wh40k-rpg`, outside the `.wh40k-rpg .tw-x` utility scope — so
 * one base rule in tailwind/legacy-components.js paints it.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const requireCjs = createRequire(import.meta.url);

/** The slice of tailwind/legacy-components.js this guard reads. */
interface LegacyComponents {
    '.wh40k-rpg.application > .window-content': { backgroundColor: string };
}
const legacy = requireCjs(join(process.cwd(), 'tailwind/legacy-components.js')) as LegacyComponents;

describe('system window surface', () => {
    it('paints every .wh40k-rpg window body with the opaque primary surface', () => {
        expect(legacy['.wh40k-rpg.application > .window-content'].backgroundColor).toBe('var(--color-bg-primary, #1a1a1a)');
    });
});
