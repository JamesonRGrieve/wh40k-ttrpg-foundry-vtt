import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B for the shared condition copies (#595, #516): a line that prints a
 * condition the same way as DH2 resolves it through the DH2 document, so its
 * token HUD shows the same game-icons art. The status list is built for the
 * world's line; the probe rebuilds it in place for BC and then RT (the same
 * `registerConditionStatusEffects` the `ready` handler calls), opens the token HUD
 * status palette for an actor of that line, and checks the seven repointed
 * statuses. The world's own list is restored afterwards.
 */

const GAME_ICONS = '/gh/game-icons/icons@';
const REPOINTED_STATUSES = ['blinded', 'blood-loss', 'deafened', 'insanity', 'on-fire', 'pinned', 'stunned'] as const;
const LINES = ['bc', 'rt'] as const;
const REGISTRY_URL = '/systems/wh40k-rpg/module/rules/condition-registry.js';
const VARIANTS_URL = '/systems/wh40k-rpg/module/utils/item-variant-utils.js';

interface HudProbe {
    sceneId: string | null;
    actorId: string | null;
    /** The palette image source for each repointed status ('' when the palette lacks it). */
    paletteImgs: Record<string, string>;
    problem: string | null;
}

interface TokenLike {
    id: string;
    actor: object | null;
    control: (options: { releaseOthers: boolean }) => boolean;
}
interface ProbeGlobals {
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
        hud: { token: { bind: (token: TokenLike) => Promise<void>; togglePalette: (palette: string, active: boolean) => void } };
        animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
    };
}
interface RegistryModule {
    registerConditionStatusEffects: (target: Array<{ id: string; img: string }>, line: string) => void;
}
interface VariantsModule {
    inferActiveGameLine: () => string;
}

/** Rebuild the status list for `line`, place a token of that line and open its HUD status palette. */
async function openHudForLine(page: Page, line: string): Promise<HudProbe> {
    return page.evaluate(
        async ({ gameLine, statuses, registryUrl }): Promise<HudProbe> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const { pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const registry = (await import(/* @vite-ignore */ registryUrl)) as RegistryModule;
            registry.registerConditionStatusEffects(g.CONFIG.statusEffects, gameLine);

            const actor = await g.Actor.create({ name: `condition-icons ${gameLine}`, type: `${gameLine}-npc`, system: { gameSystem: gameLine } });
            const scene = await g.Scene.create({ name: `condition-icons ${gameLine}`, width: 800, height: 800 });
            const td = await actor.getTokenDocument({ x: 300, y: 300 });
            const tokenDoc = (await scene.createEmbeddedDocuments('Token', [td.toObject()])).at(0);
            const probe: HudProbe = { sceneId: scene.id, actorId: actor.id, paletteImgs: {}, problem: null };
            if (tokenDoc === undefined) return { ...probe, problem: 'token placement failed' };
            const placeable = (): TokenLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === tokenDoc.id);
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
            if (tok === undefined) return { ...probe, problem: 'placed token never drew' };
            await g.canvas.animatePan({ x: 350, y: 350, scale: 1.5, duration: 0 });
            tok.control({ releaseOthers: true });
            await g.canvas.hud.token.bind(tok);
            g.canvas.hud.token.togglePalette('effects', true);
            const open = await pollUntil(() => document.querySelector('#token-hud .palette.status-effects.active') !== null, scale(10_000));
            if (!open) return { ...probe, problem: 'status palette never opened' };
            for (const id of statuses) {
                const el = document.querySelector(`#token-hud .palette.status-effects [data-status-id="${id}"]`);
                const img = el instanceof HTMLImageElement ? el : el?.querySelector('img');
                probe.paletteImgs[id] = img?.getAttribute('src') ?? '';
            }
            return probe;
        },
        { gameLine: line, statuses: [...REPOINTED_STATUSES], registryUrl: REGISTRY_URL },
    );
}

/** Delete the probe documents and put the world's own status list back. */
async function restore(page: Page, probe: HudProbe | null): Promise<void> {
    await page.evaluate(
        async ({ sceneId, actorId, registryUrl, variantsUrl }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                CONFIG: ProbeGlobals['CONFIG'];
                game: {
                    scenes: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                    actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                };
            };
            if (sceneId !== null) await g.game.scenes.get(sceneId)?.delete();
            if (actorId !== null) await g.game.actors.get(actorId)?.delete();
            const registry = (await import(/* @vite-ignore */ registryUrl)) as RegistryModule;
            const variants = (await import(/* @vite-ignore */ variantsUrl)) as VariantsModule;
            registry.registerConditionStatusEffects(g.CONFIG.statusEffects, variants.inferActiveGameLine());
        },
        { sceneId: probe?.sceneId ?? null, actorId: probe?.actorId ?? null, registryUrl: REGISTRY_URL, variantsUrl: VARIANTS_URL },
    );
}

/** Crop to the token HUD. */
async function hudClip(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate(() => {
        const rects = Array.from(document.querySelectorAll<HTMLElement>('#token-hud, #token-hud *'))
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
        const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - 12);
        const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - 12);
        const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + 12);
        const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + 12);
        return { x: left, y: top, width: right - left, height: bottom - top };
    });
}

test.describe.serial('shared condition art on non-DH2 lines (#595, #516)', () => {
    test.setTimeout(scaledMs(240_000));

    for (const line of LINES) {
        test(`the ${line.toUpperCase()} token HUD shows the game-icons art for every repointed status`, async ({ page }) => {
            await joinOrSkip(page);
            let probe: HudProbe | null = null;
            try {
                probe = await openHudForLine(page, line);
                expect(probe.problem, 'token HUD status palette').toBeNull();
                for (const status of REPOINTED_STATUSES) expect(probe.paletteImgs[status] ?? '', `${line} ${status} icon`).toContain(GAME_ICONS);
                const shot = await snap(page, `condition-status-icons-${line}`, { clip: await hudClip(page) });
                expect(shot, `snap ${line}`).not.toBeNull();
            } finally {
                await restore(page, probe);
            }
        });
    }
});
