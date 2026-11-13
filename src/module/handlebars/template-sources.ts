/**
 * Every system template, registered from source the bundle carries (#708).
 *
 * Foundry fetches a template over the socket the first time `getTemplate` asks
 * for it, unless `Handlebars.partials[id]` already holds it. The system used to
 * preload 356 templates that way at `init`, each a separate request competing
 * with module loading and the `ready` pack reads, all compiled on the client.
 *
 * The bundle (scripts/bundle-module.cjs) now carries the source of every file
 * under `templates/` on `globalThis.wh40kTemplateSources`, set before the system
 * entry evaluates, and the entry registers each one before `init`, under its
 * path and its path without `.hbs` (templates reference partials both ways). A
 * template compiles on first use, so the ones a session never renders are
 * never compiled. Nothing is fetched.
 */

/** A compiled template: what `getTemplate` returns and a partial invocation calls. */
type TemplateFunction = (context?: object, options?: object) => string;

/** The part of the global Handlebars this module uses. Foundry adds `templateIds`. */
export interface HandlebarsLike {
    compile: (source: string, options: { preventIndent: boolean }) => TemplateFunction;
    registerPartial: (id: string, partial: TemplateFunction) => void;
    templateIds?: Record<string, Set<string>> | undefined;
}

/** The ids a template answers to: its path, and its path without `.hbs`. */
export function templateIdsFor(path: string): string[] {
    return path.endsWith('.hbs') ? [path, path.slice(0, -'.hbs'.length)] : [path];
}

/** A template that compiles its source the first time it is called, with Foundry's options. */
function lazyTemplate(source: string, handlebars: HandlebarsLike): TemplateFunction {
    // The first call compiles and swaps itself out for the compiled template, so a
    // session never pays for a template it never renders, nor twice for one it does.
    let render: TemplateFunction = (context, options) => {
        const compiled = handlebars.compile(source, { preventIndent: true });
        render = compiled;
        return compiled(context, options);
    };
    return (context, options) => render(context, options);
}

/**
 * Register each template in `sources` (path → source) as a partial under every
 * id it answers to, and record the ids where Foundry keeps them. Returns the
 * number of templates registered.
 */
export function registerTemplateSources(sources: Readonly<Record<string, string>>, handlebars: HandlebarsLike): number {
    const entries = Object.entries(sources);
    for (const [path, source] of entries) {
        const template = lazyTemplate(source, handlebars);
        const ids = templateIdsFor(path);
        for (const id of ids) handlebars.registerPartial(id, template);
        if (handlebars.templateIds !== undefined) {
            const known = handlebars.templateIds[path] ?? new Set<string>();
            for (const id of ids) known.add(id);
            handlebars.templateIds[path] = known;
        }
    }
    return entries.length;
}

declare global {
    /** Every template's source, keyed by its Foundry path, set by the bundle before the entry runs (#708). */
    // eslint-disable-next-line no-var -- a global the bundle sets at runtime must be declared with `var` to land on globalThis
    var wh40kTemplateSources: Readonly<Record<string, string>> | undefined;
}

/**
 * Register the templates the bundle carries with Foundry's Handlebars. A no-op
 * outside the bundle (Vitest, Storybook), which registers its own partials.
 */
export function registerBundledTemplates(): number {
    const sources = globalThis.wh40kTemplateSources;
    if (sources === undefined) return 0;
    return registerTemplateSources(sources, Handlebars);
}
