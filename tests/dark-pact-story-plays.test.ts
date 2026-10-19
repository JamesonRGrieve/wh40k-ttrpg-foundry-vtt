/**
 * Run every Dark Pact story's play function under happy-dom (#84): the pact
 * item sheet and the Dark Pacts panel, across all six lines. The plays assert
 * the pact names render through `uuidNameCache`, the Boons and Banes and their
 * mechanics show, and the GM's add controls dispatch the right actions.
 */
import type { Args, Meta, StoryContext, StoryObj } from '@storybook/html-vite';
import { describe, expect, it } from 'vitest';
import * as pactSheet from '../src/module/applications/item/dark-pact-sheet.stories.ts';
import * as pactPanel from '../stories/actor-panels/dark-pact-panel.stories.ts';

async function runStory<A extends Args>(meta: Meta<A>, story: StoryObj<A>): Promise<void> {
    const args = { ...meta.args, ...story.args } as A;
    const render = story.render ?? meta.render;
    if (render === undefined) throw new Error('the story has no render function');
    const context = { args, canvasElement: document.body } as StoryContext<A>;
    const rendered = render(args, context);
    const canvasElement = rendered instanceof HTMLElement ? rendered : document.createElement('div');
    document.body.replaceChildren(canvasElement);
    const play = story.play ?? meta.play;
    if (play === undefined) throw new Error('the story has no play function');
    await play({ ...context, canvasElement });
}

/** A stories module's named story exports (everything but the default meta). */
function storiesOf<A extends Args>(module: { default: Meta<A> } & Record<string, StoryObj<A> | Meta<A>>): Array<[string, StoryObj<A>]> {
    return Object.entries(module).filter((entry): entry is [string, StoryObj<A>] => entry[0] !== 'default');
}

describe('Dark Pact item sheet stories (#84)', () => {
    const stories = storiesOf(pactSheet);
    it('covers the six lines', () => {
        expect(stories.filter(([name]) => name.startsWith('Homologation'))).toHaveLength(6);
    });
    it.each(stories)('%s', async (_name, story) => {
        await expect(runStory(pactSheet.default, story)).resolves.toBeUndefined();
    });
});

describe('Dark Pacts panel stories (#84)', () => {
    const stories = storiesOf(pactPanel);
    it('covers the six lines', () => {
        expect(stories.filter(([name]) => name.startsWith('Homologation'))).toHaveLength(6);
    });
    it.each(stories)('%s', async (_name, story) => {
        await expect(runStory(pactPanel.default, story)).resolves.toBeUndefined();
    });
});
