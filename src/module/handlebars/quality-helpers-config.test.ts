import HandlebarsLib from 'handlebars';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHandlebarsHelpers } from './handlebars-helpers.ts';

/**
 * The weapon-quality helpers resolve definitions through the system config the
 * system installs as `CONFIG.wh40k`. They read `CONFIG.rt`, which nothing sets, so
 * in Foundry `specialQualities` and `craftsmanshipQualities` returned nothing and
 * the attack card's Active Qualities box rendered empty.
 */

interface QualityDefinition {
    label: string;
    description: string;
    hasLevel?: boolean;
}

const DEFINITIONS: Partial<Record<string, QualityDefinition>> = {
    reliable: { label: 'Reliable', description: 'Rarely jams.' },
    accurate: { label: 'Accurate', description: 'Rewards aiming.' },
};

const hbs = HandlebarsLib.create();
registerHandlebarsHelpers(hbs, { localize: (key) => key, lang: () => 'en' });
const render = (source: string, context: object): string => hbs.compile(source)(context).trim();

function installSystemConfig(): void {
    vi.stubGlobal('CONFIG', { wh40k: { getQualityDefinition: (id: string): QualityDefinition | null => DEFINITIONS[id] ?? null } });
}

describe('weapon-quality helpers read CONFIG.wh40k', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("specialQualities labels a weapon's quality set from the system config", () => {
        installSystemConfig();
        const out = render('{{#each (specialQualities ids)}}{{label}};{{/each}}', { ids: new Set(['reliable', 'accurate']) });
        expect(out).toBe('Reliable;Accurate;');
    });

    it('qualityLookup resolves one quality from the system config', () => {
        installSystemConfig();
        expect(render('{{lookup (qualityLookup "reliable") "label"}}', {})).toBe('Reliable');
    });

    it('craftsmanshipQualities resolves the qualities good craftsmanship adds', () => {
        installSystemConfig();
        const out = render('{{#each (craftsmanshipQualities weapon)}}{{label}};{{/each}}', { weapon: { craftsmanship: 'good', melee: false } });
        expect(out).toBe('Reliable;');
    });
});
