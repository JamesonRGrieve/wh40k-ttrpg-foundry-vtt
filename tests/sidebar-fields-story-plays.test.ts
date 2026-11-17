/**
 * Plays the sidebar field stories under happy-dom: the career Rank row a GM edits
 * (empty, the rank the XP reaches as its placeholder), a GM override, and the same
 * row a player sees but cannot edit (operator ruling 2026-11-16).
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const FILE = '../src/templates/actor/partial/sidebar-fields-panel.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/templates/actor/partial/sidebar-fields-panel.stories.ts'], { eager: true });

describe('the sidebar Rank row', () => {
    it.each(['GmRankFromExperience', 'GmOverride', 'PlayerSeesRank'])('%s', async (name) => {
        await expect(playStory(MODULES, FILE, name)).resolves.toBeUndefined();
    });
});
