import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the bust-diameter parity (#501): a player character's token
 * (Dynamic Ring on, subject scale 0.8, the live PC shape) and a ringless,
 * unframed NPC token (the live mystery-man Citizen shape) placed side by side
 * from the same portrait must draw their circular busts at the SAME on-token
 * diameter. Before #501 the ringless NPC kept its raw art and drew ~1.7× larger.
 *
 * The diameter is measured, not assumed: the opaque run across the middle row of
 * each token's generated bust RenderTexture, scaled by what the canvas applies to
 * it (the ring subject scale for the ringed token, nothing for the ringless one).
 * A zoomed screenshot (screenshots/token-bust-parity.png) records the pair for
 * visual review. The pure maths is unit-tested in src/module/canvas/token-mask.test.ts.
 *
 * Each flow records under `token-bust-parity.flow`. Keys MUST match the
 * TOKEN_BUST_PARITY_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const TOKEN_BUST_PARITY_FLOWS = ['ringless-npc-busted', 'pc-and-npc-same-diameter'] as const;

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

/** A rectangular raster that ships with Foundry core, so the bust is distinguishable from the raw art. */
const PORTRAIT = 'ui/anvil-bg.png';
/** The generated bust's RenderTexture edge, in px (`RT_SIZE` in token-mask.ts). */
const BUST_RT_SIZE = 512;
/** The live PC tokens' ring subject scale. */
const PC_SUBJECT_SCALE = 0.8;
/** Diameters are compared as token fractions; one RT pixel is ~0.002, so allow a few. */
const DIAMETER_TOLERANCE = 0.01;

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
    mesh?: { texture?: TextureLike };
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
        async (args: { src: string; rtSize: number; subjectScale: number; tolerance: number }): Promise<ProbeState> => {
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

                // Opaque run across the bust's middle row, as a fraction of the RT edge.
                const diameter = (tex: TextureLike): number => {
                    const px = g.canvas.app.renderer.extract.pixels(tex);
                    const row = Math.floor(args.rtSize / 2);
                    let opaque = 0;
                    for (let x = 0; x < args.rtSize; x++) if ((px[(row * args.rtSize + x) * 4 + 3] ?? 0) > 0) opaque++;
                    return opaque / args.rtSize;
                };
                const pcDiameter = diameter(pcTex) * args.subjectScale;
                const npcDiameter = diameter(npcTex);
                const same = Math.abs(pcDiameter - npcDiameter) <= args.tolerance;
                record(
                    'pc-and-npc-same-diameter',
                    same,
                    same ? null : `PC bust ${pcDiameter.toFixed(3)} of the token vs ringless NPC ${npcDiameter.toFixed(3)}`,
                );

                await g.canvas.animatePan({ x: 400, y: 350, scale: 3, duration: 0 });
                await settle(1000);
            } catch (err) {
                record('ringless-npc-busted', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { src: portrait, rtSize: BUST_RT_SIZE, subjectScale: PC_SUBJECT_SCALE, tolerance: DIAMETER_TOLERANCE },
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
            const vp = page.viewportSize() ?? { width: 1280, height: 720 };
            await page.screenshot({
                path: 'tests/e2e/screenshots/token-bust-parity.png',
                clip: { x: vp.width / 2 - 300, y: vp.height / 2 - 300, width: 600, height: 600 },
            });
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
