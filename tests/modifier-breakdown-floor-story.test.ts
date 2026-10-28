/**
 * A target breakdown whose rows sum below 0 says the target was floored at 0
 * (roll transparency, #701 audit). Plays the shared modifier-breakdown stories:
 * the floored one shows the raw sum, the plain one shows no floor row.
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
const MODULE = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/templates/chat/modifier-breakdown.stories.ts'], { eager: true })[
    '../src/templates/chat/modifier-breakdown.stories.ts'
];

/** Render a named story with its args over the meta defaults, then run its play. */
async function playStory(name: string): Promise<void> {
    const meta = MODULE?.['default'];
    const story = MODULE?.[name];
    const render = story?.render ?? meta?.render;
    if (render === undefined) throw new Error('modifier-breakdown stories not loaded');
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

describe('modifier breakdown: a target floored at 0 says so', () => {
    it('prints the raw sum when the rows add up below 0', async () => {
        await expect(playStory('TargetFloored')).resolves.toBeUndefined();
    });

    it('prints no floor row when the sum is positive', async () => {
        await expect(playStory('SourcedComponents')).resolves.toBeUndefined();
    });
});
