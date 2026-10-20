import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: an item sheet's GM-notes textarea and Source inputs take the sheet's
 * field styling in Foundry, not a bare white box.
 *
 * In Storybook those controls draw white: the story harness carries no Foundry
 * stylesheet, and the templates leave the field surface to it. This spec checks
 * the real render. Each field must sit on a surface no brighter than mid-grey
 * and hold its text at WCAG AA against that surface.
 */

const PREFIX = 'e2e-dark-fields';

interface Case {
    type: string;
    /** The tab that holds the fields. */
    tab: string;
    /** Selectors of the controls under test, inside the sheet. */
    fields: readonly string[];
}

const NOTES = 'textarea[name="system.notes"]';
const CASES: readonly Case[] = [
    { type: 'gear', tab: 'description', fields: [NOTES, 'input[name="system.source.book"]', 'input[name="system.source.page"]'] },
    { type: 'armour', tab: 'description', fields: [NOTES, 'input[name="system.source.book"]'] },
    { type: 'criticalInjury', tab: 'details', fields: [NOTES] },
];

/** Relative luminance above which a field reads as a light box on the dark sheet. */
const MAX_FIELD_LUMINANCE = 0.4;
/** WCAG AA for body text. */
const MIN_TEXT_CONTRAST = 4.5;
/** How long a field may take to show once its tab is chosen. */
const FIELD_TIMEOUT_MS = 10_000;

interface FieldStyle {
    found: boolean;
    background: string;
    color: string;
    luminance: number;
    contrast: number;
}

interface ProbeApp {
    id: string;
    close: () => Promise<void>;
}
interface ProbeWindow {
    Item: { create: (data: object) => Promise<{ sheet: ProbeApp & { render: (o: { force: boolean }) => Promise<void> } } | null> };
    game: { items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ sheet: ProbeApp; delete: () => Promise<void> }> } };
}

async function openSheet(page: Page, type: string): Promise<string> {
    return page.evaluate(
        async ({ itemType, name }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const item = await w.Item.create({
                name,
                type: itemType,
                system: { notes: 'Kept by the Ordo clerk.', source: { book: 'Dark Heresy 2e Core', page: '178' } },
            });
            if (item === null) throw new Error('Item.create returned null');
            await item.sheet.render({ force: true });
            return item.sheet.id;
        },
        { itemType: type, name: `${PREFIX} ${type}` },
    );
}

/** The field's own background composited over the first opaque ancestor, and its text contrast against it. */
async function fieldStyle(page: Page, selector: string): Promise<FieldStyle> {
    return page.evaluate((sel) => {
        type Rgba = [number, number, number, number];
        const parse = (value: string): Rgba => {
            const m = /rgba?\(([^)]+)\)/.exec(value);
            if (m === null) return [0, 0, 0, 0];
            const [r = 0, g = 0, b = 0, a = 1] = m[1]
                .split(/[\s,/]+/)
                .filter((p) => p !== '')
                .map(Number);
            return [r, g, b, a];
        };
        const luminance = (c: Rgba): number => {
            const lin = c.slice(0, 3).map((v) => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
        };
        const el = document.querySelector(sel);
        if (el === null) return { found: false, background: '', color: '', luminance: 0, contrast: 0 };
        el.scrollIntoView({ block: 'center' });
        const layers: Rgba[] = [];
        for (let node: Element | null = el; node !== null; node = node.parentElement) {
            const layer = parse(getComputedStyle(node).backgroundColor);
            if (layer[3] > 0) layers.push(layer);
            if (layer[3] >= 1) break;
        }
        let surface: Rgba = [26, 26, 26, 1];
        for (const top of layers.reverse()) {
            const a = top[3];
            surface = [top[0] * a + surface[0] * (1 - a), top[1] * a + surface[1] * (1 - a), top[2] * a + surface[2] * (1 - a), 1];
        }
        const text = parse(getComputedStyle(el).color);
        const ls = luminance(surface);
        const lt = luminance(text);
        return {
            found: true,
            background: `rgb(${surface.slice(0, 3).map(Math.round).join(', ')})`,
            color: getComputedStyle(el).color,
            luminance: ls,
            contrast: (Math.max(ls, lt) + 0.05) / (Math.min(ls, lt) + 0.05),
        };
    }, selector);
}

test.describe.serial('item-sheet notes and Source fields take the sheet styling (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const item of w.game.items.filter((i) => i.name.startsWith(prefix))) {
                await item.sheet.close();
                await item.delete();
            }
        }, PREFIX);
    });

    for (const c of CASES) {
        test(`${c.type}: notes and Source are not white boxes`, async ({ page }) => {
            await joinOrSkip(page);
            const appId = await openSheet(page, c.type);
            await expect(page.locator(`#${appId}`)).toBeVisible();
            await clearScreenOverlays(page, appId);
            await page.locator(`#${appId} nav [data-tab="${c.tab}"]`).first().click();
            for (const field of c.fields) {
                await expect(page.locator(`#${appId} ${field}`)).toBeVisible({ timeout: FIELD_TIMEOUT_MS });
                const style = await fieldStyle(page, `#${appId} ${field}`);
                expect(style.found, `${c.type} ${field} renders`).toBe(true);
                expect(style.luminance, `${c.type} ${field} surface ${style.background}`).toBeLessThanOrEqual(MAX_FIELD_LUMINANCE);
                expect(style.contrast, `${c.type} ${field} text ${style.color} on ${style.background}`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
            }
            // Frame the notes and Source together for the screenshot.
            await page.locator(`#${appId} ${NOTES}`).scrollIntoViewIfNeeded();
            await snap(page, `item-sheet-dark-fields-${c.type}`, { selector: `#${appId}` });
            recordCoverage('sheet.field', `${c.type}.notes-source`);
        });
    }
});
