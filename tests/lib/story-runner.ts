/**
 * Run a Storybook story's `play` under Vitest (happy-dom), the way the Storybook
 * canvas does: meta args under story args, the story's render (else the meta's),
 * then the story's play (else the meta's). Lets a suite check a component's play
 * assertions on every test run, not only in the browser suite.
 */
import type { Args, Meta, StoryContext, StoryObj } from '@storybook/html-vite';
import { expect, it } from 'vitest';

/** Render one story into the document and run its play function (a story with none just renders). */
async function runStory<A extends Args>(meta: Meta<A>, story: StoryObj<A>): Promise<void> {
    const args = { ...meta.args, ...story.args } as A;
    const render = story.render ?? meta.render;
    if (render === undefined) throw new Error('the story has no render function');
    // Storybook mounts the rendered element INSIDE its canvas root and hands the play
    // that root, so the play sees the story's element as a child, never as itself.
    const canvasElement: HTMLElement = document.createElement('div');
    canvasElement.id = 'storybook-root';
    document.body.replaceChildren(canvasElement);
    const context = { args, canvasElement } as StoryContext<A>;
    const rendered = render(args, context);
    if (rendered instanceof HTMLElement) canvasElement.appendChild(rendered);
    const play = story.play ?? meta.play;
    if (play !== undefined) await play({ ...context, canvasElement });
}

/** A stories module: its default meta and its named stories. */
type StoryModule<A extends Args> = { default: Meta<A> } & Record<string, StoryObj<A> | Meta<A>>;

/** A stories module's named story exports (everything but the default meta), as [name, story] pairs. */
function storiesOf<A extends Args>(module: StoryModule<A>): Array<[string, StoryObj<A>]> {
    return Object.entries(module).filter((entry): entry is [string, StoryObj<A>] => entry[0] !== 'default');
}

/**
 * The tests for a stories module, registered in the calling `describe`: it exports
 * the `expected` stories, and every story's play passes.
 */
export function storyPlayTests<A extends Args>(module: StoryModule<A>, expected: readonly string[]): void {
    const stories = storiesOf(module);

    it('exports every story', () => {
        expect(stories.map(([key]) => key)).toEqual(expect.arrayContaining([...expected]));
    });

    it.each(stories)('%s passes its play assertions', async (_key, story) => {
        await expect(runStory(module.default, story)).resolves.toBeUndefined();
    });
}

/**
 * The tests for some of a stories module's stories only: each named story exists
 * and its play passes. For a module whose other stories need the browser canvas.
 */
export function namedStoryPlayTests<A extends Args>(module: StoryModule<A>, names: readonly string[]): void {
    const stories = storiesOf(module).filter(([key]) => names.includes(key));

    it('exports every named story', () => {
        expect(stories.map(([key]) => key)).toEqual(expect.arrayContaining([...names]));
    });

    it.each(stories)('%s passes its play assertions', async (_key, story) => {
        await expect(runStory(module.default, story)).resolves.toBeUndefined();
    });
}
