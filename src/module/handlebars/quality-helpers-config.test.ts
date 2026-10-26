import { readFileSync } from 'node:fs';
import path from 'node:path';
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
    blast: { label: 'Blast (X)', description: 'Hits everyone in the area.', hasLevel: true },
    snare: { label: 'Snare (X)', description: 'Entangles.', hasLevel: true },
    flame: { label: 'Flame', description: 'Sets alight.' },
    spray: { label: 'Spray', description: 'A cone.' },
    tearing: { label: 'Tearing', description: 'Rolls an extra die.' },
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

    it('labels the area and autocannon qualities by their base id, each rating once (#698)', () => {
        installSystemConfig();
        const out = render('{{#each (specialQualities ids)}}{{label}};{{/each}}', {
            ids: new Set(['blast-3', 'flame', 'spray', 'snare-1', 'tearing', 'reliable']),
        });
        expect(out).toBe('Blast (3);Flame;Spray;Snare (1);Tearing;Reliable;');
    });

    it('the attack card prints the chip label alone, since the label already carries the rating (#698)', () => {
        // The card appended " ({{quality.level}})" after the label, so a Blast (3) chip read "Blast (3) (3)".
        const card = readFileSync(path.resolve(import.meta.dirname, '../../templates/chat/action-roll-chat.hbs'), 'utf8');
        const loop = card.slice(
            card.indexOf('(specialQualities weapon.system.effectiveSpecial)'),
            card.indexOf('{{/each}}', card.indexOf('(specialQualities weapon.system.effectiveSpecial)')),
        );
        expect(loop).toContain('{{quality.label}}');
        expect(loop).not.toContain('quality.level');
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
