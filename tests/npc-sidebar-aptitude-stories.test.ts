/**
 * Runs the #630 / #631 stories' `play` assertions under vitest, so the NPC
 * sidebar structure (Daemonic badge on the portrait, fitted long names) and the
 * per-line Aptitudes panel are checked on every test run, not only in the
 * Storybook browser suite.
 *
 * The modules load through Vite's glob import, as in
 * `story-renders-no-object-object.test.ts`, typed by the minimal CSF surface
 * this runner reads.
 */
import { describe, expect, it } from 'vitest';

/** The story args this runner passes through: an open bag the meta's defaults complete. */
interface StoryArgs {
    [key: string]: string | number | boolean | null | object | undefined;
}
interface StoryContext {
    canvasElement: HTMLElement;
    args: StoryArgs;
}
interface RunnableStory {
    args?: StoryArgs;
    render?: (args: StoryArgs, context: { args: StoryArgs }) => HTMLElement;
    play?: (context: StoryContext) => Promise<void>;
}
type StoryModule = Record<string, RunnableStory | undefined>;

interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: true }) => Partial<Record<string, StoryModule>>;
}

const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    ['../stories/actor-panels/daemonic-immunities-badge.stories.ts', '../stories/actor-panels/aptitudes-panel.stories.ts'],
    { eager: true },
);

function moduleAt(path: string): StoryModule {
    const module = MODULES[path];
    if (module === undefined) throw new Error(`story module ${path} not loaded`);
    return module;
}

/** Render a story into a canvas element and run its play function. */
async function runStory(meta: RunnableStory, story: RunnableStory): Promise<void> {
    const args: StoryArgs = { ...meta.args, ...story.args };
    const render = story.render ?? meta.render;
    if (render === undefined) throw new Error('story has no render function');
    const canvasElement = document.createElement('div');
    canvasElement.appendChild(render(args, { args }));
    document.body.appendChild(canvasElement);
    try {
        await story.play?.({ canvasElement, args });
    } finally {
        canvasElement.remove();
    }
}

function storiesOf(module: StoryModule): Array<[string, RunnableStory]> {
    const stories: Array<[string, RunnableStory]> = [];
    for (const [key, story] of Object.entries(module)) if (key !== 'default' && story !== undefined) stories.push([key, story]);
    return stories;
}

describe.each([
    {
        issue: '#630',
        path: '../stories/actor-panels/daemonic-immunities-badge.stories.ts',
        expected: ['Default', 'BloodletterSidebar', 'LongNameSidebar', 'ShortNameKeepsBaseSize', 'WithJournalControl', 'EveryLine'],
    },
    { issue: '#631', path: '../stories/actor-panels/aptitudes-panel.stories.ts', expected: ['BlackCrusadeNpc', 'DarkHeresy2Npc', 'EveryLine'] },
])('$issue stories in $path', ({ path, expected }) => {
    const module = moduleAt(path);
    const meta = module['default'] ?? {};
    const stories = storiesOf(module);

    it('exports every story', () => {
        expect(stories.map(([key]) => key)).toEqual(expect.arrayContaining(expected));
    });

    it.each(stories)('%s passes its play assertions', async (_key, story) => {
        await expect(runStory(meta, story)).resolves.toBeUndefined();
    });
});
