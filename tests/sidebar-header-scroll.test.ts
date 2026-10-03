/**
 * Regression guard: the actor-sheet sidebar header scrolls; the tab nav stays pinned.
 *
 * History: tailwind/legacy-components.js pinned `.wh40k-character-header` at
 * `flex: 0 0 auto; overflow: visible` with (0,4,0) specificity. On every line whose
 * sidebar carries origin bubbles + bio fields (six of seven) the header grew past
 * the window and pushed the tab nav off the bottom, with no scroll cue. A DOM probe
 * against live Foundry showed the rule out-specifying the container's (0,3,0)
 * child variants. The header must now shrink and scroll; the nav must not shrink.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SIDEBAR_CONTAINER } from '../src/module/applications/actor/sidebar-container.ts';

const requireCjs = createRequire(import.meta.url);

/** The slice of tailwind/legacy-components.js this guard reads. */
interface LegacyComponents {
    '.wh40k-rpg.sheet.actor': { '& .wh40k-character-header': { flex: string; minHeight: string; overflowY: string } };
}
const legacy = requireCjs(join(process.cwd(), 'tailwind/legacy-components.js')) as LegacyComponents;

describe('actor sidebar header scroll', () => {
    it('lets the character header shrink and scroll inside the sidebar', () => {
        const header = legacy['.wh40k-rpg.sheet.actor']['& .wh40k-character-header'];
        expect(header).toMatchObject({ flex: '1 1 auto', minHeight: '0', overflowY: 'auto' });
    });

    it('keeps the shared sidebar container non-scrolling with the tab strip pinned', () => {
        expect(SIDEBAR_CONTAINER.classes).toContain('tw-overflow-hidden');
        expect(SIDEBAR_CONTAINER.classes).toContain('[&>[data-application-part=header]]:tw-overflow-y-auto');
        expect(SIDEBAR_CONTAINER.classes).toContain('[&>[data-application-part=tabs]]:tw-shrink-0');
    });
});
