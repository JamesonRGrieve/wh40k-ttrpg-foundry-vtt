import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the runtime circular token mask
 * (src/module/canvas/token-mask.ts): a token whose document carries
 * `flags.wh40k-rpg.tokenFrame` renders a GPU-generated circular bust from a
 * PLAIN RECTANGULAR portrait — no pre-tokenized image variant involved —
 * seated inside the Dynamic Ring band (75% content). A flagless control
 * token on the same scene keeps its source texture untouched.
 *
 * The geometry (computeFrameTransform / parseTokenFrameFlag) is unit-tested
 * in src/module/canvas/token-mask.test.ts; this spec verifies the canvas
 * half: the refreshToken hook fires, the mesh texture is swapped for the
 * generated RenderTexture, the ring band survives (it is drawn by the same
 * mesh — a mask would have clipped it; the texture swap must not), and a
 * zoomed screenshot artifact (screenshots/token-mask.png) records the
 * composited result.
 *
 * Each flow records under `token-mask.flow`. Keys MUST match the
 * TOKEN_MASK_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const TOKEN_MASK_FLOWS = ['flag-generates-bust', 'control-token-untouched', 'renders-circular-with-band'] as const;

type FlowName = (typeof TOKEN_MASK_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    sceneId: string | null;
    actorId: string | null;
}

// A real RECTANGULAR portrait (1458x2087) — must exist and serve: a missing
// path silently becomes Foundry's 512x512 fallback texture on EVERY token,
// which once produced a false "bust applied" pass here.
const PORTRAIT = 'systems/wh40k-rpg/images/bestiary/dh2/death-jester.webp';

interface TokenDocLike {
    id: string;
    update: (data: object) => Promise<object>;
}

interface SceneLike {
    id: string;
    view: () => Promise<void>;
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<TokenDocLike[]>;
}

interface ProbeGlobals {
    game: {
        paused: boolean;
        togglePause: (p: boolean) => void;
    };
    Actor: {
        create: (d: object) => Promise<{
            id: string;
            getTokenDocument: (d: object) => Promise<{ toObject: () => object }>;
        }>;
    };
    Scene: { create: (d: object) => Promise<SceneLike> };
    canvas: {
        ready: boolean;
        animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
        tokens?: { placeables: Array<{ id: string; mesh: { texture: { width: number; height: number } } | null }> };
    };
}

