import { canvasClip } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';
import { PROBE_GRID } from './scene-probe';

/**
 * Tier B — one batch never shares a face (#567, ff7aa41e5).
 *
 * Foundry runs every `preCreate` of a batch before any document lands in
 * `game.actors` / `scene.tokens`, so the portrait roll used to see the same
 * "used" set for each spawn and a multi-actor import or a mob drop all rolled
 * one image. The production hooks now reserve each pick in a ledger until its
 * document is created. This drives both real batch paths on Foundry:
 *
 *   1. `Actor.createDocuments` with three copies of a pooled statblock (a
 *      multi-actor import) → three different portraits.
 *   2. One `createEmbeddedDocuments('Token', …)` drop of three UNLINKED tokens of
 *      that statblock (a mob drop) → three different token images, captured on
 *      the canvas.
 */

/** A five-portrait pool of core icons no other spec uses as an actor image. */
const POOL = ['icons/svg/skull.svg', 'icons/svg/sun.svg', 'icons/svg/fire.svg', 'icons/svg/lightning.svg', 'icons/svg/ice-aura.svg'];
const TOKEN_POINTS = [
    { x: 300, y: 300 },
    { x: 500, y: 300 },
    { x: 700, y: 300 },
];

interface BatchProbe {
    error: string | null;
    templateId: string;
    copyIds: string[];
    actorImgs: string[];
    sceneId: string;
    tokenImgs: string[];
    usedBefore: string[];
}

test('one batch of spawns never shares a face: actors and an unlinked mob drop (#567)', async ({ page }) => {
    test.setTimeout(scaledMs(180_000));
    await joinOrSkip(page);

    const probe = await page.evaluate(
        async (args): Promise<BatchProbe> => {
            interface ActorDoc {
                id: string;
                img: string;
                toObject: () => Record<string, object | string | null>;
                getTokenDocument: (d: { x: number; y: number; actorLink: boolean }) => Promise<{ toObject: () => object }>;
            }
            interface SceneDoc {
                id: string;
                view: () => Promise<void>;
                createEmbeddedDocuments: (type: string, data: object[]) => Promise<Array<{ texture: { src: string } }>>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: { create: (d: object) => Promise<ActorDoc | null>; createDocuments: (d: object[]) => Promise<ActorDoc[]> };
                Scene: { create: (d: object) => Promise<SceneDoc | null> };
                game: { actors: { contents: Array<{ img: string }> } };
                canvas: {
                    ready: boolean;
                    scene: { id: string } | null;
                    tokens?: { placeables: object[] };
                    animatePan: (view: { x: number; y: number; scale: number; duration: number }) => Promise<boolean>;
                };
            };
            const out: BatchProbe = { error: null, templateId: '', copyIds: [], actorImgs: [], sceneId: '', tokenImgs: [], usedBefore: [] };
            try {
                const [head, ...rest] = args.pool;
                const template = await g.Actor.create({
                    name: 'Portrait Batch Ganger',
                    type: 'dh2-npc',
                    img: head,
                    system: {
                        gameSystem: 'dh2',
                        portraits: { variants: rest.map((img) => ({ img, tokenFrame: { cx: 0.5, cy: 0.3, zoom: 1 } })), pinned: null },
                    },
                });
                if (template === null) return { ...out, error: 'Actor.create returned null' };
                out.templateId = template.id;
                out.usedBefore = g.game.actors.contents.map((a) => a.img).filter((img) => args.pool.includes(img));

                // 1. A multi-actor import: three copies created in ONE batch.
                const source = template.toObject();
                delete source['_id'];
                const copies = await g.Actor.createDocuments([1, 2, 3].map((n) => ({ ...source, name: `Portrait Batch Ganger ${n}` })));
                out.copyIds = copies.map((c) => c.id);
                out.actorImgs = copies.map((c) => c.img);

                // 2. A mob drop: three unlinked tokens of the statblock in ONE batch.
                const scene = await g.Scene.create({ name: 'Portrait Batch Probe', width: 1200, height: 900, grid: { size: args.grid } });
                if (scene === null) return { ...out, error: 'Scene.create returned null' };
                out.sceneId = scene.id;
                const tokenData = await Promise.all(args.points.map(async (p) => (await template.getTokenDocument({ ...p, actorLink: false })).toObject()));
                const placed = await scene.createEmbeddedDocuments('Token', tokenData);
                out.tokenImgs = placed.map((t) => t.texture.src);
                await scene.view();
                await globalThis.wh40kE2E.pollUntil(
                    () => g.canvas.ready && g.canvas.scene?.id === scene.id && (g.canvas.tokens?.placeables.length ?? 0) === args.points.length,
                    globalThis.wh40kE2E.scaledMs(20_000),
                );
                // Zoom onto the dropped mob so the three faces read in the capture.
                await g.canvas.animatePan({ x: 550, y: 350, scale: 2, duration: 0 });
                await globalThis.wh40kE2E.settle(1500);
                return out;
            } catch (err) {
                return { ...out, error: err instanceof Error ? err.message : String(err) };
            }
        },
        { pool: POOL, points: TOKEN_POINTS, grid: PROBE_GRID },
    );

    try {
        expect(probe.error, probe.error ?? '').toBeNull();
        expect(probe.actorImgs).toHaveLength(3);
        for (const img of probe.actorImgs) expect(POOL).toContain(img);
        expect(new Set(probe.actorImgs).size, `actor portraits ${probe.actorImgs.join(', ')} (in use before: ${probe.usedBefore.join(', ')})`).toBe(3);
        expect(probe.tokenImgs).toHaveLength(3);
        for (const img of probe.tokenImgs) expect(POOL).toContain(img);
        expect(new Set(probe.tokenImgs).size, `token images ${probe.tokenImgs.join(', ')}`).toBe(3);

        const clip = await canvasClip(
            page,
            TOKEN_POINTS.map((p) => ({ x: p.x + PROBE_GRID / 2, y: p.y + PROBE_GRID / 2 })),
            PROBE_GRID,
        );
        expect(clip, 'the canvas should frame the dropped tokens').not.toBeNull();
        if (clip !== null) expect(await snap(page, 'portrait-batch-mob-drop-distinct-faces', { clip, closeWindows: true })).not.toBeNull();
        recordCoverage('portrait.flow', 'batch-pending-picks');
    } finally {
        await page.evaluate(async (p: BatchProbe) => {
            interface Deletable {
                delete: () => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { scenes: { get: (id: string) => Deletable | undefined }; actors: { get: (id: string) => Deletable | undefined } };
            };
            await g.game.scenes.get(p.sceneId)?.delete();
            await Promise.all([p.templateId, ...p.copyIds].map(async (id) => g.game.actors.get(id)?.delete()));
        }, probe);
    }
});
