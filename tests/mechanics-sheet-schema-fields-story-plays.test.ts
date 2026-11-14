/**
 * Plays the #733 schema-field stories under happy-dom: the psychic power, talent,
 * trait, skill and dark pact sheets edit their structured mechanics through the
 * shared schema rows; each input submits under its `system.` path on every line.
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const FILES = [
    '../src/module/applications/item/psychic-power-sheet.stories.ts',
    '../src/module/applications/item/talent-sheet.stories.ts',
    '../src/module/applications/item/trait-sheet.stories.ts',
    '../src/module/applications/item/skill-sheet.stories.ts',
    '../src/module/applications/item/dark-pact-sheet.stories.ts',
];
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    [
        '../src/module/applications/item/psychic-power-sheet.stories.ts',
        '../src/module/applications/item/talent-sheet.stories.ts',
        '../src/module/applications/item/trait-sheet.stories.ts',
        '../src/module/applications/item/skill-sheet.stories.ts',
        '../src/module/applications/item/dark-pact-sheet.stories.ts',
    ],
    { eager: true },
);

describe('the mechanics sheets edit their structured fields (#733)', () => {
    it.each(FILES)('%s SchemaFields', async (file) => {
        await expect(playStory(MODULES, file, 'SchemaFields')).resolves.toBeUndefined();
    });

    it('a skill with no descriptor still shows the schema rows (#734)', async () => {
        await expect(playStory(MODULES, '../src/module/applications/item/skill-sheet.stories.ts', 'SchemaFieldsWithoutDescriptor')).resolves.toBeUndefined();
    });
});
