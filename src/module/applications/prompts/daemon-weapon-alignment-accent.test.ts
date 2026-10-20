import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../../testing/repo-file.ts';
import { ALIGNMENT_ACCENT_CLASS } from './daemon-weapon-alignment-accent.ts';

/**
 * The Daemon Weapon Attribute roller's alignment accents (#683). The dialog's stories
 * imported this table from the dialog module, which reads `foundry.applications.api`
 * when it loads; Storybook has no `foundry` global, so the "Chat card output" story
 * failed with `foundry is not defined`. The table now lives in its own module, which
 * loads without Foundry.
 */

describe('ALIGNMENT_ACCENT_CLASS', () => {
    it('loads with no foundry global, and gives every alignment an accent', () => {
        expect('foundry' in globalThis).toBe(false);
        expect(Object.keys(ALIGNMENT_ACCENT_CLASS).sort()).toEqual(['khorne', 'nurgle', 'slaanesh', 'tzeentch', 'unaligned']);
        expect(Object.values(ALIGNMENT_ACCENT_CLASS).every((cls) => cls.startsWith('tw-text-'))).toBe(true);
    });

    it("the dialog's stories import it from here, not from the Foundry-bound dialog module", () => {
        const stories = readRepoFile('src/module/applications/prompts/daemon-weapon-attribute-dialog.stories.ts');
        expect(stories).toContain("from './daemon-weapon-alignment-accent.ts'");
        expect(stories).not.toContain("from './daemon-weapon-attribute-dialog.ts'");
    });
});
