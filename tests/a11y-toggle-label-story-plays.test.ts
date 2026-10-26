/**
 * #699: plays the stories for the Extended Test toggle (one accessible toggle,
 * the #696 pattern) and the modifiers editor's labelled characteristic boxes.
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
const MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(
    ['../src/module/applications/prompts/unified-roll-dialog.stories.ts', '../src/templates/item/panel/modifiers-editor-panel.stories.ts'],
    { eager: true },
);

/** Render a named story with its args over the meta defaults (its own render wins), then run its play. */
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

describe('Extended Test is one accessible toggle (#699)', () => {
    it.each(['ExtendedTestOff', 'ExtendedTestOn'])('%s', async (name) => {
        await expect(playStory('../src/module/applications/prompts/unified-roll-dialog.stories.ts', name)).resolves.toBeUndefined();
    });
});

describe('modifiers editor characteristic boxes are labelled (#699)', () => {
    it('BasicCharacteristicsLabelled', async () => {
        await expect(playStory('../src/templates/item/panel/modifiers-editor-panel.stories.ts', 'BasicCharacteristicsLabelled')).resolves.toBeUndefined();
    });
});
