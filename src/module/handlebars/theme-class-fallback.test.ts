import HandlebarsLib from 'handlebars';
import { describe, expect, it } from 'vitest';
import { themeClassFor } from '../config/game-systems/index.ts';
import { registerHandlebarsHelpers } from './handlebars-helpers.ts';

/**
 * `{{themeClassFor}}` in a render that names no game line. It fell back to a fixed
 * 'rt', so once Rogue Trader got its own void-blue palette (51d8a9b37) every such
 * render, a system-agnostic dialog's frame among them, drew RT blue even in a DH2
 * world. It now takes the world's primary line: DH2 when no world setting is
 * readable, as here.
 */

const hbs = HandlebarsLib.create();
registerHandlebarsHelpers(hbs, { localize: (key) => key, lang: () => 'en' });
const render = (source: string, context: object): string => hbs.compile(source)(context).trim();

describe('themeClassFor fallback', () => {
    it("takes the world's primary line when the render names none", () => {
        expect(render("{{themeClassFor 'border'}}", {})).toBe(themeClassFor('dh2', 'border'));
        expect(render("{{themeClassFor 'border'}}", {})).not.toBe(themeClassFor('rt', 'border'));
    });

    it('takes the line the render names, from the root or explicitly', () => {
        expect(render("{{themeClassFor 'border'}}", { _gameSystemId: 'rt' })).toBe(themeClassFor('rt', 'border'));
        expect(render("{{themeClassFor 'primary' 'ow'}}", {})).toBe(themeClassFor('ow', 'primary'));
    });

    it('treats an unknown line as none', () => {
        expect(render("{{themeClassFor 'border'}}", { _gameSystemId: 'not-a-line' })).toBe(themeClassFor('dh2', 'border'));
    });
});
