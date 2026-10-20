/**
 * The Advancement Dialog charges a shared psychic power the XP its owner's line
 * prints (content#30). Plays the two AdvancementDialog stories that price
 * Precognition and Cauterise through `costForLine` for a BC and a DH2 psyker.
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
const MODULE = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/dialogs/advancement-dialog.stories.ts'], { eager: true })[
    '../src/module/applications/dialogs/advancement-dialog.stories.ts'
];

/** Render a named story with its args over the meta defaults, then run its play. */
async function playStory(name: string): Promise<void> {
    const meta = MODULE?.['default'];
    const story = MODULE?.[name];
    if (meta?.render === undefined) throw new Error('advancement-dialog stories not loaded');
    if (story?.play === undefined) throw new Error(`${name} has no play`);
    const canvasElement = document.createElement('div');
    canvasElement.appendChild(meta.render({ ...meta.args, ...story.args }));
    document.body.appendChild(canvasElement);
    try {
        await story.play({ canvasElement });
    } finally {
        canvasElement.remove();
    }
}

describe('Advancement Dialog psychic powers at printed XP (content#30)', () => {
    it.each(['PsychicPrintedXpBC', 'PsychicPrintedXpDH2'])('%s charges each power its line prints', async (name) => {
        await expect(playStory(name)).resolves.toBeUndefined();
    });
});
