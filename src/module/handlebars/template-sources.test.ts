import Hbs from 'handlebars';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type HandlebarsLike, registerBundledTemplates, registerTemplateSources, templateIdsFor } from './template-sources.ts';

/**
 * Every template registered from bundled source before `init` (#708), against
 * the real Handlebars runtime Foundry ships (4.x). Foundry's `getTemplate`
 * returns `Handlebars.partials[id]` without fetching when it is registered, so
 * a registered template is never requested over the socket.
 */

const ROW = 'systems/wh40k-rpg/templates/actor/partial/row.hbs';
const SHEET = 'systems/wh40k-rpg/templates/actor/sheet.hbs';

/** A fresh Handlebars environment with Foundry's `templateIds` record. */
function environment(): { hbs: typeof Hbs; like: HandlebarsLike; templateIds: Record<string, Set<string>> } {
    const hbs = Hbs.create();
    const templateIds: Record<string, Set<string>> = {};
    const like: HandlebarsLike = {
        compile: (source, options) => hbs.compile(source, options),
        registerPartial: (id, partial) => {
            hbs.registerPartial(id, partial);
        },
        templateIds,
    };
    return { hbs, like, templateIds };
}

describe('templateIdsFor', () => {
    it('answers to the path and to the path without .hbs, as templates reference partials both ways', () => {
        expect(templateIdsFor(ROW)).toEqual([ROW, ROW.slice(0, -4)]);
        expect(templateIdsFor('systems/wh40k-rpg/templates/x.html')).toEqual(['systems/wh40k-rpg/templates/x.html']);
    });
});

describe('registerTemplateSources (#708)', () => {
    it('registers each template under both ids and records them where Foundry keeps them', () => {
        const { hbs, like, templateIds } = environment();
        expect(registerTemplateSources({ [ROW]: '<li>{{name}}</li>' }, like)).toBe(1);
        expect(Object.keys(hbs.partials).sort()).toEqual([ROW.slice(0, -4), ROW]);
        expect([...(templateIds[ROW] ?? [])]).toEqual([ROW, ROW.slice(0, -4)]);
    });

    it('renders as getTemplate hands it out, and as a partial under either id', () => {
        const { hbs, like } = environment();
        registerTemplateSources({ [ROW]: '<li>{{name}}</li>', [SHEET]: `<ul>{{> ${ROW}}}{{> "${ROW.slice(0, -4)}" name="b"}}</ul>` }, like);
        const sheet = hbs.partials[SHEET] as (context: object) => string;
        expect(sheet({ name: 'a' })).toBe('<ul><li>a</li><li>b</li></ul>');
    });

    it('compiles a template on first use, once, with Foundry’s preventIndent option', () => {
        const { like } = environment();
        const compile = vi.spyOn(like, 'compile');
        registerTemplateSources({ [ROW]: '<li>{{name}}</li>' }, like);
        expect(compile).not.toHaveBeenCalled();
        const partials = new Map<string, (context: object) => string>();
        registerTemplateSources(
            { [ROW]: '<li>{{name}}</li>' },
            {
                ...like,
                registerPartial: (id, partial) => {
                    partials.set(id, partial);
                },
            },
        );
        partials.get(ROW)?.({ name: 'x' });
        partials.get(ROW.slice(0, -4))?.({ name: 'y' });
        expect(compile).toHaveBeenCalledTimes(1);
        expect(compile).toHaveBeenCalledWith('<li>{{name}}</li>', { preventIndent: true });
    });
});

describe('registerBundledTemplates (#708)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('registers the sources the bundle set on the global with Foundry’s Handlebars', () => {
        const hbs = Hbs.create();
        vi.stubGlobal('Handlebars', hbs);
        vi.stubGlobal('wh40kTemplateSources', { [ROW]: '<li>{{name}}</li>' });
        expect(registerBundledTemplates()).toBe(1);
        expect((hbs.partials[ROW] as (context: object) => string)({ name: 'z' })).toBe('<li>z</li>');
    });

    it('is a no-op outside the bundle, where no sources are set', () => {
        vi.stubGlobal('wh40kTemplateSources', undefined);
        expect(registerBundledTemplates()).toBe(0);
    });
});
