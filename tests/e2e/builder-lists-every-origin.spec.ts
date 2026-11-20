import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: the origin-path builder lists every origin its line's builder packs hold.
 *
 * Player feedback on 0.2.1: the DH1 builder's Home World step showed only the core
 * four (Feral, Hive, Imperial, Void Born), though the line's second builder pack holds
 * the supplement's home worlds too. This opens the DH1 builder and checks that each
 * Home World entry in the builder packs' index is a card on the step. The per-pack
 * index and loaded-document counts in the failure text show where any entry is lost:
 * at load (a document that fails validation) or later.
 */

const BUILDER_MODULE_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';

interface ProbeActor {
    id: string;
    delete: () => Promise<void>;
}
interface ProbeBuilder {
    id: string;
    allOrigins?: Array<{ name?: string; system?: { step?: string } }>;
    currentStepIndex: number;
    render: (force?: boolean) => Promise<void>;
    close: () => Promise<void>;
}
interface ProbePack {
    collection: string;
    metadata: { flags?: { 'wh40k-rpg'?: { line?: string; originBuilder?: number } } };
    getIndex: (o: object) => Promise<Iterable<{ _id: string; name?: string; type?: string; system?: { step?: string } }>>;
    getDocuments: () => Promise<Array<{ id: string | null }>>;
}
interface ProbeWindow {
    Actor: { create: (data: object) => Promise<ProbeActor | null> };
    game: { actors: { get: (id: string) => ProbeActor | undefined }; packs: Iterable<ProbePack> };
    wh40kE2E: { pollUntil: (fn: () => boolean) => Promise<void>; settle: (ms: number) => Promise<void> };
    e2eLineBuilder?: ProbeBuilder;
}
interface BuilderProbe {
    builderId: string;
    actorId: string;
    packs: Array<{ pack: string; rank: number; indexed: number; loaded: number; homeWorlds: string[]; lost: string[] }>;
    listed: string[];
    cards: string[];
}

test.describe.serial('The origin builder lists every origin in its packs (Tier B)', () => {
    test.beforeEach(async ({ page }) => {
        await joinOrSkip(page);
    });

    test('the DH1 Home World step lists every home world the builder packs hold', async ({ page }) => {
        const probe = await page.evaluate(
            async ({ moduleUrl }): Promise<BuilderProbe> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
                const w = globalThis as unknown as ProbeWindow;
                const packs: BuilderProbe['packs'] = [];
                for (const pack of w.game.packs) {
                    const flags = pack.metadata.flags?.['wh40k-rpg'];
                    if (flags?.line !== 'dh1' || flags.originBuilder === undefined) continue;
                    const index = Array.from(await pack.getIndex({ fields: ['system.step'] }));
                    const docs = await pack.getDocuments();
                    const loadedIds = new Set(docs.map((d) => d.id));
                    const homeWorlds = index.filter((e) => e.type === 'originPath' && e.system?.step === 'homeWorld');
                    packs.push({
                        pack: pack.collection,
                        rank: flags.originBuilder,
                        indexed: index.length,
                        loaded: docs.length,
                        homeWorlds: homeWorlds.map((e) => e.name ?? e._id),
                        lost: index.filter((e) => !loadedIds.has(e._id)).map((e) => e.name ?? e._id),
                    });
                }

                const actor = await w.Actor.create({ name: 'e2e-dh1-builder-probe', type: 'dh1-character', system: { gameSystem: 'dh1' } });
                if (actor === null) throw new Error('Actor.create returned null');
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of the built builder module
                const mod = (await import(moduleUrl)) as { default: new (actor: ProbeActor, options: object) => ProbeBuilder };
                const builder = new mod.default(actor, {});
                builder.currentStepIndex = 0;
                await builder.render(true);
                await w.wh40kE2E.pollUntil(() => (builder.allOrigins?.length ?? 0) > 0);
                await builder.render();
                await w.wh40kE2E.settle(300);
                w.e2eLineBuilder = builder;
                const listed = (builder.allOrigins ?? []).filter((o) => o.system?.step === 'homeWorld').map((o) => o.name ?? '');
                const cards = Array.from(document.querySelectorAll<HTMLElement>(`#${builder.id} [data-action="selectOriginCard"]`), (el) =>
                    el.textContent.trim(),
                );
                return { builderId: builder.id, actorId: actor.id, packs, listed, cards };
            },
            { moduleUrl: BUILDER_MODULE_URL },
        );

        const diag = JSON.stringify(probe.packs);
        expect(probe.packs.length, `DH1 builder packs: ${diag}`).toBeGreaterThan(1);
        expect(
            probe.packs.flatMap((p) => p.lost),
            `documents in the index that did not load: ${diag}`,
        ).toEqual([]);
        const expected = [...new Set(probe.packs.flatMap((p) => p.homeWorlds))].sort();
        expect([...new Set(probe.listed)].sort(), `home worlds the builder loaded; packs: ${diag}`).toEqual(expected);
        for (const name of expected)
            expect(
                probe.cards.some((card) => card.includes(name)),
                `card for ${name}; cards: ${probe.cards.join(' | ')}`,
            ).toBe(true);

        await clearScreenOverlays(page, probe.builderId);
        expect(await snap(page, 'origin-builder-dh1-home-worlds', { selector: `#${probe.builderId}` })).not.toBeNull();

        await page.evaluate(async (actorId) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            await w.e2eLineBuilder?.close();
            await w.game.actors.get(actorId)?.delete();
        }, probe.actorId);
        recordCoverage('origin.builder', 'lists-every-origin.dh1');
    });
});
