/**
 * Plays the #735 / #736 stories under happy-dom: the NPC sheet edits personality,
 * the custom stat overrides and its flags on every line (and the Imperium
 * Maledictum NPC its own fields); the craft sheet its class and printed traits;
 * the voidcraft sheet its hull fields and component slots.
 */
import { describe, expect, it } from 'vitest';
import { playStory, type ViteGlobMeta } from './lib/play-story.ts';

const CHARACTER = '../src/module/applications/actor/character-sheet.stories.ts';
const NPC = '../src/module/applications/actor/npc-sheet.stories.ts';
const CRAFT = '../src/module/applications/actor/craft-sheet.stories.ts';
const VOIDCRAFT = '../src/module/applications/actor/voidcraft-sheet.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    [
        '../src/module/applications/actor/character-sheet.stories.ts',
        '../src/module/applications/actor/npc-sheet.stories.ts',
        '../src/module/applications/actor/craft-sheet.stories.ts',
        '../src/module/applications/actor/voidcraft-sheet.stories.ts',
    ],
    { eager: true },
);

describe('actor sheets edit the fields their templates lacked (#735, #736)', () => {
    it.each([
        [CHARACTER, 'SchemaFields'],
        [NPC, 'SchemaFields'],
        [NPC, 'ImSchemaFields'],
        [CRAFT, 'SchemaFields'],
        [VOIDCRAFT, 'SchemaFields'],
    ])('%s %s', async (file, name) => {
        await expect(playStory(MODULES, file, name)).resolves.toBeUndefined();
    });
});
