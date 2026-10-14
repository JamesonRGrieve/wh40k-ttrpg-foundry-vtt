import type { Page } from '@playwright/test';
import { canvasClip } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of status-effect visuals on tokens (#595,
 * src/module/canvas/status-visual-layer.ts + status-visual-canvas.ts) in a real
 * Foundry canvas: a condition's authored `system.visual` draws on its bearer's
 * token when the condition arrives, follows its stacks in place, filters the
 * token's art, and is gone — container destroyed, filter taken off — when the
 * condition is removed or the token is deleted.
 *
 * The first flows author the visual on a world condition item (the layer's
 * fallback when the catalog has none), so they do not depend on pack content.
 * `catalog-status-toggle` drives a representative set of catalog statuses
 * through `actor.toggleStatusEffect`, which needs the condition packs (merged
 * from the private content root by run-e2e.sh).
 *
 * The token is captured in every state (.e2e-screenshots/game__status-visual-*.png):
 * bare, each authored visual, the filter, the stacked intensity, each catalog
 * status, and after removal.
 *
 * Each flow records under `status-visual.flow`. Keys MUST match the
 * STATUS_VISUAL_FLOWS constant in scripts/e2e-coverage.mjs.
 */

const STATUS_VISUAL_FLOWS = [
    'condition-item-starts-visual',
    'filter-applied-to-token-art',
    'stacks-update-in-place',
    'removal-stops-visual',
    'catalog-status-toggle',
    'token-delete-destroys-visuals',
] as const;

type FlowName = (typeof STATUS_VISUAL_FLOWS)[number];

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

/**
 * Catalog statuses whose condition documents author a visual, and how each shows:
 * a preset (Prone) and a filter (Unconscious). Fire, Stunned, Pinned and Blood
 * Loss are left out only because their HUD icons still point at the removed
 * vendored art, which Foundry logs as an invalid asset when the status icon draws
 * (the pending icon repoint, unrelated to the visual).
 */
const CATALOG_PROBES: ReadonlyArray<{ id: string; shows: 'container' | 'filter' }> = [
    { id: 'prone', shows: 'container' },
    { id: 'unconscious', shows: 'filter' },
];

interface ItemLike {
    id: string;
    update: (data: object) => Promise<object>;
    delete: () => Promise<object>;
}

interface ActorLike {
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<ItemLike[]>;
    toggleStatusEffect: (id: string, options: { active: boolean }) => Promise<object | boolean | undefined>;
}

interface DisplayObjectLike {
    name: string | null;
    destroyed: boolean;
}

interface PlaceableLike {
    id: string;
    actor: ActorLike | null;
    children: DisplayObjectLike[];
    mesh: { filters: object[] | null } | null;
}

interface TokenDocLike {
    id: string;
    delete: () => Promise<object>;
}

interface ProbeGlobals {
    game: { paused: boolean; togglePause: (p: boolean) => void };
    CONFIG: { statusEffects: Array<{ id: string }> };
    Actor: {
        create: (d: object) => Promise<{ id: string; getTokenDocument: (d: object) => Promise<{ toObject: () => object }> }>;
    };
    Scene: {
        create: (d: object) => Promise<{
            id: string;
            view: () => Promise<void>;
            createEmbeddedDocuments: (type: string, data: object[]) => Promise<TokenDocLike[]>;
        }>;
    };
    canvas: {
        ready: boolean;
        tokens?: { placeables: PlaceableLike[] };
        animatePan: (o: { x: number; y: number; scale: number; duration: number }) => Promise<void>;
    };
    foundry: { canvas: { animation: { CanvasAnimation: { animations: object } } } };
    /** Node-side capture of the probe token, exposed by the test (see {@link exposeStatusSnap}). */
    wh40kStatusSnap: (label: string) => Promise<void>;
}

/** The probe token's centre (placed at 300,300 on a 100 px grid), in canvas pixels. */
const TOKEN_CENTRE = { x: 350, y: 350 };
/** Canvas pixels of margin around the token in each capture. */
const CAPTURE_PAD = 110;

