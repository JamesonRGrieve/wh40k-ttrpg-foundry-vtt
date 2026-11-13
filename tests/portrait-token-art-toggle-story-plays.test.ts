/**
 * Plays every story of the portrait's token art toggle (circular bust or whole
 * art) under happy-dom: the switch's role, state, labels, placement above the
 * portrait and the action it dispatches, in the identity partial and the craft
 * header, across three game lines.
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
const FILE = '../src/templates/actor/partial/portrait-token-art-toggle.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/templates/actor/partial/portrait-token-art-toggle.stories.ts'], { eager: true });

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

describe('portrait token art toggle stories', () => {
    it.each(['BustDH2', 'FullArtRT', 'NotOwner', 'CraftHeaderBC'])('%s', async (name) => {
        await expect(playStory(name)).resolves.toBeUndefined();
    });
});
