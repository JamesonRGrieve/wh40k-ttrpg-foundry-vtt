import type { Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#701 items 1 and 23): every actor sheet's sidebar header reaches its last
 * field. The shared sidebar pins the tab strip under a header part that scrolls,
 * but each tab button was 44px (Foundry's 2.5× nav line-height on 12px text), so
 * seven tabs left the header a short window and its lower fields (Hull Integrity,
 * a DW Rank, a horde's Nature and Faction) looked cut off by the strip, with no
 * cue that the header scrolled. The buttons are now compact, the header shows a
 * scroll shadow while more lies below, and the craft sheets use the same strip.
 */

/** Stands for "the header's last rendered form control", for headers whose last field has no hook of its own. */
const LAST_CONTROL = 'input, select, textarea';

interface SidebarSample {
    label: string;
    data: object;
    tab: string;
    /** The header's last field, which must come into view when the header scrolls to its end. */
    lastField: string;
}

const SAMPLES: readonly SidebarSample[] = [
    {
        label: 'rt-voidcraft',
        data: { name: 'e2e-701 Sidebar Frigate', type: 'rt-voidcraft', system: { gameSystem: 'rt', hullType: 'frigate' } },
        tab: 'stats',
        lastField: '.wh40k-crew-box',
    },
    {
        label: 'dw-character',
        data: { name: 'e2e-701 Sidebar Battle-Brother', type: 'dw-character', system: { gameSystem: 'dw' } },
        tab: 'overview',
        lastField: LAST_CONTROL,
    },
    {
        label: 'dw-horde',
        data: {
            name: 'e2e-701 Sidebar Horde',
            type: 'dw-npc',
            system: { gameSystem: 'dw', horde: { enabled: true, magnitude: { current: 30, max: 30 } } },
        },
        tab: 'skills',
        lastField: '[name="system.faction"]',
    },
    {
        label: 'dh2-terracraft',
        data: { name: 'e2e-701 Sidebar Chimera', type: 'dh2-terracraft', system: { gameSystem: 'dh2' } },
        tab: 'overview',
        lastField: LAST_CONTROL,
    },
];

/** The tallest a compact sidebar tab button renders. */
const TAB_BUTTON_MAX_PX = 32;

interface SidebarMeasure {
    tabButtonHeights: number[];
    scrolls: boolean;
    shadow: boolean;
    lastFieldVisibleAfterScroll: boolean;
    natureVisibleAfterScroll: boolean | null;
}

async function measure(page: Page, sheetId: string, lastField: string): Promise<SidebarMeasure> {
    return page.evaluate(
        ({ id, last }) => {
            const root = document.getElementById(id);
            const header = root?.querySelector<HTMLElement>('[data-application-part="header"]');
            if (header === null || header === undefined) throw new Error('no sidebar header part');
            const buttons = Array.from(root?.querySelectorAll<HTMLElement>('[data-application-part="tabs"] .wh40k-nav-item') ?? []);
            const inside = (el: Element | null): boolean => {
                if (el === null) return false;
                const box = el.getBoundingClientRect();
                const view = header.getBoundingClientRect();
                return box.top >= view.top - 1 && box.bottom <= view.bottom + 1;
            };
            const scrolls = header.scrollHeight > header.clientHeight + 1;
            const shadow = getComputedStyle(header).backgroundImage.includes('linear-gradient');
            header.scrollTop = header.scrollHeight;
            const rendered = Array.from(header.querySelectorAll(last)).filter((el) => el.getBoundingClientRect().height > 0);
            const lastEl = rendered.at(-1) ?? null;
            const nature = header.querySelector('[name="system.nature"]');
            return {
                tabButtonHeights: buttons.map((b) => Math.round(b.getBoundingClientRect().height)),
                scrolls,
                shadow,
                lastFieldVisibleAfterScroll: inside(lastEl),
                natureVisibleAfterScroll: nature === null ? null : inside(nature),
            };
        },
        { id: sheetId, last: lastField },
    );
}

test.describe.serial('actor sidebar header scrolls clear of the tab strip (Tier B, #701)', () => {
    for (const sample of SAMPLES) {
        test(`${sample.label}: compact tabs, a scroll shadow, and the last header field reachable`, async ({ page }) => {
            await joinOrSkip(page);
            const actor = await createActor(page, { data: sample.data });
            try {
                const sheetId = await openActorSheet(page, actor.id, sample.tab);
                await expect(page.locator(`#${sheetId}`)).toBeVisible();
                if (sample.label === 'rt-voidcraft') {
                    // An unset hull class reads "Not set", not a label with nothing after it.
                    await expect(page.locator(`#${sheetId} [data-wh40k-hook="voidcraft-hull-class-label"]`)).toHaveText('Not set');
                }
                await snap(page, `actor-sidebar-${sample.label}`, { selector: `#${sheetId}` });

                const result = await measure(page, sheetId, sample.lastField);
                expect(result.tabButtonHeights.length).toBeGreaterThan(0);
                expect(Math.max(...result.tabButtonHeights), 'tallest tab button').toBeLessThanOrEqual(TAB_BUTTON_MAX_PX);
                expect(result.shadow, 'header scroll shadow').toBe(true);
                expect(result.lastFieldVisibleAfterScroll, 'last header field reachable by scrolling').toBe(true);
                if (sample.label === 'dw-horde') expect(result.natureVisibleAfterScroll, 'horde Nature reachable').toBe(true);
                await snap(page, `actor-sidebar-${sample.label}-scrolled`, { selector: `#${sheetId}` });
            } finally {
                await deleteDocuments(page, { actors: [actor.id] });
            }
        });
    }
});
