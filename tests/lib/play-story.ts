/**
 * Render a Storybook story and run its `play` under happy-dom, for Vitest
 * suites that check a story's behaviour without the Storybook runner.
 *
 * The caller globs the story modules (`import.meta.glob` must be static in the
 * test file) and passes the map in.
 */

/** The surface of a story export (or the meta default) a suite renders and plays. */
interface RunnableStory {
    args?: object;
    render?: (args: object) => HTMLElement;
    play?: (context: { canvasElement: HTMLElement }) => Promise<void> | void;
}

export type StoryModule = Partial<Record<string, RunnableStory>>;

/** `import.meta.glob`'s eager form, which Vite provides to test files. */
export interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: true }) => Partial<Record<string, StoryModule>>;
}

/** Render a named story with its args over the meta defaults, then run its play. */
export async function playStory(modules: Partial<Record<string, StoryModule>>, file: string, name: string): Promise<void> {
    const module = modules[file];
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
