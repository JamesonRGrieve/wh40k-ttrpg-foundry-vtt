import type { Page } from '@playwright/test';
import { canvasClip, lightDiscFractions } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the bust-diameter parity (#501): a player character's token
 * (Dynamic Ring on, subject scale 0.8, the live PC shape) and a ringless,
 * unframed NPC token (the live mystery-man Citizen shape) placed side by side
 * from the same portrait must draw their circular busts at the SAME on-token
 * diameter. Before #501 the ringless NPC kept its raw art and drew ~1.7× larger.
 *
 * The diameter is measured ON SCREEN: the light disc through each token's centre in
 * a real screenshot, as a fraction of the token. It used to be the bust
 * RenderTexture's opaque run times the configured ring subject scale, which
 * passed while the capture showed the PC 1.25× the Citizen — core does not shrink
 * a 512 px bust by the subject scale. The portrait is a light, opaque core texture
 * so the disc stands out from the canvas and the ring's dark background.
 * A zoomed screenshot (.e2e-screenshots/game__token-bust-parity-pc-and-npc.png) records the pair for
 * visual review. The pure maths is unit-tested in src/module/canvas/token-mask.test.ts.
 *
 * Each flow records under `token-bust-parity.flow`. Keys MUST match the
 * TOKEN_BUST_PARITY_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const TOKEN_BUST_PARITY_FLOWS = ['ringless-npc-busted', 'pc-and-npc-same-diameter', 'npc-bust-same-opacity'] as const;

type FlowName = (typeof TOKEN_BUST_PARITY_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    sceneId: string | null;
    actorIds: string[];
}

/** A light, opaque raster that ships with Foundry core: it reads clearly against the canvas
 * and a ring's dark background, and its 236 px edge tells it apart from the 512 px bust. */
const PORTRAIT = 'ui/parchment-white.jpg';
/** The generated bust's RenderTexture edge, in px (`RT_SIZE` in token-mask.ts). */
const BUST_RT_SIZE = 512;
/** The live PC tokens' ring subject scale. */
const PC_SUBJECT_SCALE = 0.8;
/** The bust diameter every actor-portrait token draws at (ENFORCED_BUST_FRACTION in token-mask.ts). */
const ENFORCED_BUST_FRACTION = 0.75;
/** On-screen diameters are compared as token fractions; one screen pixel at zoom 3 is ~0.003, so allow a few. */
const DIAMETER_TOLERANCE = 0.015;
/** The scene's grid size, in canvas pixels: a 1×1 token's edge. */
const TOKEN_SIZE = 100;
/** The PC and NPC token centres the probe places (100px grid, tokens at x 300 / 400, y 300). */
const TOKEN_CENTRES = [
    { x: 350, y: 350 },
    { x: 450, y: 350 },
] as const;
/** Canvas pixels of margin around the token pair in the capture. */
const CAPTURE_PAD = 90;

interface TokenDocLike {
    id: string;
}

interface SceneLike {
    id: string;
    view: () => Promise<void>;
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<TokenDocLike[]>;
}

interface ActorLike {
    id: string;
    getTokenDocument: (d: object) => Promise<{ toObject: () => object }>;
}

interface TextureLike {
    width: number;
    height: number;
}

interface TokenPlaceableLike {
    id: string;
    alpha: number;
    document: { hidden: boolean; alpha: number };
    mesh?: { texture?: TextureLike; alpha: number; worldAlpha: number };
}

interface ProbeGlobals {
    game: { paused: boolean; togglePause: (p: boolean) => void };
    Actor: { create: (d: object) => Promise<ActorLike> };
    Scene: { create: (d: object) => Promise<SceneLike> };
    canvas: {
        ready: boolean;
        animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
        tokens?: { placeables: TokenPlaceableLike[] };
        app: { renderer: { extract: { pixels: (target: TextureLike) => Uint8Array | Uint8ClampedArray } } };
    };
}

async function probeParity(page: Page, portrait: string): Promise<ProbeState> {
    return page.evaluate(
        async (args: { src: string; rtSize: number; subjectScale: number }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const { pollUntil, settle, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, sceneId: null, actorIds: [] };
            try {
                const pc = await g.Actor.create({ name: 'parity PC', type: 'dh2-character' });
                const npc = await g.Actor.create({ name: 'parity Citizen', type: 'dh2-npc' });
                state.actorIds = [pc.id, npc.id];
                const scene = await g.Scene.create({ name: 'bust parity probe', width: 800, height: 800 });
                state.sceneId = scene.id;
                const pcData = { ...(await pc.getTokenDocument({ x: 300, y: 300 })).toObject() };
                const npcData = { ...(await npc.getTokenDocument({ x: 400, y: 300 })).toObject() };
                const placed = await scene.createEmbeddedDocuments('Token', [
                    // the live PC shape: ring on, subject 0.8, a centre-only frame
                    {
                        ...pcData,
                        texture: { src: args.src },
                        ring: { enabled: true, subject: { scale: args.subjectScale } },
                        flags: { 'wh40k-rpg': { tokenFrame: { cx: 0.5, cy: 0.5 } } },
                    },
                    // the live Citizen shape: ringless, no frame
                    { ...npcData, texture: { src: args.src }, ring: { enabled: false } },
                ]);
                const pcTok = placed.at(0);
                const npcTok = placed.at(1);
                if (pcTok === undefined || npcTok === undefined) {
                    record('ringless-npc-busted', false, 'token placement failed');
                    return state;
                }
                const textureOf = (id: string): TextureLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === id)?.mesh?.texture;
                const isBust = (tex: TextureLike | undefined): boolean => tex?.width === args.rtSize && tex.height === args.rtSize;
                await scene.view();
                if (g.game.paused) g.game.togglePause(false);
                await pollUntil(() => g.canvas.ready && isBust(textureOf(pcTok.id)) && isBust(textureOf(npcTok.id)), scale(20_000));

                const pcTex = textureOf(pcTok.id);
                const npcTex = textureOf(npcTok.id);
                record(
                    'ringless-npc-busted',
                    isBust(npcTex),
                    isBust(npcTex) ? null : `ringless NPC mesh texture is ${npcTex?.width ?? '?'}x${npcTex?.height ?? '?'}, expected the ${args.rtSize}px bust`,
                );
                if (pcTex === undefined || npcTex === undefined || !isBust(pcTex)) {
                    record('pc-and-npc-same-diameter', false, 'a token never showed its bust');
                    return state;
                }

                // The bust must keep the art's own opacity: both meshes draw fully visible
                // to the GM, and the two busts' centre pixels carry the same alpha.
                const shown = (id: string): string => {
                    const t = g.canvas.tokens?.placeables.find((p) => p.id === id);
                    return `hidden=${String(t?.document.hidden)} doc.alpha=${String(t?.document.alpha)} alpha=${String(t?.alpha)} mesh.alpha=${String(
                        t?.mesh?.alpha,
                    )} mesh.worldAlpha=${String(t?.mesh?.worldAlpha)}`;
                };
                await settle(1000);
                const centreAlpha = (tex: TextureLike): number => {
                    const px = g.canvas.app.renderer.extract.pixels(tex);
                    const mid = Math.floor(args.rtSize / 2);
                    return px[(mid * args.rtSize + mid) * 4 + 3] ?? 0;
                };
                const npcAlpha = g.canvas.tokens?.placeables.find((p) => p.id === npcTok.id)?.mesh?.worldAlpha ?? 0;
                const pcAlpha = g.canvas.tokens?.placeables.find((p) => p.id === pcTok.id)?.mesh?.worldAlpha ?? 0;
                const sameOpacity = npcAlpha >= 0.99 && pcAlpha >= 0.99 && centreAlpha(npcTex) === centreAlpha(pcTex);
                record(
                    'npc-bust-same-opacity',
                    sameOpacity,
                    sameOpacity
                        ? null
                        : `NPC ${shown(npcTok.id)} centre pixel alpha ${centreAlpha(npcTex)}; PC ${shown(pcTok.id)} centre pixel alpha ${centreAlpha(pcTex)}`,
                );

                await g.canvas.animatePan({ x: 400, y: 350, scale: 3, duration: 0 });
                await settle(1000);
            } catch (err) {
                record('ringless-npc-busted', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { src: portrait, rtSize: BUST_RT_SIZE, subjectScale: PC_SUBJECT_SCALE },
    );
}

async function cleanupProbe(page: Page, sceneId: string | null, actorIds: string[]): Promise<void> {
    await page.evaluate(
        async (ids: { sceneId: string | null; actorIds: string[] }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: {
                    scenes: { get: (id: string) => { delete: () => Promise<void> } | undefined };
                    actors: { get: (id: string) => { delete: () => Promise<void> } | undefined };
                };
            };
            if (ids.sceneId !== null) {
                await g.game.scenes
                    .get(ids.sceneId)
                    ?.delete()
                    .catch(() => undefined);
            }
            await Promise.all(
                ids.actorIds.map(async (id) =>
                    g.game.actors
                        .get(id)
                        ?.delete()
                        .catch(() => undefined),
                ),
            );
        },
        { sceneId, actorIds },
    );
}

test.describe.serial('PC vs NPC token bust parity (Tier B, #501)', () => {
    test.setTimeout(scaledMs(180_000));
    test('a ringed PC and a ringless Citizen draw the same bust diameter', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], sceneId: null, actorIds: [] };
        try {
            state = await probeParity(page, PORTRAIT);
            await clearScreenOverlays(page);
            // Let the tokens finish their draw-in fade before the capture.
            await page.waitForTimeout(scaledMs(800));
            const clip = await canvasClip(page, TOKEN_CENTRES, CAPTURE_PAD);
            await snap(page, 'token-bust-parity-pc-and-npc', clip === null ? { selector: '#board' } : { clip });
            if (state.results.every((r) => r.name !== 'pc-and-npc-same-diameter')) {
                const fractions = (await lightDiscFractions(page, TOKEN_CENTRES, TOKEN_SIZE)) ?? [];
                const pc = fractions.at(0);
                const npc = fractions.at(1);
                const ok =
                    pc !== undefined &&
                    npc !== undefined &&
                    Math.abs(pc - npc) <= DIAMETER_TOLERANCE &&
                    Math.abs(npc - ENFORCED_BUST_FRACTION) <= DIAMETER_TOLERANCE;
                state.results.push({
                    name: 'pc-and-npc-same-diameter',
                    ok,
                    detail: ok
                        ? null
                        : `on screen the PC bust is ${pc?.toFixed(3) ?? '?'} of the token, the ringless NPC ${
                              npc?.toFixed(3) ?? '?'
                          } (want both ${ENFORCED_BUST_FRACTION})`,
                });
            }
        } finally {
            await cleanupProbe(page, state.sceneId, state.actorIds);
        }

        const failures: string[] = [];
        const fired = new Map(state.results.map((r) => [r.name, r]));
        for (const flow of TOKEN_BUST_PARITY_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) {
                recordCoverage('token-bust-parity.flow', flow);
            } else {
                failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
            }
        }

        expect(failures, `${failures.length}/${TOKEN_BUST_PARITY_FLOWS.length} bust-parity probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
