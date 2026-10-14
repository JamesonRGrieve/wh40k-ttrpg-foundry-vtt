/**
 * Guard: no rendered Storybook story contains the literal `[object Object]` (#229).
 *
 * The defect class this guards — a structured value (the `system.source`
 * provenance object above all) interpolated straight into a template — renders
 * the JavaScript default stringification instead of a label. It slipped past
 * every per-template test because each one only checked its own fields, so this
 * test renders EVERY story the Storybook build ships and scans the output.
 *
 * Stories render through the same Handlebars bridge Storybook uses
 * (`stories/template-support.ts`), so a story that renders here renders the
 * same markup in the browser. A story whose render throws under happy-dom (the
 * handful that need a live canvas) is reported, not hidden: the floor below
 * keeps the scanned set from quietly shrinking to nothing.
 */
import { describe, expect, it } from 'vitest';

/** The minimal Storybook CSF surface this scan reads off a story module. */
interface StoryArgs {
    [key: string]: StoryArgs | string | number | boolean | null | undefined | object;
}
interface StoryObject {
    args?: StoryArgs;
    render?: (args: StoryArgs, context: StoryRenderContext) => StoryRenderResult;
}
interface StoryMeta extends StoryObject {
    title?: string;
}
interface StoryRenderContext {
    args: StoryArgs;
    globals: Record<string, string>;
}
type StoryRenderResult = HTMLElement | DocumentFragment | string | Promise<HTMLElement | DocumentFragment | string>;
type StoryModule = Record<string, StoryObject | StoryMeta | undefined>;

interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: false }) => Record<string, () => Promise<StoryModule>>;
}

const STORY_MODULES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/**/*.stories.ts', '../stories/**/*.stories.ts'], { eager: false });

/**
 * The rendered-story floor (1,319 rendered when this guard landed; ~38 need a
 * live canvas or a Foundry-core helper the story bridge lacks). Lowering it
 * needs a reason in the commit.
 */
const MIN_RENDERED_STORIES = 1300;

const OBJECT_OBJECT = '[object Object]';

/** Characters of markup shown either side of an offending match. */
const SNIPPET_RADIUS = 160;

function isStoryObject(value: StoryObject | StoryMeta | undefined): value is StoryObject {
    return value !== undefined && typeof value === 'object';
}

function markupOf(result: HTMLElement | DocumentFragment | string): string {
    if (typeof result === 'string') return result;
    if (result instanceof HTMLElement) return result.outerHTML;
    const holder = document.createElement('div');
    holder.appendChild(result.cloneNode(true));
    return holder.innerHTML;
}

/** Render one story, returning its markup or the error it threw. */
async function renderStory(meta: StoryMeta, story: StoryObject): Promise<{ markup: string } | { error: string }> {
    const render = story.render ?? meta.render;
    if (render === undefined) return { error: 'no render function' };
    const args: StoryArgs = { ...meta.args, ...story.args };
    try {
        const result = await render(args, { args, globals: {} });
        return { markup: markupOf(result) };
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}

describe('every story renders without "[object Object]" (#229)', () => {
    it('scans every story the Storybook build ships', async () => {
        const offenders: string[] = [];
        const failures: string[] = [];
        let rendered = 0;

        for (const [path, load] of Object.entries(STORY_MODULES)) {
            let mod: StoryModule;
            try {
                // eslint-disable-next-line no-await-in-loop -- sequential import keeps the shared Handlebars registry deterministic
                mod = await load();
            } catch (err) {
                failures.push(`${path}: import failed: ${err instanceof Error ? err.message : String(err)}`);
                continue;
            }
            const meta: StoryMeta = mod['default'] ?? {};
            for (const [exportName, story] of Object.entries(mod)) {
                if (exportName === 'default' || !isStoryObject(story)) continue;
                // eslint-disable-next-line no-await-in-loop -- stories share one Handlebars registry; render them one at a time
                const outcome = await renderStory(meta, story);
                if ('error' in outcome) {
                    failures.push(`${path}#${exportName}: ${outcome.error}`);
                    continue;
                }
                rendered += 1;
                const at = outcome.markup.indexOf(OBJECT_OBJECT);
                if (at !== -1) offenders.push(`${path}#${exportName}: …${outcome.markup.slice(Math.max(0, at - SNIPPET_RADIUS), at + SNIPPET_RADIUS)}…`);
            }
        }

        // eslint-disable-next-line no-console -- report the stories that could not render so the floor's meaning stays visible
        console.warn(`[story-scan] rendered=${rendered} failed=${failures.length}\n${failures.join('\n')}`);
        expect(offenders).toEqual([]);
        expect(rendered).toBeGreaterThanOrEqual(MIN_RENDERED_STORIES);
    }, 600_000);
});
