/**
 * Runs the #120 / #665 grapple stories' `play` assertions under vitest, so the
 * panel's per-line, per-role options, the option card (its push and named item),
 * the Damage Opponent damage card and the push / item dialogs are checked on every
 * test run, not only in the Storybook browser suite. Same runner shape as
 * `npc-sidebar-aptitude-stories.test.ts`.
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
    [
        '../stories/actor-panels/grapple-controller-panel.stories.ts',
        '../src/templates/chat/grapple-opposed-chat.stories.ts',
        '../stories/chat-cards/grapple-damage-card.stories.ts',
        '../src/templates/prompt/grapple-dialogs.stories.ts',
    ],
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
    { path: '../stories/actor-panels/grapple-controller-panel.stories.ts', expected: ['Controller', 'Target', 'GameMaster', 'PerLineRoles'] },
    {
        path: '../src/templates/chat/grapple-opposed-chat.stories.ts',
        expected: [
            'ControllerWins',
            'ThrownDownBonus',
            'TakeControlWins',
            'ContortionistEscape',
            'ReadyDeclared',
            'PushWon',
            'PushCapped',
            'PushLost',
            'UseItemNamed',
            'PerSystem',
        ],
    },
    { path: '../stories/chat-cards/grapple-damage-card.stories.ts', expected: ['DamageOpponentHit', 'DH1RolledLocation', 'NoFatigueRow', 'PerSystem'] },
    { path: '../src/templates/prompt/grapple-dialogs.stories.ts', expected: ['PushDialog', 'PushLetGo', 'ItemDialog'] },
])('#120 stories in $path', ({ path, expected }) => {
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
