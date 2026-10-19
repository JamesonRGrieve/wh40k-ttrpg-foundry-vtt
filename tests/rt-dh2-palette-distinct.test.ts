/**
 * Rogue Trader and Dark Heresy 2e read apart at a glance.
 *
 * Both lines once framed their sheets in near-identical golds (DH2 bronze /
 * gold-raw, RT dynasty gold / gold-dark). RT now frames in void blue and keeps
 * gold lettering; DH2 keeps bronze and old gold. This holds the two lines' frame
 * colours a wide hue apart, and keeps RT's per-system frame variants on the void
 * palette rather than drifting back to gold or amber.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from '../src/module/config/game-systems/index.ts';
import { contrast, hexRgb, objectLiteral, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

type PaletteEntry = string | Partial<Record<string, string>> | undefined;
const requireCjs = createRequire(import.meta.url);
const palette = (requireCjs(join(process.cwd(), 'tailwind.config.js')) as { theme: { extend: { colors: Record<string, PaletteEntry> } } }).theme.extend.colors;

/** A palette token's hex: the longest colour name it starts with, then that colour's shade (or DEFAULT). */
function paletteHex(token: string): string {
    const name = Object.keys(palette)
        .filter((key) => token === key || token.startsWith(`${key}-`))
        .sort((a, b) => b.length - a.length)
        .at(0);
    if (name === undefined) return '';
    const colour = palette[name];
    if (typeof colour === 'string') return token === name ? colour : '';
    return colour?.[token === name ? 'DEFAULT' : token.slice(name.length + 1)] ?? '';
}

/** Hue in degrees (0–360) of an RGB colour. */
function hue({ r, g, b }: Rgb): number {
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    const max = Math.max(rn, gn, bn);
    const delta = max - Math.min(rn, gn, bn);
    if (delta === 0) return 0;
    const sector = max === rn ? ((gn - bn) / delta) % 6 : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4;
    return (sector * 60 + 360) % 360;
}

function hueGap(a: string, b: string): number {
    const gap = Math.abs(hue(hexRgb(a)) - hue(hexRgb(b)));
    return Math.min(gap, 360 - gap);
}

/** The surface of a story this suite renders and plays. */
interface RunnableStory {
    render?: (args: Record<string, never>) => HTMLElement;
    play?: (context: { canvasElement: HTMLElement }) => Promise<void>;
}
interface ViteGlobMeta {
    glob: (patterns: string[], opts: { eager: true }) => Partial<Record<string, Partial<Record<string, RunnableStory>>>>;
}
const STORY_FILE = '../src/templates/actor/panel/movement-panel-compact.stories.ts';
// Vite needs the glob pattern as a literal.
const STORIES = (import.meta as ImportMeta & ViteGlobMeta).glob(['../src/templates/actor/panel/movement-panel-compact.stories.ts'], { eager: true });

/**
 * The DH2-vs-RT palette story on the Combat tab's movement panel, with both its render
 * and its play. (It was on the armour panel, which #662 deleted as unmounted.)
 */
function paletteStory(): Required<RunnableStory> {
    const story = STORIES[STORY_FILE]?.['PaletteDH2VersusRT'];
    if (story?.render === undefined || story.play === undefined) throw new Error('PaletteDH2VersusRT story not loaded');
    return { render: story.render, play: story.play };
}

/** Frame roles: the fill and the border a sheet is framed in (accent is lettering, which RT keeps gold). */
const FRAME_ROLES = ['primary', 'border', 'chatAccent'] as const;
/** Hues at least this far apart read as different colour families, not shades of one. */
const MIN_HUE_GAP = 90;

describe('RT and DH2 palettes', () => {
    const dh2 = SystemConfigRegistry.get('dh2').theme;
    const rt = SystemConfigRegistry.get('rt').theme;

    it.each(FRAME_ROLES)('the %s colours sit in different colour families', (role) => {
        const [a, b] = [paletteHex(dh2[role]), paletteHex(rt[role])];
        expect([a, b]).toEqual([expect.stringMatching(/^#[0-9a-f]{6}$/iu), expect.stringMatching(/^#[0-9a-f]{6}$/iu)]);
        expect(hueGap(a, b), `dh2 ${dh2[role]} ${a} vs rt ${rt[role]} ${b}`).toBeGreaterThanOrEqual(MIN_HUE_GAP);
    });

    it('the RT primary fill keeps the dark pill text it carries legible (4.5:1 against #1a1a1a)', () => {
        expect(contrast(hexRgb(paletteHex(rt.primary)), hexRgb('#1a1a1a'))).toBeGreaterThanOrEqual(4.5);
    });
});

describe('RT frame tokens (design-tokens.js)', () => {
    const tokensSource = readRepoFile('tailwind/design-tokens.js');
    const frame = objectLiteral(tokensSource, 'rtFrame');
    const voidFrame = hexRgb(paletteHex('void-l20'));

    it('apply on every RT root, after the chat and dark surfaces so an RT card keeps its frame', () => {
        const at = tokensSource.indexOf(`'[data-wh40k-system="rt"]': rtFrame`);
        expect(at).toBeGreaterThan(tokensSource.indexOf(`'[data-wh40k-surface="dark"]': darkSurface`));
    });

    it('draw the sidebar edge and every border token in void-l20', () => {
        const offColour = [...frame.entries()].filter(([, value]) => {
            const { rgb } = parseColour(value);
            return rgb.r !== voidFrame.r || rgb.g !== voidFrame.g || rgb.b !== voidFrame.b;
        });
        expect([...frame.keys()]).toEqual(expect.arrayContaining(['--wh40k-sidebar-accent', '--wh40k-border-color', '--wh40k-border-color-light']));
        expect(offColour).toEqual([]);
    });
});

describe('the DH2 vs RT palette story', () => {
    it('renders both lines and passes its play assertions', async () => {
        const { render, play } = paletteStory();
        const canvasElement = document.createElement('div');
        canvasElement.appendChild(render({}));
        document.body.appendChild(canvasElement);
        try {
            await expect(play({ canvasElement })).resolves.toBeUndefined();
        } finally {
            canvasElement.remove();
        }
    });
});

describe('RT per-system frame variants', () => {
    // Endeavours are RT's own gold-framed dynasty objectives; their rt: variants restate the gold base.
    const EXEMPT = new Set(['actor/panel/endeavour-panel.hbs', 'item/item-endeavour-sheet.hbs']);

    it('draw borders and washes in void, not gold or amber', () => {
        const dir = 'src/templates';
        const offenders = readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' })
            .filter((name) => name.endsWith('.hbs') && !EXEMPT.has(name))
            .flatMap((name) =>
                [...readRepoFile(`${dir}/${name}`).matchAll(/(?<![\w-])rt:tw-(?:border(?:-[tlbrxy])?|bg)-(?:gold|amber|accent-dynasty)[\w/[\]%-]*/gu)].map(
                    ([match]) => `${name}: ${match}`,
                ),
            );
        expect(offenders).toEqual([]);
    });
});
