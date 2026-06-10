import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B verification that the DH2 art pipeline's tokens work with the core
 * Dynamic Token Ring in a REAL Foundry runtime.
 *
 * The packs no longer ship baked token files: each actor carries a plain
 * portrait at `prototypeToken.texture.src` plus a
 * `prototypeToken.flags.wh40k-rpg.tokenFrame = {cx, cy}` (the runtime mask in
 * src/module/canvas/token-mask.ts GPU-crops a circular bust at draw time) and
 * `prototypeToken.ring.enabled`. The runtime mask itself is exercised by
 * token-mask.spec.ts; what only a live Foundry can verify here is the half
 * this spec covers:
 *
 *   - the ring + tokenFrame JSON survives the real TokenDocument schema (a
 *     wrong field name would be silently stripped during Actor.create),
 *   - a scene-embedded token created through actor.getTokenDocument() (the
 *     drag-to-canvas path) inherits the enabled ring — a bare { actorId }
 *     embed does NOT apply the prototype,
 *   - the portrait the texture points at is actually SERVED by the Foundry
 *     static route (for the local-portrait actor this probe selects),
 *   - the canvas RENDERS it: PIXI boots under SwiftShader (contrary to the
 *     assumption documented in canvas-ruler.spec.ts), the placed token gets
 *     a live TokenRing, and a zoomed screenshot artifact
 *     (screenshots/token-ring.png) records the composited result — circular
 *     bust seated inside the steel ring chrome.
 *
 * Each flow records under `token-ring.flow`. Keys MUST match the
 * TOKEN_RING_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const TOKEN_RING_FLOWS = [
    'pack-actor-ring-art-found',
    'ring-survives-document-schema',
    'scene-token-inherits-ring',
    'token-webp-served',
    'ring-renders-on-canvas',
] as const;

type FlowName = (typeof TOKEN_RING_FLOWS)[number];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface StageOneState {
    results: FlowResult[];
    sceneId: string | null;
    actorId: string | null;
}

interface PrototypeTokenish {
    texture?: { src?: string };
    ring?: { enabled?: boolean };
    flags?: { 'wh40k-rpg'?: { tokenFrame?: { cx?: number; cy?: number } } };
}

interface ActorData {
    _id?: string;
    name?: string;
    prototypeToken?: PrototypeTokenish;
}

interface TokenData {
    ring?: { enabled?: boolean };
    texture?: { src?: string };
    x?: number;
    y?: number;
}

interface ActorDocish {
    id: string;
    name: string;
    prototypeToken?: PrototypeTokenish;
    toObject: () => ActorData;
    getTokenDocument: (data: { x: number; y: number }) => Promise<{ toObject: () => TokenData }>;
}

interface DocumentGlobals {
    game: {
        packs: Iterable<{ metadata: { type: string; id: string }; getDocuments: () => Promise<ActorDocish[]> }>;
    };
    Actor: { create: (data: ActorData) => Promise<ActorDocish> };
    Scene: {
        create: (data: { name: string; width: number; height: number }) => Promise<{
            id: string;
            createEmbeddedDocuments: (type: string, data: TokenData[]) => Promise<TokenData[]>;
        }>;
    };
}

