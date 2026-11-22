/**
 * Plays the builder's DH2 roll-mode story (#760) under happy-dom: the home world's
 * + characteristics are labelled as keeping the best 2 of 3d10, its − the worst 2,
 * and none of them adds a flat bonus.
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
const FILE = '../src/module/applications/character-creation/origin-path-builder.stories.ts';
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/character-creation/origin-path-builder.stories.ts'], {
    eager: true,
});

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

describe('DH2 characteristic dice story (#760)', () => {
    it.each(['RollModeDH2HomeWorldDice', 'RollMode'])('%s', async (name) => {
        await expect(playStory(name)).resolves.toBeUndefined();
    });
});
