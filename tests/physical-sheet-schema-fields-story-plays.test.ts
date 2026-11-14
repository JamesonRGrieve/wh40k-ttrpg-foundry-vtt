/**
 * Plays the #732 schema-field stories under happy-dom: on the weapon, gear and
 * ammunition sheets, the fields their templates lacked render through the shared
 * schema rows, submit under their `system.` paths, and render on every line.
 */
import { describe, expect, it } from 'vitest';

/** The surface of a story export (or the meta default) this suite renders and plays. */
interface RunnableStory {
    args?: object;
    render?: (args: object) => HTMLElement;
    play?: (context: { canvasElement: HTMLElement }) => Promise<void> | void;
}
type StoryModule = Partial<Record<string, RunnableStory>>;
interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: true }) => Partial<Record<string, StoryModule>>;
}
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    ['../stories/WeaponSheet.stories.ts', '../stories/GearSheet.stories.ts', '../src/module/applications/item/ammo-sheet.stories.ts'],
    { eager: true },
);

/** Render a story with its args over the meta defaults, then run its play. */
async function playStory(file: string, name: string): Promise<void> {
    const module = MODULES[file];
    const meta = module?.['default'];
    const story = module?.[name];
    const render = story?.render ?? meta?.render;
    if (render === undefined) throw new Error(`${file} not loaded`);
    if (story?.play === undefined) throw new Error(`${name} has no play`);
    const canvasElement = document.createElement('div');
    canvasElement.appendChild(render({ ...meta?.args, ...story.args }));
    document.body.appendChild(canvasElement);
    try {
        await story.play({ canvasElement });
    } finally {
        canvasElement.remove();
    }
}

describe('physical item sheets edit the fields their templates lacked (#732)', () => {
    it.each(['../stories/WeaponSheet.stories.ts', '../stories/GearSheet.stories.ts', '../src/module/applications/item/ammo-sheet.stories.ts'])(
        '%s SchemaFields',
        async (file) => {
            await expect(playStory(file, 'SchemaFields')).resolves.toBeUndefined();
        },
    );
});
