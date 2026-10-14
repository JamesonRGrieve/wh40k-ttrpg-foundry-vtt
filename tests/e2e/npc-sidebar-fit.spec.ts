import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { closeApp, openPackDocument, type PackDocumentRef } from './lib/pack-document';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for the NPC sheet fixes found in the #628 screenshots, in a real
 * Foundry with the private content packs merged in by run-e2e.sh:
 *
 *  - #630: the Daemonic pill overflowed and pushed Threat / Tier below the fold,
 *    and a long name was clipped in the sidebar name field. The pill now sits on
 *    the portrait on one line, and a long name steps its font size down to fit.
 *    Measured here on the live layout: Threat and Tier sit inside the visible
 *    sidebar header without scrolling, the pill is one line, the name fits.
 *    The vehicle sidebars share the fitted name field: the freeze audit caught
 *    'CHIMERA ARMOL' and 'ADEPTUS ASTARTI', and the voidcraft's inline label left
 *    room for "Vagabond" of "Vagabond-class Merchant Trader".
 *  - #631: Black Crusade has no aptitudes, so a BC NPC shows no Aptitudes panel
 *    (it used to show a lone "General"); a DH2 NPC still shows General.
 *
 * Captures land in .e2e-screenshots/ (npc-sidebar-fit__*.png) for review.
 */

interface SidebarSample extends PackDocumentRef {
    label: string;
    daemonic: boolean;
}

const SIDEBAR_SAMPLES: readonly SidebarSample[] = [
    { label: 'bc-bloodletter', pack: 'bc-core-actors-bestiary', name: 'Bloodletter', view: 'sheet', daemonic: true },
    { label: 'bc-axsenaea', pack: 'bc-core-actors-npcs', name: "Ax'senaea", view: 'sheet', daemonic: true },
    { label: 'bc-beast-of-nurgle', pack: 'bc-decay-actors-bestiary', name: 'Beast of Nurgle', view: 'sheet', daemonic: true },
    { label: 'bc-asphodel-kroot-warrior', pack: 'bc-blood-actors-bestiary', name: 'Asphodel Kroot Warrior', view: 'sheet', daemonic: false },
];

/** The vehicle sheets the freeze audit caught clipping ('CHIMERA ARMOL', 'ADEPTUS ASTARTI'). */
const VEHICLE_SAMPLES: readonly (PackDocumentRef & { label: string })[] = [
    { label: 'dh2-chimera-armoured-transport', pack: 'dh2-core-vehicles-terracraft', name: 'Chimera Armoured Transport', view: 'sheet' },
    { label: 'dw-adeptus-astartes-dreadnought', pack: 'dw-rites-vehicles-terracraft', name: 'Adeptus Astartes Dreadnought', view: 'sheet' },
];

/** The longest RT core ship name. */
const VOIDCRAFT_SAMPLE: PackDocumentRef = { pack: 'rt-core-vehicles-voidcraft', name: 'Vagabond-class Merchant Trader', view: 'sheet' };

interface NameField {
    fits: boolean;
    tooltip: string | null;
    scrollWidth: number;
    clientWidth: number;
}

/** Measure a rendered sheet's sidebar name input: whether its text overflows, and its tooltip. */
async function measureNameField(page: Page, appId: string): Promise<NameField> {
    return page.evaluate((id): NameField => {
        const name = document.getElementById(id)?.querySelector<HTMLInputElement>('input[name="name"]') ?? null;
        if (name === null) throw new Error('no name input');
        return {
            fits: name.scrollWidth <= name.clientWidth,
            tooltip: name.dataset['tooltip'] ?? null,
            scrollWidth: name.scrollWidth,
            clientWidth: name.clientWidth,
        };
    }, appId);
}

const BC_NPC: PackDocumentRef = { pack: 'bc-core-actors-bestiary', name: 'Bloodletter', view: 'sheet' };
const DH2_NPC: PackDocumentRef = { pack: 'dh2-core-actors-bestiary', name: 'Astropath', view: 'sheet' };

/** The tallest a one-line pill renders (0.65rem text + padding + border). */
const ONE_LINE_PILL_MAX_PX = 26;

interface SidebarLayout {
    headerScrollTop: number;
    threatInView: boolean;
    tierInView: boolean;
    badgeOnPortrait: boolean | null;
    badgeHeight: number | null;
}

/** Measure the sidebar header of a rendered sheet. */
async function measureSidebar(page: Page, appId: string): Promise<SidebarLayout> {
    return page.evaluate((id): SidebarLayout => {
        const app = document.getElementById(id);
        if (app === null) throw new Error(`app ${id} not in the DOM`);
        const header = app.querySelector<HTMLElement>('[data-application-part="header"]');
        if (header === null) throw new Error('no header part');
        const headerRect = header.getBoundingClientRect();
        const inView = (el: Element | null): boolean => {
            if (el === null) return false;
            const r = el.getBoundingClientRect();
            return r.height > 0 && r.top >= headerRect.top && r.bottom <= headerRect.bottom;
        };
        const badge = app.querySelector<HTMLElement>('[data-wh40k-hook="daemonic-immunities-badge"]');
        return {
            headerScrollTop: header.scrollTop,
            threatInView: inView(app.querySelector('[name="system.threatLevel"]')),
            tierInView: inView(app.querySelector('[name="system.tier"]')),
            badgeOnPortrait: badge === null ? null : badge.closest('[data-wh40k-hook="actor-portrait"]') !== null,
            badgeHeight: badge === null ? null : badge.getBoundingClientRect().height,
        };
    }, appId);
}

