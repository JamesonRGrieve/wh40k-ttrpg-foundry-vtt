/**
 * Plays the #732 schema-field stories under happy-dom: on the weapon, gear and
 * ammunition sheets, the fields their templates lacked render through the shared
 * schema rows, submit under their `system.` paths, and render on every line.
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const FILES = ['../stories/WeaponSheet.stories.ts', '../stories/GearSheet.stories.ts', '../src/module/applications/item/ammo-sheet.stories.ts'];
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    ['../stories/WeaponSheet.stories.ts', '../stories/GearSheet.stories.ts', '../src/module/applications/item/ammo-sheet.stories.ts'],
    { eager: true },
);

describe('physical item sheets edit the fields their templates lacked (#732)', () => {
    it.each(FILES)('%s SchemaFields', async (file) => {
        await expect(playStory(MODULES, file, 'SchemaFields')).resolves.toBeUndefined();
    });
});
