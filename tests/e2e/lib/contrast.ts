/**
 * In-page WCAG text-contrast scan for the screenshot corpus.
 *
 * For every visible element that directly holds text inside `rootSelector`, the
 * effective background is resolved by alpha-compositing ancestor background
 * colours down to the first opaque one (falling back to the dark window surface),
 * and the contrast of the computed text colour against it is measured. Text under
 * a background *image* (gradients, art) cannot be resolved this way and is skipped
 * rather than guessed. Thresholds are WCAG AA: 4.5:1, or 3:1 for large text
 * (≥24px, or ≥18.66px bold).
 *
 * Specs record the result per surface and write one JSON report beside the PNGs,
 * so the UI audit reviews measured contrast instead of eyeballing it.
 */

import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** One text run that fails WCAG AA against its effective background. */
export interface ContrastViolation {
    text: string;
    color: string;
    background: string;
    ratio: number;
    required: number;
    fontSizePx: number;
}

/** Window surface assumed under fully transparent ancestors (`--color-bg-primary`). */
const FALLBACK_SURFACE = '#1a1a1a';

/** Scan `rootSelector` for failing text contrast. Returns at most `limit` violations, worst first. */
export async function scanContrast(page: Page, rootSelector: string, limit = 40): Promise<ContrastViolation[]> {
    return page.evaluate(
        ({ selector, fallback, max }) => {
            type Rgba = [number, number, number, number];
            const parse = (value: string): Rgba | null => {
                const m = /rgba?\(([^)]+)\)/.exec(value);
                if (m === null) return null;
                const parts = m[1]
                    .split(/[\s,/]+/)
                    .filter((p) => p !== '')
                    .map(Number);
                const [r = 0, g = 0, b = 0, a = 1] = parts;
                return [r, g, b, a];
            };
            const hex = (c: Rgba): string =>
                `#${c
                    .slice(0, 3)
                    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
                    .join('')}`;
            const blend = (top: Rgba, under: Rgba): Rgba => {
                const a = top[3];
                return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
            };
            const luminance = (c: Rgba): number => {
                const lin = c.slice(0, 3).map((v) => {
                    const s = v / 255;
                    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
            };
            const ratio = (a: Rgba, b: Rgba): number => {
                const la = luminance(a);
                const lb = luminance(b);
                return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
            };
            const fallbackRgb = parse(`rgb(${[1, 3, 5].map((i) => parseInt(fallback.slice(i, i + 2), 16)).join(',')})`) ?? [26, 26, 26, 1];

            /** Effective opaque background under `el`, or null when an image sits in the stack. */
            const backgroundOf = (el: Element): Rgba | null => {
                const layers: Rgba[] = [];
                for (let node: Element | null = el; node !== null; node = node.parentElement) {
                    const cs = getComputedStyle(node);
                    if (cs.backgroundImage !== 'none') return null;
                    const bg = parse(cs.backgroundColor);
                    if (bg !== null && bg[3] > 0) {
                        layers.push(bg);
                        if (bg[3] >= 1) break;
                    }
                }
                return layers.reduceRight<Rgba>((under, top) => blend(top, under), fallbackRgb);
            };

            const root = document.querySelector(selector);
            if (root === null) return [];
            const out: Array<{ text: string; color: string; background: string; ratio: number; required: number; fontSizePx: number }> = [];
            for (const el of Array.from(root.querySelectorAll('*'))) {
                const ownText = Array.from(el.childNodes)
                    .filter((n) => n.nodeType === Node.TEXT_NODE)
                    .map((n) => n.textContent ?? '')
                    .join('')
                    .trim();
                if (ownText === '') continue;
                // WCAG exempts inactive controls; a disabled button is dimmed on purpose.
                if (el.closest(':disabled, [aria-disabled="true"]') !== null) continue;
                const cs = getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (cs.visibility === 'hidden' || cs.display === 'none' || rect.width === 0 || rect.height === 0 || Number(cs.opacity) === 0) continue;
                const fg = parse(cs.color);
                const bg = backgroundOf(el);
                if (fg === null || bg === null) continue;
                const effectiveFg = blend([fg[0], fg[1], fg[2], fg[3] * Number(cs.opacity)], bg);
                const size = parseFloat(cs.fontSize);
                const bold = Number(cs.fontWeight) >= 700;
                const required = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
                const r = ratio(effectiveFg, bg);
                if (r < required) {
                    out.push({
                        text: ownText.slice(0, 60),
                        color: hex(effectiveFg),
                        background: hex(bg),
                        ratio: Math.round(r * 100) / 100,
                        required,
                        fontSizePx: size,
                    });
                }
            }
            return out.sort((a, b) => a.ratio - b.ratio).slice(0, max);
        },
        { selector: rootSelector, fallback: FALLBACK_SURFACE, max: limit },
    );
}

/** Write a `{ surface: violations[] }` report as pretty JSON. */
export function writeContrastReport(path: string, report: Record<string, ContrastViolation[]>): void {
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
