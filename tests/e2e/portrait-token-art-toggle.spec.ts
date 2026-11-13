import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the portrait's token art switch (rules/token-art.ts,
 * WH40KBaseActor#setTokenArtMode, the toggleTokenArt sheet action and the
 * token-mask redraw hooks).
 *
 * An owner's actor sheet shows a small switch above the portrait. Off, the
 * actor's tokens draw the circular bust the system crops from the portrait (a
 * generated RenderTexture on the token mesh); on, they draw the whole image.
 * Switching writes the prototype token and every placed token, and a flag
 * change, which core never redraws for, redraws the token.
 *
 * A DH2 NPC with a core portrait is placed on a fresh scene. The switch starts
 * off and the token shows a bust; one click turns it on, the stored flags read
 * `full` and the token's mesh holds the source art; a second click puts the bust
 * back. The sheet and both token looks are captured.
 *
 * Each flow records under `portrait-token-art.flow`. Keys MUST match
 * PORTRAIT_TOKEN_ART_FLOWS in scripts/e2e-coverage.mjs.
 */

const PORTRAIT_TOKEN_ART_FLOWS = ['switch-starts-on-bust', 'switch-writes-full', 'token-draws-whole-art', 'switch-restores-bust'] as const;
type FlowName = (typeof PORTRAIT_TOKEN_ART_FLOWS)[number];

const NPC_NAME = 'e2e-token-art-toggle';
/** A core Foundry portrait (not placeholder `.svg` art, which never gets a bust). */
const PORTRAIT = 'icons/environment/people/archer.webp';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    actorId: string | null;
    sceneId: string | null;
    sheetId: string | null;
    tokenId: string | null;
}

interface TokenPlaceableLike {
    id: string;
    mesh: { texture: object } | null;
    document: { getFlag: (scope: string, key: string) => string | undefined };
}

interface NpcLike {
    id: string;
    prototypeToken: { getFlag: (scope: string, key: string) => string | undefined };
    getTokenDocument: (data: object) => Promise<{ toObject: () => object }>;
    sheet: { id: string; rendered: boolean; render: (options: { force: boolean }) => Promise<void> };
}

interface ProbeGlobals {
    game: { paused: boolean; togglePause: (p: boolean) => void };
    Actor: { create: (data: object) => Promise<NpcLike | null> };
    Scene: {
        create: (
            d: object,
        ) => Promise<{ id: string; view: () => Promise<void>; createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ id: string }>> }>;
    };
    PIXI: { RenderTexture: abstract new (...a: never[]) => object };
    canvas: { ready: boolean; scene: { id: string } | null; tokens?: { placeables: TokenPlaceableLike[] } };
}

