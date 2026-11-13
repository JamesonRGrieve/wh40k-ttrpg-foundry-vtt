/**
 * Plays the armour sheet's sub-system story (#730) under happy-dom: the Mods
 * tab's sub-system slot input, its "fitted / capacity" count and each fitted
 * modification's kind label.
 */
import { describe, expect, it } from 'vitest';

/** The surface of a story export (or the meta default) this suite renders and plays. */
interface RunnableStory {
    args?: object;
    render?: (args: object) => HTMLElement;
    play?: (context: { canvasElement: HTMLElement }) => Promise<void>;
}
type StoryModule = Partial<Record<string, RunnableStory>>;
interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: true }) => Partial<Record<string, StoryModule>>;
}
const FILE = '../src/module/applications/item/armour-sheet.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/item/armour-sheet.stories.ts'], { eager: true });

/** Render a named story with its args over the meta defaults, then run its play. */
async function playStory(name: string): Promise<void> {
    const module = MODULES[FILE];
    const meta = module?.['default'];
    const story = module?.[name];
    const render = story?.render ?? meta?.render;
    if (render === undefined) throw new Error(`${FILE} not loaded`);
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

describe('armour sheet sub-system story (#730)', () => {
    it('LegionPowerArmourSubsystems', async () => {
        await expect(playStory('LegionPowerArmourSubsystems')).resolves.toBeUndefined();
    });
});