/** Whether the rendered Skills tab shows an Aptitudes panel, and its pills. */
async function aptitudesOf(page: Page, appId: string): Promise<string[] | null> {
    return page.evaluate((id): string[] | null => {
        const app = document.getElementById(id);
        if (app === null) throw new Error(`app ${id} not in the DOM`);
        const header = Array.from(app.querySelectorAll<HTMLElement>('.wh40k-panel-header')).find((el) => el.textContent.trim() === 'Aptitudes');
        const panel = header?.closest('.wh40k-panel');
        if (panel === undefined || panel === null) return null;
        return Array.from(panel.querySelectorAll<HTMLElement>('.wh40k-panel-body span')).map((el) => el.textContent.trim());
    }, appId);
}

test.describe.serial('NPC sidebar fit and per-line aptitudes (#630, #631, Tier B)', () => {
    test.setTimeout(scaledMs(300_000));

    test('the Daemonic pill and long names fit the NPC sidebar without hiding Threat / Tier (#630)', async ({ page }) => {
        await joinOrSkip(page);
        for (const sample of SIDEBAR_SAMPLES) {
            const opened = await openPackDocument(page, sample);
            expect(opened.detail, sample.label).toBeNull();
            const appId = opened.appId ?? '';
            await page.waitForTimeout(scaledMs(1_000));
            const layout = await measureSidebar(page, appId);
            expect(layout.headerScrollTop, `${sample.label}: header scrolled`).toBe(0);
            expect(layout.threatInView, `${sample.label}: Threat below the fold`).toBe(true);
            expect(layout.tierInView, `${sample.label}: Tier below the fold`).toBe(true);
            const name = await measureNameField(page, appId);
            expect(name.fits, `${sample.label}: name clipped (${name.scrollWidth}px in ${name.clientWidth}px)`).toBe(true);
            expect(name.tooltip).toBe(sample.name);
            if (sample.daemonic) {
                expect(layout.badgeOnPortrait, `${sample.label}: Daemonic pill not on the portrait`).toBe(true);
                expect(layout.badgeHeight ?? Infinity, `${sample.label}: Daemonic pill wraps`).toBeLessThanOrEqual(ONE_LINE_PILL_MAX_PX);
            }
            await snap(page, `sidebar-${sample.label}`, { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
            await closeApp(page, appId);
        }
    });

    test('a long vehicle name fits the vehicle sidebar, with the full name in the tooltip (#630)', async ({ page }) => {
        await joinOrSkip(page);
        for (const sample of VEHICLE_SAMPLES) {
            const opened = await openPackDocument(page, sample);
            expect(opened.detail, sample.label).toBeNull();
            const appId = opened.appId ?? '';
            await page.waitForTimeout(scaledMs(1_000));
            const field = await measureNameField(page, appId);
            expect(field.fits, `${sample.label}: name clipped (${field.scrollWidth}px in ${field.clientWidth}px)`).toBe(true);
            expect(field.tooltip).toBe(sample.name);
            await snap(page, `sidebar-${sample.label}`, { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
            await closeApp(page, appId);
        }

        // The voidcraft sidebar too: its inline "Ship Name" label left room for "Vagabond" alone.
        const ship = await openPackDocument(page, VOIDCRAFT_SAMPLE);
        expect(ship.detail).toBeNull();
        const shipId = ship.appId ?? '';
        await page.waitForTimeout(scaledMs(1_000));
        const shipField = await measureNameField(page, shipId);
        expect(shipField.fits, `voidcraft name clipped (${shipField.scrollWidth}px in ${shipField.clientWidth}px)`).toBe(true);
        expect(shipField.tooltip).toBe(VOIDCRAFT_SAMPLE.name);
        await snap(page, 'sidebar-rt-vagabond-voidcraft', { selector: `#${shipId}`, closeWindows: true, keepWindow: shipId });
        await closeApp(page, shipId);
    });

    test('a Black Crusade NPC shows no Aptitudes panel; a DH2 NPC keeps General (#631)', async ({ page }) => {
        await joinOrSkip(page);
        const bc = await openPackDocument(page, BC_NPC);
        expect(bc.detail).toBeNull();
        const bcId = bc.appId ?? '';
        await page.waitForTimeout(scaledMs(1_000));
        expect(await aptitudesOf(page, bcId)).toBeNull();
        await snap(page, 'aptitudes-bc-bloodletter', { selector: `#${bcId}`, closeWindows: true, keepWindow: bcId });
        await closeApp(page, bcId);

        const dh2 = await openPackDocument(page, DH2_NPC);
        expect(dh2.detail).toBeNull();
        const dh2Id = dh2.appId ?? '';
        await page.waitForTimeout(scaledMs(1_000));
        expect(await aptitudesOf(page, dh2Id)).toContain('General');
        await snap(page, 'aptitudes-dh2-astropath', { selector: `#${dh2Id}`, closeWindows: true, keepWindow: dh2Id });
        await closeApp(page, dh2Id);
    });
});
