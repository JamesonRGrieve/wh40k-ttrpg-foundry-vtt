/**
 * content#35: a psychic power keeps the discipline its book prints. Plays the
 * PsychicPowerSheet story whose power is BC's "Nurgle": the sheet's select keeps it
 * selected ahead of the tree names, and the header shows it as printed.
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
const MODULE = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/module/applications/item/psychic-power-sheet.stories.ts'], { eager: true })[
    '../src/module/applications/item/psychic-power-sheet.stories.ts'
];

/** Render a named story and run its play. */
async function playStory(name: string): Promise<void> {
    const story = MODULE?.[name];
    if (story?.render === undefined || story.play === undefined) throw new Error(`${name} story not loaded`);
    const canvasElement = document.createElement('div');
    canvasElement.appendChild(story.render({}));
    document.body.appendChild(canvasElement);
    try {
        await story.play({ canvasElement });
    } finally {
        canvasElement.remove();
    }
}

describe('PsychicPowerSheet printed discipline (content#35)', () => {
    it('keeps "Nurgle" selected and shows it in the header', async () => {
        await expect(playStory('PrintedDisciplineKept')).resolves.toBeUndefined();
    });
});
