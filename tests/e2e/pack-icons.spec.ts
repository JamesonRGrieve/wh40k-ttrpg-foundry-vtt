import type { Page } from '@playwright/test';
import { CONDITION_PLACEHOLDER_ART, nonSynonymArtClashes } from '../helpers/condition-docs';
import { canvasClip } from './lib/canvas-capture';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B check of the pack icons repointed off the unlicensed `_vendored-ui`
 * art to game-icons.net (#625), in a real Foundry with the private content
 * packs merged in by run-e2e.sh.
 *
 * It opens the surfaces a player sees those icons on and asserts each
 * game-icons image actually loaded (non-zero natural width) and no CDN request
 * failed — the global console guard (lib/test.ts) separately fails the test on
 * any invalid-asset error, which is what the vendored paths used to raise:
 *   - the token HUD status palette, and a token carrying four of the repointed
 *     conditions;
 *   - a talent, a psychic power, and weapons of five kinds (las, bolt, chain,
 *     flame, grenade) on their item sheets;
 *   - the compendium browser's result grid, searched to pistols of every kind.
 *
 * Every surface is captured to .e2e-screenshots/ (game__pack-icons-*.png) for
 * visual review.
 */

/** game-icons CDN path fragment every repointed icon carries. */
const GAME_ICONS = '/gh/game-icons/icons@';

/** Conditions whose HUD icons were on vendored art before #625. */
const REPOINTED_STATUSES = ['blinded', 'blood-loss', 'deafened', 'insanity', 'on-fire', 'pinned', 'stunned'] as const;

/** Item sheets to open, each found by its document type and chosen icon. */
const SHEET_SAMPLES = [
    { label: 'talent', type: 'talent', icon: 'lorc/turtle-shell' },
    { label: 'psychic-power', type: 'psychicPower', icon: 'lorc/fireball' },
    { label: 'weapon-las', type: 'weapon', icon: 'lorc/ray-gun' },
    { label: 'weapon-bolt', type: 'weapon', icon: 'lorc/bolter-gun' },
    { label: 'weapon-chain', type: 'weapon', icon: 'delapouite/chainsaw' },
    { label: 'weapon-flame', type: 'weapon', icon: 'delapouite/flamethrower' },
    { label: 'weapon-grenade', type: 'weapon', icon: 'lorc/grenade' },
] as const;

const BROWSER_MODULE_URL = '/systems/wh40k-rpg/module/applications/compendium-browser.js';

/** The probe token's centre (placed at 300,300 on a 100 px grid), in canvas pixels. */
const TOKEN_CENTRE = { x: 350, y: 350 };

interface IconLoad {
    loaded: number;
    broken: string[];
}

/**
 * Wait for every game-icons `<img>` under `selector` to settle, then report how
 * many loaded and which did not.
 */
/**
 * Extra load attempts for an icon whose first request failed. The icons are
 * hotlinked from the game-icons CDN, and the headless browser occasionally drops
 * a request that succeeds on the next try (a different image each run, while the
 * same URL answers 200 from curl). A URL that is genuinely broken fails every
 * attempt, so the assertion still proves each one resolves.
 */
const CDN_LOAD_RETRIES = 3;

async function gameIconLoads(page: Page, selector: string): Promise<IconLoad> {
    return page.evaluate(
        async ({ sel, fragment, settleMs, retries }): Promise<IconLoad> => {
            const root = document.querySelector(sel);
            if (root === null) return { loaded: 0, broken: [`${sel} not in the DOM`] };
            const imgs = Array.from(root.querySelectorAll('img')).filter((img) => img.src.includes(fragment));
            const settle = async (img: HTMLImageElement): Promise<void> =>
                new Promise<void>((done) => {
                    if (img.complete) {
                        done();
                        return;
                    }
                    img.addEventListener('load', () => done(), { once: true });
                    img.addEventListener('error', () => done(), { once: true });
                    setTimeout(done, settleMs);
                });
            await Promise.all(imgs.map(settle));
            for (let attempt = 0; attempt < retries; attempt += 1) {
                const failed = imgs.filter((img) => img.naturalWidth === 0);
                if (failed.length === 0) break;
                for (const img of failed) {
                    const src = img.src;
                    img.removeAttribute('src');
                    img.src = src;
                }
                // eslint-disable-next-line no-await-in-loop -- each retry round waits for the previous round's re-requests to settle
                await Promise.all(failed.map(settle));
            }
            return { loaded: imgs.filter((img) => img.naturalWidth > 0).length, broken: imgs.filter((img) => img.naturalWidth === 0).map((img) => img.src) };
        },
        { sel: selector, fragment: GAME_ICONS, settleMs: scaledMs(15_000), retries: CDN_LOAD_RETRIES },
    );
}

/** Viewport pixels of margin around the token HUD capture. */
const HUD_CAPTURE_PAD = 16;

/**
 * The viewport rectangle covering the token HUD and every part of it laid out
 * outside its own box (the status palette opens beside the token), so one
 * capture shows the whole palette.
 */
async function hudClip(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate((pad) => {
        const parts = Array.from(document.querySelectorAll<HTMLElement>('#token-hud, #token-hud *')).map((el) => el.getBoundingClientRect());
        const visible = parts.filter((r) => r.width > 0 && r.height > 0);
        const left = Math.max(0, Math.min(...visible.map((r) => r.left)) - pad);
        const top = Math.max(0, Math.min(...visible.map((r) => r.top)) - pad);
        const right = Math.min(window.innerWidth, Math.max(...visible.map((r) => r.right)) + pad);
        const bottom = Math.min(window.innerHeight, Math.max(...visible.map((r) => r.bottom)) + pad);
        return { x: left, y: top, width: right - left, height: bottom - top };
    }, HUD_CAPTURE_PAD);
}

interface ProbeIds {
    sceneId: string | null;
    actorId: string | null;
    tokenId: string | null;
}

interface TokenLike {
    id: string;
    actor: { toggleStatusEffect: (id: string, options: { active: boolean }) => Promise<object | boolean | undefined> } | null;
    control: (options: { releaseOthers: boolean }) => boolean;
}

interface CanvasGlobals {
    game: { paused: boolean; togglePause: (p: boolean) => void };
    CONFIG: { statusEffects: Array<{ id: string; img: string }> };
    Actor: { create: (d: object) => Promise<{ id: string; getTokenDocument: (d: object) => Promise<{ toObject: () => object }> }> };
    Scene: {
        create: (
            d: object,
        ) => Promise<{ id: string; view: () => Promise<void>; createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>> }>;
    };
    canvas: {
        ready: boolean;
        scene: { id: string } | null;
        tokens?: { placeables: TokenLike[] };
        hud: { token: { bind: (token: TokenLike) => Promise<void>; togglePalette: (palette: string, active: boolean) => void; rendered: boolean } };
        animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
    };
}

interface PlacedToken extends ProbeIds {
    statusImgs: Record<string, string>;
    /** Why the token HUD did not open, or null when its status palette is up. */
    hudProblem: string | null;
}

/**
 * Place a dh2 NPC token on a fresh scene, bind the token HUD to it and open its
 * status palette. Returns the created ids and the status icons the HUD offers.
 */
async function placeTokenWithHud(page: Page): Promise<PlacedToken> {
    return page.evaluate(async (): Promise<PlacedToken> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as CanvasGlobals;
        const { pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
        const statusImgs = Object.fromEntries(g.CONFIG.statusEffects.map((s) => [s.id, s.img]));
        const actor = await g.Actor.create({ name: 'pack-icons probe', type: 'dh2-npc' });
        const scene = await g.Scene.create({ name: 'pack-icons probe', width: 800, height: 800 });
        const td = await actor.getTokenDocument({ x: 300, y: 300 });
        const tokenDoc = (await scene.createEmbeddedDocuments('Token', [td.toObject()])).at(0);
        const placed: PlacedToken = { sceneId: scene.id, actorId: actor.id, tokenId: tokenDoc?.id ?? null, statusImgs, hudProblem: null };
        if (tokenDoc === undefined) return { ...placed, hudProblem: 'token placement failed' };
        const placeable = (): TokenLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === tokenDoc.id);
        // A fresh world's first-run setup creates and views its own default scene
        // around now, which can pull the canvas away from ours: view ours again
        // whenever the canvas is settled on another scene.
        let viewing: Promise<void> | null = null;
        await pollUntil(() => {
            if (g.canvas.ready && placeable()?.actor != null) return true;
            if (viewing === null && g.canvas.scene?.id !== scene.id) {
                viewing = scene.view().finally(() => {
                    viewing = null;
                });
            }
            return false;
        }, scale(60_000));
        if (g.game.paused) g.game.togglePause(false);
        const tok = placeable();
        if (tok === undefined) {
            const drawn = g.canvas.tokens?.placeables.length ?? 0;
            const onScene = g.canvas.scene?.id === scene.id;
            return {
                ...placed,
                hudProblem: `placed token never drew (canvas.ready=${String(g.canvas.ready)}, on probe scene=${String(onScene)}, ${drawn} tokens drawn)`,
            };
        }
        await g.canvas.animatePan({ x: 350, y: 350, scale: 1.5, duration: 0 });
        tok.control({ releaseOthers: true });
        await g.canvas.hud.token.bind(tok);
        if (!(await pollUntil(() => document.getElementById('token-hud') !== null, scale(10_000))))
            return { ...placed, hudProblem: 'token HUD never rendered' };
        g.canvas.hud.token.togglePalette('effects', true);
        const open = await pollUntil(() => document.querySelector('#token-hud .palette.status-effects.active') !== null, scale(10_000));
        return { ...placed, hudProblem: open ? null : 'status palette never opened' };
    });
}

