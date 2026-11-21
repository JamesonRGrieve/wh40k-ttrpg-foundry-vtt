/**
 * Plays the quick-template form's stories (#758) under happy-dom: the smoke-grenade
 * defaults, a Blind Grenade with its condition and duration, a flamer cone's two sizes,
 * an unplaceable size, and the actions its buttons send.
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
const FILE = '../src/module/applications/prompts/quick-template-dialog.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/prompts/quick-template-dialog.stories.ts'], { eager: true });

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

describe('quick template stories (#758)', () => {
    it.each(['SmokeCircle', 'BlindGrenade', 'FlamerCone', 'InvalidSize', 'Actions'])('%s', async (name) => {
        await expect(playStory(name)).resolves.toBeUndefined();
    });
});
