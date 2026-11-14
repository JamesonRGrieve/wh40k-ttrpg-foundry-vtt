/**
 * Plays the #734 stories under happy-dom: the campaign and authoring item sheets
 * edit the fields their templates lacked (leads, groups, storage, location rules,
 * origin authoring, NPC template options and every item's acquisition note), and
 * a critical injury offers every stored severity plus the next one to add.
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const FILES = [
    '../src/module/applications/item/journal-entry-item-sheet.stories.ts',
    '../src/module/applications/item/peer-enemy-sheet.stories.ts',
    '../src/module/applications/item/storage-location-sheet.stories.ts',
    '../src/module/applications/item/location-sheet.stories.ts',
    '../src/module/applications/item/origin-path-sheet.stories.ts',
    '../src/module/applications/item/npc-template-sheet.stories.ts',
    '../src/module/applications/item/base-item-sheet.stories.ts',
];
const INJURY = '../src/module/applications/item/critical-injury-sheet.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    [
        '../src/module/applications/item/journal-entry-item-sheet.stories.ts',
        '../src/module/applications/item/peer-enemy-sheet.stories.ts',
        '../src/module/applications/item/storage-location-sheet.stories.ts',
        '../src/module/applications/item/location-sheet.stories.ts',
        '../src/module/applications/item/origin-path-sheet.stories.ts',
        '../src/module/applications/item/npc-template-sheet.stories.ts',
        '../src/module/applications/item/base-item-sheet.stories.ts',
        '../src/module/applications/item/critical-injury-sheet.stories.ts',
    ],
    { eager: true },
);

describe('campaign and authoring item sheets edit their stored fields (#734)', () => {
    it.each(FILES)('%s SchemaFields', async (file) => {
        await expect(playStory(MODULES, file, 'SchemaFields')).resolves.toBeUndefined();
    });

    it('a critical injury edits each stored severity and offers the next one', async () => {
        await expect(playStory(MODULES, INJURY, 'SeverityLevelsEditable')).resolves.toBeUndefined();
    });
});