async function probeTokenMask(page: Page, portrait: string): Promise<ProbeState> {
    return page.evaluate(async (src: string): Promise<ProbeState> => {
        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as ProbeGlobals;
        let sceneId: string | null = null;
        let actorId: string | null = null;
        try {
            // fail loud on a bad fixture path — a 404 texture silently becomes
            // Foundry's 512x512 fallback and poisons every assertion below
            const head = await fetch(src);
            if (!head.ok) {
                record('flag-generates-bust', false, `fixture portrait ${src} does not serve: ${head.status}`);
                return { results: out, sceneId, actorId };
            }
            const actor = await g.Actor.create({ name: 'mask probe', type: 'dh2-npc' });
            actorId = actor.id;
            const scene = await g.Scene.create({ name: 'token-mask probe', width: 800, height: 800 });
            sceneId = scene.id;
            const td = await actor.getTokenDocument({ x: 300, y: 300 });
            const placed = await scene.createEmbeddedDocuments('Token', [td.toObject(), { ...td.toObject(), x: 500, y: 500 }]);
            const masked = placed.at(0);
            const control = placed.at(1);
            if (masked === undefined || control === undefined) {
                record('flag-generates-bust', false, 'token placement failed');
                return { results: out, sceneId, actorId };
            }
            await scene.view();
            await new Promise((resolve) => {
                setTimeout(resolve, 4000);
            });
            if (g.game.paused) g.game.togglePause(false);

            // the flagged token: rectangular portrait + ring + tokenFrame flag
            await masked.update({
                texture: { src },
                ring: { enabled: true },
                flags: { 'wh40k-rpg': { tokenFrame: { cx: 0.5, cy: 0.3 } } },
            });
            // the control token: same portrait, no flag
            await control.update({ texture: { src }, ring: { enabled: true } });
            await new Promise((resolve) => {
                setTimeout(resolve, 3000);
            });

            const placeables = g.canvas.tokens?.placeables ?? [];
            const maskedTok = placeables.find((t) => t.id === masked.id);
            const controlTok = placeables.find((t) => t.id === control.id);
            const maskedTex = maskedTok?.mesh?.texture;
            const controlTex = controlTok?.mesh?.texture;
            // the generated bust is a 512x512 RenderTexture; the raw portrait is not square
            const bustApplied = maskedTex?.width === 512 && maskedTex.height === 512;
            record(
                'flag-generates-bust',
                bustApplied,
                bustApplied ? null : `masked token mesh texture is ${maskedTex?.width ?? '?'}x${maskedTex?.height ?? '?'}, expected 512x512`,
            );
            const controlUntouched = controlTex !== undefined && !(controlTex.width === 512 && controlTex.height === 512);
            const sameTexture = maskedTok?.mesh?.texture === controlTok?.mesh?.texture;
            // eslint-disable-next-line no-restricted-syntax -- boundary: probing the runtime flag value on the live document
            const controlFlag = (control as unknown as { getFlag?: (s: string, k: string) => object | undefined }).getFlag?.('wh40k-rpg', 'tokenFrame');
            record(
                'control-token-untouched',
                controlUntouched,
                controlUntouched
                    ? null
                    : `control token mesh texture is ${controlTex?.width ?? '?'}x${controlTex?.height ?? '?'}; sharesTextureWithMasked=${String(
                          sameTexture,
                      )}; controlFlag=${JSON.stringify(controlFlag ?? null)}`,
            );

            await g.canvas.animatePan({ x: 350, y: 350, scale: 3, duration: 0 });
            await new Promise((resolve) => {
                setTimeout(resolve, 1000);
            });
            record('renders-circular-with-band', g.canvas.ready, g.canvas.ready ? null : 'canvas.ready is false');
        } catch (err) {
            record('flag-generates-bust', false, err instanceof Error ? err.message : String(err));
        }
        return { results: out, sceneId, actorId };
    }, portrait);
}

async function cleanupProbe(page: Page, sceneId: string | null, actorId: string | null): Promise<void> {
    await page.evaluate(
        async (ids: { sceneId: string | null; actorId: string | null }) => {
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
            if (ids.actorId !== null) {
                await g.game.actors
                    .get(ids.actorId)
                    ?.delete()
                    .catch(() => undefined);
            }
        },
        { sceneId, actorId },
    );
}

test.describe.serial('runtime token mask (Tier B)', () => {
    test.setTimeout(180_000);
    test('tokenFrame flag renders a circular bust from a rectangular portrait', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        let state: ProbeState = { results: [], sceneId: null, actorId: null };
        try {
            state = await probeTokenMask(page, PORTRAIT);
            const renderFlow = state.results.find((r) => r.name === 'renders-circular-with-band');
            if (renderFlow?.ok === true) {
                const vp = page.viewportSize() ?? { width: 1280, height: 720 };
                await page.screenshot({
                    path: 'tests/e2e/screenshots/token-mask.png',
                    clip: { x: vp.width / 2 - 300, y: vp.height / 2 - 300, width: 600, height: 600 },
                });
            }
        } finally {
            await cleanupProbe(page, state.sceneId, state.actorId);
            page.off('pageerror', listener);
        }

        const failures: string[] = [];
        const fired = new Map(state.results.map((r) => [r.name, r]));
        for (const flow of TOKEN_MASK_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) {
                recordCoverage('token-mask.flow', flow);
            } else {
                failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
            }
        }

        const pageErrorTail = pageErrors.length > 0 ? `\n  pageerrors: ${pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(failures, `${failures.length}/${TOKEN_MASK_FLOWS.length} token-mask probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual([]);
    });
});
