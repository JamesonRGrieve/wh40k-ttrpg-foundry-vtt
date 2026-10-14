import type { Page } from '@playwright/test';

/**
 * A compendium document to open by pack id (without the `wh40k-rpg.` prefix)
 * and document name: its own sheet, or (`compendium`) the compendium window,
 * which shows each entry's art thumbnail.
 */
export interface PackDocumentRef {
    pack: string;
    name: string;
    view: 'sheet' | 'compendium';
}

/** The opened application's id and the document's image, or why it did not open. */
export interface OpenedPackDocument {
    appId: string | null;
    img: string | null;
    detail: string | null;
}

/** Open a compendium document's sheet (or its compendium window) and wait for it to render. */
export async function openPackDocument(page: Page, ref: PackDocumentRef): Promise<OpenedPackDocument> {
    return page.evaluate(
        async ({ packId, docName, view }): Promise<OpenedPackDocument> => {
            interface AppLike {
                id: string;
                rendered: boolean;
                render: (o: { force: boolean }) => Promise<object>;
            }
            interface PackLike {
                apps: AppLike[];
                render: (force: boolean) => void;
                getIndex: () => Promise<Iterable<{ _id: string; name: string }>>;
                getDocument: (id: string) => Promise<{ img: string; sheet: AppLike } | null>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.packs` is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { packs: { get: (id: string) => PackLike | undefined } } };
            const { pollUntil } = globalThis.wh40kE2E;
            const pack = g.game.packs.get(`wh40k-rpg.${packId}`);
            if (pack === undefined) return { appId: null, img: null, detail: `pack ${packId} not loaded` };
            const hit = Array.from(await pack.getIndex()).find((e) => e.name === docName);
            if (hit === undefined) return { appId: null, img: null, detail: `${docName} not in ${packId}` };
            const doc = await pack.getDocument(hit._id);
            if (doc === null) return { appId: null, img: null, detail: `${packId} could not load ${hit._id}` };
            if (view === 'compendium') {
                pack.render(true);
                await pollUntil(() => pack.apps.some((a) => a.rendered));
                const app = pack.apps.find((a) => a.rendered);
                return app === undefined
                    ? { appId: null, img: doc.img, detail: `${packId} window did not render` }
                    : { appId: app.id, img: doc.img, detail: null };
            }
            await doc.sheet.render({ force: true });
            if (!(await pollUntil(() => doc.sheet.rendered))) return { appId: null, img: doc.img, detail: `${docName} sheet did not render` };
            return { appId: doc.sheet.id, img: doc.img, detail: null };
        },
        { packId: ref.pack, docName: ref.name, view: ref.view },
    );
}

/** Close a rendered application by its id. */
export async function closeApp(page: Page, appId: string): Promise<void> {
    await page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry.applications.instances` has no browser-side types
        const g = globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: (o: object) => Promise<void> }> } } };
        await g.foundry.applications.instances.get(id)?.close({ animate: false });
    }, appId);
}