interface CanvasGlobals {
    game: {
        paused: boolean;
        togglePause: (p: boolean) => void;
        scenes: { get: (id: string) => { view: () => Promise<void> } | undefined };
    };
    canvas: {
        ready: boolean;
        animatePan: (opts: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
        tokens?: { placeables: Array<{ ring?: object | null }> };
    };
}

interface CleanupGlobals {
    game: {
        scenes: { get: (id: string) => { delete: () => Promise<void> } | undefined };
        actors: { get: (id: string) => { delete: () => Promise<void> } | undefined };
    };
}

async function probeDocumentFlows(page: Page): Promise<StageOneState> {
    return page.evaluate(async (): Promise<StageOneState> => {
        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as DocumentGlobals;

        // -- 1. locate a DH2 pack actor authored with a runtime tokenFrame bust +
        // ring. Prefer one whose texture is a local Foundry-served portrait so the
        // token-webp-served probe exercises the static route deterministically
        // (hotlink-portrait actors would otherwise resolve against an external CDN).
        const dh2Packs = [...g.game.packs].filter((p) => p.metadata.type === 'Actor' && p.metadata.id.includes('dh2'));
        const docLists = await Promise.all(dh2Packs.map(async (p) => p.getDocuments()));
        const framed = docLists.flat().filter((doc) => doc.prototypeToken?.flags?.['wh40k-rpg']?.tokenFrame !== undefined);
        if (framed.length === 0) {
            record('pack-actor-ring-art-found', false, 'no DH2 pack actor carries a prototypeToken tokenFrame flag');
            return { results: out, sceneId: null, actorId: null };
        }
        const sourceActor: ActorDocish = framed.find((doc) => (doc.prototypeToken?.texture?.src ?? '').startsWith('systems/wh40k-rpg/')) ?? framed[0];
        const textureSrc = sourceActor.prototypeToken?.texture?.src ?? '';
        const frame = sourceActor.prototypeToken?.flags?.['wh40k-rpg']?.tokenFrame;
        const packRingEnabled = sourceActor.prototypeToken?.ring?.enabled === true;
        record(
            'pack-actor-ring-art-found',
            packRingEnabled,
            packRingEnabled
                ? `${sourceActor.name} -> tokenFrame ${JSON.stringify(frame)} src=${textureSrc}`
                : `${sourceActor.name} carries tokenFrame but ring.enabled is not true in pack source`,
        );

        // -- 2. world import: the ring config must survive the real schema
        let actorId: string | null = null;
        let sceneId: string | null = null;
        try {
            const data = sourceActor.toObject();
            delete data._id;
            const world = await g.Actor.create(data);
            actorId = world.id;
            const kept = world.prototypeToken?.ring?.enabled === true;
            record('ring-survives-document-schema', kept, kept ? null : 'prototypeToken.ring.enabled stripped or false after Actor.create schema validation');

            // -- 3. scene-embedded token inherits the enabled ring
            const scene = await g.Scene.create({ name: 'token-ring-art probe', width: 800, height: 800 });
            sceneId = scene.id;
            const protoTd = await world.getTokenDocument({ x: 300, y: 300 });
            const placed = await scene.createEmbeddedDocuments('Token', [protoTd.toObject()]);
            const tokenDoc = placed.at(0);
            const placedSrc = tokenDoc?.texture?.src ?? '<none>';
            const inherited = tokenDoc?.ring?.enabled === true && placedSrc === textureSrc;
            record('scene-token-inherits-ring', inherited, inherited ? null : `placed token ring=${String(tokenDoc?.ring?.enabled)} texture=${placedSrc}`);
        } catch (err) {
            record('ring-survives-document-schema', false, err instanceof Error ? err.message : String(err));
        }

        // -- 4. the bust is actually served by the Foundry static route
        try {
            const res = await fetch(textureSrc);
            const ctype = res.headers.get('content-type') ?? '';
            const ok = res.ok && ctype.includes('image');
            record('token-webp-served', ok, ok ? `${res.status} ${ctype}` : `status=${res.status} content-type=${ctype}`);
        } catch (err) {
            record('token-webp-served', false, err instanceof Error ? err.message : String(err));
        }
        return { results: out, sceneId, actorId };
    });
}

async function probeCanvasRender(page: Page, sceneId: string): Promise<FlowResult> {
    const state = await page.evaluate(async (id: string): Promise<{ ok: boolean; detail: string | null }> => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as CanvasGlobals;
        try {
            const scene = g.game.scenes.get(id);
            if (scene === undefined) return { ok: false, detail: `scene ${id} not found` };
            await scene.view();
            await new Promise((resolve) => {
                setTimeout(resolve, 5000);
            });
            if (g.game.paused) g.game.togglePause(false);
            await g.canvas.animatePan({ x: 350, y: 350, scale: 3, duration: 0 });
            await new Promise((resolve) => {
                setTimeout(resolve, 2000);
            });
            const tok = g.canvas.tokens?.placeables[0];
            if (!g.canvas.ready) return { ok: false, detail: 'canvas.ready is false after scene.view()' };
            if (tok?.ring == null) return { ok: false, detail: 'placed token has no TokenRing instance' };
            return { ok: true, detail: null };
        } catch (err) {
            return { ok: false, detail: err instanceof Error ? err.message : String(err) };
        }
    }, sceneId);
    if (state.ok) {
        const vp = page.viewportSize() ?? { width: 1280, height: 720 };
        await page.screenshot({
            path: 'tests/e2e/screenshots/token-ring.png',
            clip: { x: vp.width / 2 - 300, y: vp.height / 2 - 300, width: 600, height: 600 },
        });
    }
    return { name: 'ring-renders-on-canvas', ok: state.ok, detail: state.detail };
}

async function cleanup(page: Page, sceneId: string | null, actorId: string | null): Promise<void> {
    await page.evaluate(
        async (ids: { sceneId: string | null; actorId: string | null }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as CleanupGlobals;
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

test.describe.serial('token ring art (Tier B)', () => {
    test.setTimeout(180_000);
    test('DH2 token busts ring-enable, serve, and render in a live Foundry world', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        let results: FlowResult[] = [];
        let sceneId: string | null = null;
        let actorId: string | null = null;
        try {
            const stageOne = await probeDocumentFlows(page);
            results = [...stageOne.results];
            sceneId = stageOne.sceneId;
            actorId = stageOne.actorId;
            if (sceneId !== null) {
                results.push(await probeCanvasRender(page, sceneId));
            }
        } finally {
            await cleanup(page, sceneId, actorId);
            page.off('pageerror', listener);
        }

        const failures: string[] = [];
        const fired = new Map(results.map((r) => [r.name, r]));
        for (const flow of TOKEN_RING_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) {
                recordCoverage('token-ring.flow', flow);
            } else {
                failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
            }
        }

        const pageErrorTail = pageErrors.length > 0 ? `\n  pageerrors: ${pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(failures, `${failures.length}/${TOKEN_RING_FLOWS.length} token-ring probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`).toEqual([]);
    });
});