/**
 * Let the in-page probe capture the token at each state: the probe awaits
 * `wh40kStatusSnap(label)`, which snaps a canvas region framed on the token.
 */
async function exposeStatusSnap(page: Page): Promise<void> {
    await page.exposeFunction('wh40kStatusSnap', async (label: string) => {
        // Let core's "+(Prone)" scrolling status text finish so it does not cover the token.
        await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.canvas` is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { foundry: { canvas: { animation: { CanvasAnimation: { animations: object } } } } };
            await globalThis.wh40kE2E.pollUntil(() => Object.keys(g.foundry.canvas.animation.CanvasAnimation.animations).length === 0);
        });
        await page.waitForTimeout(scaledMs(500));
        const clip = await canvasClip(page, [TOKEN_CENTRE], CAPTURE_PAD);
        // Close floating windows (the scene-environment widget sat over the token).
        await snap(page, `status-visual-${label}`, clip === null ? { selector: '#board', closeWindows: true } : { clip, closeWindows: true });
    });
}

async function probeStatusVisuals(page: Page): Promise<ProbeState> {
    return page.evaluate(async (catalogProbes): Promise<ProbeState> => {
        const out: FlowResult[] = [];
        const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
            out.push({ name, ok, detail });
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as ProbeGlobals;
        const { pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
        const waitMs = scale(10_000);
        let sceneId: string | null = null;
        let actorId: string | null = null;
        try {
            const actor = await g.Actor.create({ name: 'status-visual probe', type: 'dh2-npc' });
            actorId = actor.id;
            const scene = await g.Scene.create({ name: 'status-visual probe', width: 800, height: 800 });
            sceneId = scene.id;
            const td = await actor.getTokenDocument({ x: 300, y: 300 });
            const tokenDoc = (await scene.createEmbeddedDocuments('Token', [td.toObject()])).at(0);
            if (tokenDoc === undefined) {
                record('condition-item-starts-visual', false, 'token placement failed');
                return { results: out, sceneId, actorId };
            }
            await scene.view();
            const placeable = (): PlaceableLike | undefined => g.canvas.tokens?.placeables.find((t) => t.id === tokenDoc.id);
            await pollUntil(() => g.canvas.ready && placeable()?.actor != null, scale(20_000));
            if (g.game.paused) g.game.togglePause(false);
            const tok = placeable();
            const bearer = tok?.actor ?? null;
            if (tok === undefined || bearer === null) {
                record('condition-item-starts-visual', false, 'placed token never drew with an actor');
                return { results: out, sceneId, actorId };
            }
            const visuals = (): DisplayObjectLike[] => (placeable()?.children ?? []).filter((c) => c.name === 'wh40k-status-visual' && !c.destroyed);
            const filterCount = (): number => placeable()?.mesh?.filters?.length ?? 0;
            const baseFilters = filterCount();
            // Zoom onto the token so each state's capture shows the visual at a readable size.
            await g.canvas.animatePan({ x: 350, y: 350, scale: 2.5, duration: 0 });
            await g.wh40kStatusSnap('no-condition');

            // 1. an owned condition item with an authored visual starts it
            const [burning] = await bearer.createEmbeddedDocuments('Item', [
                {
                    name: 'probe burning',
                    type: 'condition',
                    system: { identifier: 'probe-burning', stackable: true, stacks: 1, visual: { preset: 'burning', intensity: { perStack: 0.5, max: 2 } } },
                },
            ]);
            const started = await pollUntil(() => visuals().length === 1, waitMs);
            record('condition-item-starts-visual', started, started ? null : `token shows ${visuals().length} visual containers, expected 1`);
            const burningContainer = visuals().at(0);
            await g.wh40kStatusSnap('burning-1-stack');

            // 2. a filter visual filters the token art
            const [desaturated] = await bearer.createEmbeddedDocuments('Item', [
                { name: 'probe desaturate', type: 'condition', system: { identifier: 'probe-desaturate', visual: { filter: 'desaturate' } } },
            ]);
            const filtered = await pollUntil(() => filterCount() === baseFilters + 1, waitMs);
            record('filter-applied-to-token-art', filtered, filtered ? null : `mesh filters ${filterCount()}, expected ${baseFilters + 1}`);
            await g.wh40kStatusSnap('burning-and-desaturate-filter');

            // 3. more stacks change the intensity in place: same container, no second one
            // (the updateItem hook has run by the time the update resolves)
            // (the filter visual from step 2 holds the token's other container)
            await burning.update({ system: { stacks: 3 } });
            const inPlace = burningContainer !== undefined && !burningContainer.destroyed && visuals().length === 2;
            record(
                'stacks-update-in-place',
                inPlace,
                inPlace
                    ? null
                    : `after the stack change the token shows ${visuals().length} containers; original destroyed=${String(burningContainer?.destroyed)}`,
            );
            await g.wh40kStatusSnap('burning-3-stacks-and-desaturate');

            // 4. removing the conditions stops their visuals and takes the filter off
            await burning.delete();
            await desaturated.delete();
            const stopped = await pollUntil(() => visuals().length === 0 && filterCount() === baseFilters, waitMs);
            record(
                'removal-stops-visual',
                stopped,
                stopped ? null : `after removal: ${visuals().length} containers, ${filterCount()} filters (base ${baseFilters})`,
            );
            await g.wh40kStatusSnap('conditions-removed');

            // 5. catalog statuses toggle their visuals on and off
            const known = new Set(g.CONFIG.statusEffects.map((s) => s.id));
            const probes = catalogProbes.filter((p) => known.has(p.id));
            const catalogFailures: string[] = [];
            for (const probe of probes) {
                const shows = (): boolean => (probe.shows === 'filter' ? filterCount() > baseFilters : visuals().length > 0);
                await bearer.toggleStatusEffect(probe.id, { active: true });
                if (!(await pollUntil(shows, waitMs))) catalogFailures.push(`${probe.id}: no visual after apply`);
                await g.wh40kStatusSnap(`catalog-${probe.id}`);
                await bearer.toggleStatusEffect(probe.id, { active: false });
                if (!(await pollUntil(() => !shows(), waitMs))) catalogFailures.push(`${probe.id}: visual left after removal`);
            }
            const catalogOk = probes.length > 0 && catalogFailures.length === 0;
            record(
                'catalog-status-toggle',
                catalogOk,
                catalogOk
                    ? `${probes.map((p) => p.id).join(', ')}`
                    : probes.length === 0
                    ? 'no catalog status with a visual is registered (condition packs missing?)'
                    : catalogFailures.join('; '),
            );

            // 6. deleting the token destroys everything it showed
            await bearer.createEmbeddedDocuments('Item', [
                { name: 'probe stunned', type: 'condition', system: { identifier: 'probe-stunned', visual: { preset: 'stunned' } } },
            ]);
            await pollUntil(() => visuals().length === 1, waitMs);
            await g.wh40kStatusSnap('stunned');
            // Let Foundry's own status scrolling text finish first: deleting a token
            // mid-animation makes core animate a destroyed text object.
            await pollUntil(() => Object.keys(g.foundry.canvas.animation.CanvasAnimation.animations).length === 0, waitMs);
            const held = visuals();
            await tokenDoc.delete();
            const gone = held.length === 1 && (await pollUntil(() => held.every((c) => c.destroyed), waitMs));
            record(
                'token-delete-destroys-visuals',
                gone,
                gone ? null : `held ${held.length} containers; destroyed: ${held.map((c) => String(c.destroyed)).join(',')}`,
            );
        } catch (err) {
            record('condition-item-starts-visual', false, err instanceof Error ? err.message : String(err));
        }
        return { results: out, sceneId, actorId };
    }, CATALOG_PROBES);
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

test.describe.serial('status-effect token visuals (Tier B)', () => {
    test.setTimeout(scaledMs(180_000));
    test('conditions start, follow and stop their token visuals on a live canvas', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], sceneId: null, actorId: null };
        try {
            await exposeStatusSnap(page);
            state = await probeStatusVisuals(page);
        } finally {
            await cleanupProbe(page, state.sceneId, state.actorId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of STATUS_VISUAL_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('status-visual.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, `${failures.length}/${STATUS_VISUAL_FLOWS.length} status-visual probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