/** Phase one: place the token, open the sheet, check the bust and switch to whole art. */
async function probeToWholeArt(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async ({ name, img }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (flow: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name: flow, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const { waitFor, pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, actorId: null, sceneId: null, sheetId: null, tokenId: null };
            const isBust = (t: TokenPlaceableLike | undefined): boolean => t?.mesh?.texture instanceof g.PIXI.RenderTexture;

            try {
                const actor = await g.Actor.create({ name, type: 'dh2-npc', img, prototypeToken: { texture: { src: img } } });
                if (actor === null) {
                    record('switch-starts-on-bust', false, 'Actor.create returned null');
                    return state;
                }
                state.actorId = actor.id;
                const scene = await g.Scene.create({ name, width: 800, height: 800 });
                state.sceneId = scene.id;
                const td = await actor.getTokenDocument({ x: 300, y: 300 });
                const placed = (await scene.createEmbeddedDocuments('Token', [td.toObject()])).at(0);
                if (placed === undefined) {
                    record('switch-starts-on-bust', false, 'token placement failed');
                    return state;
                }
                state.tokenId = placed.id;
                const placeable = (): TokenPlaceableLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === placed.id);
                let viewing: Promise<void> | null = null;
                await pollUntil(() => {
                    if (g.canvas.ready && placeable()?.mesh != null) return true;
                    if (viewing === null && g.canvas.scene?.id !== scene.id) {
                        viewing = scene.view().finally(() => {
                            viewing = null;
                        });
                    }
                    return false;
                }, scale(60_000));
                if (g.game.paused) g.game.togglePause(false);

                await actor.sheet.render({ force: true });
                await waitFor(() => actor.sheet.rendered, 'NPC sheet render', scale(10_000));
                state.sheetId = actor.sheet.id;
                const toggle = (): HTMLElement | null =>
                    document.getElementById(actor.sheet.id)?.querySelector<HTMLElement>('[data-action="toggleTokenArt"]') ?? null;

                // 1. the switch is there, off, and the token shows the bust
                const bustDrawn = await pollUntil(() => isBust(placeable()), scale(15_000));
                const startsOff = toggle()?.getAttribute('aria-checked') === 'false';
                record(
                    'switch-starts-on-bust',
                    startsOff && bustDrawn,
                    startsOff && bustDrawn ? null : `switch aria-checked ${toggle()?.getAttribute('aria-checked')}; bust drawn ${bustDrawn}`,
                );

                // 2. one click stores whole art on the prototype and on the placed token
                toggle()?.click();
                const stored = await pollUntil(
                    () => actor.prototypeToken.getFlag('wh40k-rpg', 'tokenArt') === 'full' && placeable()?.document.getFlag('wh40k-rpg', 'tokenArt') === 'full',
                    scale(15_000),
                );
                const switchOn = await pollUntil(() => toggle()?.getAttribute('aria-checked') === 'true', scale(10_000));
                record(
                    'switch-writes-full',
                    stored && switchOn,
                    stored && switchOn
                        ? null
                        : `prototype ${actor.prototypeToken.getFlag('wh40k-rpg', 'tokenArt')}, token ${placeable()?.document.getFlag(
                              'wh40k-rpg',
                              'tokenArt',
                          )}, switch ${toggle()?.getAttribute('aria-checked')}`,
                );

                // 3. the token redraws onto the source art: no bust RenderTexture on its mesh
                const whole = await pollUntil(() => placeable()?.mesh != null && !isBust(placeable()), scale(15_000));
                record('token-draws-whole-art', whole, whole ? null : 'the token mesh still holds the generated bust');
            } catch (err) {
                record('switch-starts-on-bust', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { name: NPC_NAME, img: PORTRAIT },
    );
}

/** Phase two: switch back and check the bust returns. */
async function probeBackToBust(page: Page, state: ProbeState): Promise<FlowResult> {
    return page.evaluate(
        async ({ actorId, tokenId }): Promise<FlowResult> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ProbeGlobals & { game: { actors: { get: (id: string) => NpcLike | undefined } } };
            const { pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const actor = actorId === null ? undefined : g.game.actors.get(actorId);
            const placeable = (): TokenPlaceableLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === tokenId);
            if (actor === undefined) return { name: 'switch-restores-bust', ok: false, detail: 'the probe actor is gone' };
            document.getElementById(actor.sheet.id)?.querySelector<HTMLElement>('[data-action="toggleTokenArt"]')?.click();
            const back = await pollUntil(
                () => placeable()?.document.getFlag('wh40k-rpg', 'tokenArt') === 'bust' && placeable()?.mesh?.texture instanceof g.PIXI.RenderTexture,
                scale(15_000),
            );
            return {
                name: 'switch-restores-bust',
                ok: back,
                detail: back
                    ? null
                    : `token flag ${placeable()?.document.getFlag('wh40k-rpg', 'tokenArt')}; bust drawn ${
                          placeable()?.mesh?.texture instanceof g.PIXI.RenderTexture
                      }`,
            };
        },
        { actorId: state.actorId, tokenId: state.tokenId },
    );
}

/** The token's on-screen box, padded, for the capture. */
async function tokenClip(page: Page, tokenId: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return page.evaluate((id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            canvas: {
                app: { view: HTMLCanvasElement };
                tokens?: { get: (i: string) => { getBounds: () => { x: number; y: number; width: number; height: number } } | undefined };
            };
        };
        const bounds = g.canvas.tokens?.get(id)?.getBounds();
        if (bounds === undefined) return null;
        const view = g.canvas.app.view.getBoundingClientRect();
        const pad = 30;
        return {
            x: Math.max(0, view.left + bounds.x - pad),
            y: Math.max(0, view.top + bounds.y - pad),
            width: bounds.width + pad * 2,
            height: bounds.height + pad * 2,
        };
    }, tokenId);
}

async function captureToken(page: Page, tokenId: string | null, label: string): Promise<void> {
    if (tokenId === null) return;
    const clip = await tokenClip(page, tokenId);
    if (clip !== null) await snap(page, label, { clip });
}

async function cleanupProbe(page: Page, state: ProbeState): Promise<void> {
    await page.evaluate(
        async ({ actorId, sceneId }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                    actors: { get: (id: string) => { delete: () => Promise<object> } | undefined };
                };
            };
            if (sceneId !== null)
                await g.game.scenes
                    .get(sceneId)
                    ?.delete()
                    .catch(() => undefined);
            if (actorId !== null)
                await g.game.actors
                    .get(actorId)
                    ?.delete()
                    .catch(() => undefined);
        },
        { actorId: state.actorId, sceneId: state.sceneId },
    );
}

test.describe.serial("the portrait's token art switch (Tier B)", () => {
    test.setTimeout(scaledMs(180_000));
    test('the switch turns a token between the circular bust and the whole art', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, sceneId: null, sheetId: null, tokenId: null };
        try {
            state = await probeToWholeArt(page);
            if (state.sheetId !== null) {
                await snap(page, 'portrait-token-art-switch-on', { selector: `#${state.sheetId}`, keepWindow: state.sheetId });
            }
            await captureToken(page, state.tokenId, 'portrait-token-art-token-whole');
            if (state.actorId !== null) {
                state.results.push(await probeBackToBust(page, state));
                await captureToken(page, state.tokenId, 'portrait-token-art-token-bust');
            }
        } finally {
            await cleanupProbe(page, state);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of PORTRAIT_TOKEN_ART_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('portrait-token-art.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