/** Toggle catalog statuses on the probe token. */
async function applyStatuses(page: Page, tokenId: string, statuses: readonly string[]): Promise<void> {
    await page.evaluate(
        async ({ id, list }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as CanvasGlobals;
            const actor = g.canvas.tokens?.placeables.find((t) => t.id === id)?.actor;
            for (const status of list) await actor?.toggleStatusEffect(status, { active: true });
        },
        { id: tokenId, list: [...statuses] },
    );
}

interface SheetOpen {
    appId: string | null;
    name: string | null;
    detail: string | null;
}

/** Find a pack item of `type` whose img is the `icon` game-icon and render its sheet. */
async function openSheetWithIcon(page: Page, type: string, icon: string): Promise<SheetOpen> {
    return page.evaluate(
        async ({ docType, iconPath }): Promise<SheetOpen> => {
            interface IndexEntry {
                _id: string;
                name: string;
                type?: string;
                img?: string;
            }
            interface SheetLike {
                id: string;
                rendered: boolean;
                render: (o: { force: boolean }) => Promise<object>;
            }
            interface PackLike {
                metadata: { id: string; system?: string };
                documentName: string;
                getIndex: (o: { fields: string[] }) => Promise<Iterable<IndexEntry>>;
                getDocument: (id: string) => Promise<{ name: string; sheet: SheetLike } | null>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.packs` is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { packs: Iterable<PackLike> } };
            const packs = Array.from(g.game.packs)
                .filter((p) => p.documentName === 'Item' && p.metadata.system === 'wh40k-rpg')
                // Prefer the DH2 packs: the e2e world plays DH2.
                .sort((a, b) => Number(!a.metadata.id.startsWith('dh2-')) - Number(!b.metadata.id.startsWith('dh2-')));
            for (const pack of packs) {
                const index = Array.from(await pack.getIndex({ fields: ['img', 'type'] }));
                const hit = index.find((e) => e.type === docType && (e.img ?? '').endsWith(`/${iconPath}.svg`));
                if (hit === undefined) continue;
                const doc = await pack.getDocument(hit._id);
                if (doc === null) return { appId: null, name: hit.name, detail: `${pack.metadata.id} could not load ${hit._id}` };
                await doc.sheet.render({ force: true });
                await globalThis.wh40kE2E.pollUntil(() => doc.sheet.rendered);
                return { appId: doc.sheet.id, name: doc.name, detail: null };
            }
            return { appId: null, name: null, detail: `no ${docType} with icon ${iconPath} in any pack` };
        },
        { docType: type, iconPath: icon },
    );
}

/** Close a rendered application by its id. */
async function closeApp(page: Page, appId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no browser-side types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: (o: object) => Promise<void> }> } } };
        await g.foundry.applications.instances.get(id)?.close({ animate: false });
    }, appId);
}

/** Name search that fills the compendium browser with pistols of every kind (las, bolt, plasma, stub…). */
const BROWSER_SEARCH = 'Pistol';

/** Render the compendium browser searched to {@link BROWSER_SEARCH}; returns its element id, or null. */
async function openBrowser(page: Page): Promise<string | null> {
    return page.evaluate(
        async ({ url, search }): Promise<string | null> => {
            interface BrowserInstance {
                id: string;
                element: object | null;
                render: (o: { force: boolean }) => Promise<object>;
                _filters: { search: string };
            }
            type BrowserCtor = new (opts: object) => BrowserInstance;
            const mod = (await import(url)) as { RTCompendiumBrowser?: BrowserCtor };
            if (mod.RTCompendiumBrowser === undefined) return null;
            const browser = new mod.RTCompendiumBrowser({});
            browser._filters.search = search;
            await browser.render({ force: true });
            const ok = await globalThis.wh40kE2E.pollUntil(() => browser.element instanceof HTMLElement && browser.element.querySelector('img') !== null);
            return ok ? browser.id : null;
        },
        { url: BROWSER_MODULE_URL, search: BROWSER_SEARCH },
    );
}

async function cleanup(page: Page, ids: ProbeIds): Promise<void> {
    await page.evaluate(async ({ sceneId, actorId }) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime collections are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                scenes: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
            };
        };
        if (sceneId !== null) await g.game.scenes.get(sceneId)?.delete();
        if (actorId !== null) await g.game.actors.get(actorId)?.delete();
    }, ids);
}

test.describe.serial('game-icons pack icons (#625, Tier B)', () => {
    test.setTimeout(scaledMs(300_000));

    test('repointed condition, talent, psychic power and weapon icons load and render', async ({ page }) => {
        await joinOrSkip(page);
        // A CDN URL fails the test only if it never loads: a request the headless
        // browser drops and a later retry serves is network noise, not a bad icon.
        const failedCdn = new Map<string, string>();
        const loadedCdn = new Set<string>();
        page.on('requestfailed', (req) => {
            if (req.url().includes(GAME_ICONS)) failedCdn.set(req.url(), req.failure()?.errorText ?? 'failed');
        });
        page.on('response', (res) => {
            if (!res.url().includes(GAME_ICONS)) return;
            if (res.status() >= 400) failedCdn.set(res.url(), `HTTP ${res.status()}`);
            else loadedCdn.add(res.url());
        });

        let ids: ProbeIds = { sceneId: null, actorId: null, tokenId: null };
        try {
            const placed = await placeTokenWithHud(page);
            ids = placed;
            for (const status of REPOINTED_STATUSES) expect(placed.statusImgs[status] ?? '', `status ${status} icon`).toContain(GAME_ICONS);
            expect(placed.hudProblem, 'token HUD status palette').toBeNull();

            // Token HUD status palette.
            await expect(page.locator('#token-hud .palette.status-effects')).toBeVisible();
            const palette = await gameIconLoads(page, '#token-hud .palette.status-effects');
            expect(palette.broken, 'broken palette icons').toEqual([]);
            expect(palette.loaded, 'game-icons in the status palette').toBeGreaterThanOrEqual(REPOINTED_STATUSES.length);
            // #699: each palette button has its own glyph. About fifteen were one placeholder face
            // (Foundry's poison.svg on every disease, mystery-man on every IM condition).
            const buttons = await page.evaluate(() =>
                // Foundry's palette names each button in `data-tooltip-text`.
                Array.from(document.querySelectorAll<HTMLImageElement>('#token-hud .palette.status-effects img')).map((img) => ({
                    name: img.dataset['tooltipText'] ?? '',
                    img: img.getAttribute('src') ?? '',
                })),
            );
            expect(buttons.length, 'status palette buttons').toBeGreaterThan(REPOINTED_STATUSES.length);
            expect(
                buttons.filter((button) => button.name === ''),
                'palette buttons with no name',
            ).toEqual([]);
            const placeholders: readonly string[] = CONDITION_PLACEHOLDER_ART;
            expect(buttons.filter((button) => placeholders.includes(button.img)).map((button) => button.name)).toEqual([]);
            expect(nonSynonymArtClashes(buttons)).toEqual([]);
            await snap(page, 'pack-icons-token-hud-status-palette', { clip: await hudClip(page) });

            // The same icons drawn on the token itself.
            await applyStatuses(page, ids.tokenId ?? '', ['blinded', 'stunned', 'pinned', 'on-fire']);
            const palettePicked = await gameIconLoads(page, '#token-hud .palette.status-effects');
            expect(palettePicked.broken, 'broken palette icons once active').toEqual([]);
            await snap(page, 'pack-icons-token-hud-active-statuses', { clip: await hudClip(page) });
            await page.keyboard.press('Escape');
            await page.waitForTimeout(scaledMs(1_000));
            const clip = await canvasClip(page, [TOKEN_CENTRE], 90);
            await snap(page, 'pack-icons-token-status-icons', clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });

            // Item sheets.
            const sheetFailures: string[] = [];
            for (const sample of SHEET_SAMPLES) {
                const opened = await openSheetWithIcon(page, sample.type, sample.icon);
                if (opened.appId === null) {
                    sheetFailures.push(`${sample.label}: ${opened.detail ?? 'sheet did not open'}`);
                    continue;
                }
                const loads = await gameIconLoads(page, `#${opened.appId}`);
                if (loads.loaded === 0 || loads.broken.length > 0)
                    sheetFailures.push(`${sample.label} (${opened.name ?? ''}): loaded ${loads.loaded}, broken ${loads.broken.join(', ')}`);
                await snap(page, `pack-icons-sheet-${sample.label}`, { selector: `#${opened.appId}`, closeWindows: true, keepWindow: opened.appId });
                await closeApp(page, opened.appId);
            }
            expect(sheetFailures, 'item sheets whose game-icon did not render').toEqual([]);

            // Compendium browser grid.
            const browserId = await openBrowser(page);
            expect(browserId, 'compendium browser rendered').not.toBeNull();
            const browserLoads = await gameIconLoads(page, `#${browserId ?? 'wh40k-compendium-browser'}`);
            expect(browserLoads.broken, 'broken icons in the compendium browser').toEqual([]);
            expect(browserLoads.loaded, 'game-icons in the compendium browser').toBeGreaterThan(0);
            await snap(page, 'pack-icons-compendium-browser-pistols', {
                selector: `#${browserId ?? 'wh40k-compendium-browser'}`,
                closeWindows: true,
                keepWindow: browserId ?? 'wh40k-compendium-browser',
            });
            if (browserId !== null) await closeApp(page, browserId);

            const neverLoaded = [...failedCdn].filter(([url]) => !loadedCdn.has(url)).map(([url, why]) => `${url} (${why})`);
            expect(neverLoaded, 'game-icons CDN URLs that never loaded').toEqual([]);
        } finally {
            await cleanup(page, ids);
        }
    });
});
