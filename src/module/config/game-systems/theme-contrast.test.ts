import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SystemConfigRegistry } from './index.ts';
import { ALL_SYSTEM_IDS } from './types.ts';

/**
 * Each line's `theme.accent` colours label text on the dark sheet surfaces
 * (`--color-bg-primary` #1a1a1a, `--color-bg-secondary` #252525). BC, DW and IM
 * once used dark reds that measured 1.3–2.6:1 — IM vehicle labels were close to
 * invisible. Every accent must clear WCAG AA for normal text (4.5:1) on both.
 */

const DARK_SURFACES = ['#1a1a1a', '#252525'] as const;
const WCAG_AA_TEXT = 4.5;

const requireCjs = createRequire(import.meta.url);
/** A palette entry: a hex, a `{ DEFAULT, l20, … }` shade map, or absent for an unknown token. */
type PaletteEntry = string | Partial<Record<string, string>> | undefined;
const tailwindConfig = requireCjs(join(process.cwd(), 'tailwind.config.js')) as { theme: { extend: { colors: Record<string, PaletteEntry> } } };
const palette = tailwindConfig.theme.extend.colors;

/** Resolve a theme token (`gold-raw`, `crimson-l40`, `brass`) to its hex value. */
function resolveToken(token: string): string {
    const direct = palette[token];
    if (typeof direct === 'string') return direct;
    if (direct !== undefined) return direct['DEFAULT'] ?? '';
    for (let cut = token.lastIndexOf('-'); cut > 0; cut = token.lastIndexOf('-', cut - 1)) {
        const group = palette[token.slice(0, cut)];
        const shade = typeof group === 'object' ? group[token.slice(cut + 1)] : undefined;
        if (shade !== undefined) return shade;
    }
    throw new Error(`theme token ${token} is not in the tailwind palette`);
}

function luminance(hex: string): number {
    const [r = 0, g = 0, b = 0] = (hex.replace('#', '').match(/../g) ?? []).map((h) => {
        const v = parseInt(h, 16) / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
}

describe('per-system accent text contrast', () => {
    it.each(ALL_SYSTEM_IDS)('%s accent clears WCAG AA on the dark sheet surfaces', (systemId) => {
        const hex = resolveToken(SystemConfigRegistry.get(systemId).theme.accent);
        for (const surface of DARK_SURFACES) {
            expect(contrast(hex, surface), `${systemId} accent ${hex} on ${surface}`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
        }
    });
});

describe('status text contrast on dark panels', () => {
    // #262c21 is the measured backdrop of the starship's green-tinted power/space
    // status boxes, where success-l20 (#5aa02c) read 4.4:1.
    const STATUS_SURFACES = [...DARK_SURFACES, '#262c21'] as const;
    it.each(['success-l30', 'crimson-l40'])('%s clears WCAG AA on dark status surfaces', (token) => {
        const hex = resolveToken(token);
        for (const surface of STATUS_SURFACES) {
            expect(contrast(hex, surface), `${token} ${hex} on ${surface}`).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
        }
    });
});
