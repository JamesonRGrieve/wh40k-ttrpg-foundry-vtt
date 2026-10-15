import type { Page } from '@playwright/test';
import { createActor, deleteDocuments } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { openProbeSheet } from './lib/sheet-probe';
import { expect, test } from './lib/test';

/**
 * Tier B for #260: the stat-grid cells (movement, athletics, carrying capacity) on
 * the Combat tab hard-coded a white wash that turned grey on the dark theme, with
 * the gold icon and muted label barely readable on it. The cells now take the
 * theme's tokens. On the live sheet, each cell's background is composited over
 * everything beneath it, and the value and label text are measured against it.
 */

/** WCAG AA for the value; the small uppercase label is held to 3:1 like other secondary text. */
const VALUE_MIN_CONTRAST = 4.5;
const LABEL_MIN_CONTRAST = 3;

interface CellContrast {
    label: string;
    background: string;
    value: number;
    labelText: number;
}

/** Every stat-grid cell's composited background and the contrast of its value and label text on it. */
async function measureCells(page: Page, appId: string): Promise<CellContrast[]> {
    return page.evaluate((id): CellContrast[] => {
        type Rgba = [number, number, number, number];
        const parse = (css: string): Rgba => {
            const m = /rgba?\(([^)]+)\)/.exec(css);
            const parts = (m?.[1] ?? '0, 0, 0, 0')
                .split(/[\s,/]+/)
                .filter((p) => p !== '')
                .map(Number);
            return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
        };
        /** The element's background composited over its ancestors' until an opaque one (the page is black beneath). */
        const effectiveBackground = (el: Element): [number, number, number] => {
            const layers: Rgba[] = [];
            for (let node: Element | null = el; node !== null; node = node.parentElement) {
                const colour = parse(getComputedStyle(node).backgroundColor);
                if (colour[3] > 0) layers.push(colour);
                if (colour[3] >= 1) break;
            }
            let rgb: [number, number, number] = [0, 0, 0];
            for (const [r, g, b, a] of layers.reverse()) rgb = [r * a + rgb[0] * (1 - a), g * a + rgb[1] * (1 - a), b * a + rgb[2] * (1 - a)];
            return rgb;
        };
        const lum = ([r, g, b]: [number, number, number]): number => {
            const c = (v: number): number => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
        };
        const ratio = (a: [number, number, number], b: [number, number, number]): number =>
            (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
        const textColour = (el: Element | null): [number, number, number] => {
            const [r, g, b] = parse(el === null ? '' : getComputedStyle(el).color);
            return [r, g, b];
        };
        const cells = Array.from(document.getElementById(id)?.querySelectorAll('[data-wh40k-hook="stat-grid-cell"]') ?? []);
        return cells.map((cell) => {
            const background = effectiveBackground(cell);
            const label = cell.querySelector('span');
            const value = cell.querySelector('span.tw-font-alt');
            return {
                label: label?.textContent.trim() ?? '',
                background: getComputedStyle(cell).backgroundColor,
                value: ratio(textColour(value), background),
                labelText: ratio(textColour(label), background),
            };
        });
    }, appId);
}

test.describe.serial('Stat-grid cells on the theme (Tier B, #260)', () => {
    test('every movement and carrying-capacity cell is legible on the sheet theme', async ({ page }) => {
        await joinOrSkip(page);
        const actor = await createActor(page, { data: { name: 'e2e-260 stat grid', type: 'dh2-character', system: { gameSystem: 'dh2' } } });
        try {
            const sheet = await openProbeSheet(page, actor.id, { tab: 'combat' });
            expect(sheet, 'the sheet opened').not.toBeNull();
            const appId = sheet?.appId ?? '';
            const cells = await measureCells(page, appId);
            expect(cells.length, 'the Combat tab shows stat-grid cells').toBeGreaterThan(0);
            expect(
                cells.filter((cell) => cell.background === 'rgba(255, 255, 255, 0.5)').map((cell) => cell.label),
                'the old white wash',
            ).toEqual([]);
            expect(
                cells.filter((cell) => cell.value < VALUE_MIN_CONTRAST).map((cell) => `${cell.label} ${cell.value.toFixed(2)}`),
                'value text',
            ).toEqual([]);
            expect(
                cells.filter((cell) => cell.labelText < LABEL_MIN_CONTRAST).map((cell) => `${cell.label} ${cell.labelText.toFixed(2)}`),
                'label text',
            ).toEqual([]);
            await page.evaluate((id) => {
                document.getElementById(id)?.querySelector('[data-wh40k-hook="stat-grid-cell"]')?.scrollIntoView({ block: 'center' });
            }, appId);
            await snap(page, 'stat-grid-cells-dark-theme', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
            const grid = page.locator(`#${appId} [data-wh40k-hook="stat-grid-cell"]`).first().locator('xpath=../..');
            await grid.evaluate((el) => {
                el.id = 'e2e-stat-grid-section';
            });
            await snap(page, 'stat-grid-section-close-up', { selector: '#e2e-stat-grid-section' });
        } finally {
            await deleteDocuments(page, { actors: [actor.id] });
        }
    });
});
