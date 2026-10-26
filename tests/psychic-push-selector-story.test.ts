/**
 * #178: Fettered halves Psy Rating rounding up, as every line prints it. Plays the
 * Psychic Push Selector story whose psyker has PR 3: the panel's effective PR reads 2.
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
const MODULE = (import.meta as ImportMeta & ViteGlobMeta).glob(['../stories/dialogs/psychic-push-selector.stories.ts'], { eager: true })[
    '../stories/dialogs/psychic-push-selector.stories.ts'
];

/** Render a named story with its args over the meta defaults, then run its play. */
async function playStory(name: string): Promise<void> {
    const meta = MODULE?.['default'];
    const story = MODULE?.[name];
    if (meta?.render === undefined) throw new Error('psychic-push-selector stories not loaded');
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

describe('Psychic Push Selector: Fettered rounds Psy Rating up (#178)', () => {
    it('PR 3 Fettered manifests at PR 2', async () => {
        await expect(playStory('FetteredOddRating')).resolves.toBeUndefined();
    });
});
