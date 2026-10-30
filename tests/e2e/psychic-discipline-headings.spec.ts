import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — the Advancement Dialog's psychic discipline headings read as each book prints them
 * (content#35). The compendium disciplines used to carry import artifacts the dialog printed as
 * section headings: "xChaos Powers\n(Tzeentch)", "zNPC - …" buckets, embedded newlines, and
 * spelling variants. For a BC and a DH2 character this opens the dialog on its Psychic Powers tab,
 * reads every discipline heading and captures the tab. With the null disciplines filled and the
 * per-line maps resolved before the dialog sees them, no power is left under an UNKNOWN or
 * "No discipline" heading. (Which group a given power lands in is psychic-printed-xp's
 * `disciplines-as-printed` flow; this spec checks the heading text itself.)
 */

/** Headings each line's books print that must appear (the BC rules; a DH2 supplement). */
const EXPECTED_HEADINGS: Record<'bc' | 'dh2', readonly string[]> = {
    bc: ['Unaligned', 'Nurgle', 'Slaanesh', 'Tzeentch', 'Exalted', 'Divination', 'Telepathy', 'Telekinesis'],
    dh2: ['Biomancy', 'Divination', 'Pyromancy', 'Telekinesis', 'Telepathy', 'Astropath Psychic Powers', 'Minor Psychic Powers'],
};

interface HeadingRead {
    appId: string | null;
    /** Each discipline heading's label and the powers under it. */
    headings: Array<{ label: string; powers: string[] }>;
    /** The rendered heading texts. */
    rendered: string[];
    error: string | null;
}

/** Open the Advancement Dialog on the Psychic Powers tab and read its discipline headings. */
async function readHeadings(page: Page, actorId: string): Promise<HeadingRead> {
    return page.evaluate(async (id: string) => {
        interface DialogInst {
            id: string;
            element: HTMLElement | null;
            render: (force?: boolean) => Promise<void>;
            _prepareContext: (options: object) => Promise<{ psychic?: { disciplines: Array<{ label: string; items: Array<{ name: string }> }> } }>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => object | undefined } } };
        const actor = g.game.actors.get(id);
        if (actor === undefined) return { appId: null, headings: [], rendered: [], error: 'actor not found' };
        const url = '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js';
        const mod = (await import(/* @vite-ignore */ url)) as { default: new (a: object) => DialogInst };
        const dialog = new mod.default(actor);
        await dialog.render(true);
        await globalThis.wh40kE2E.settle(300);
        dialog.element?.querySelector<HTMLElement>('[data-action="switchTab"][data-tab="psychic"]')?.click();
        await globalThis.wh40kE2E.settle(800);
        const context = await dialog._prepareContext({});
        const headings = (context.psychic?.disciplines ?? []).map((d) => ({ label: d.label, powers: d.items.map((p) => p.name) }));
        const rendered = Array.from(dialog.element?.querySelectorAll<HTMLElement>('h4') ?? []).map((h) => h.textContent);
        return { appId: dialog.id, headings, rendered, error: null };
    }, actorId);
}

test.describe.serial('psychic discipline headings (Tier B, content#35)', () => {
    test.setTimeout(scaledMs(240_000));

    for (const line of ['bc', 'dh2'] as const) {
        test(`${line}: every discipline heading is the book's, with no sort prefix or newline`, async ({ page }) => {
            await joinOrSkip(page);
            const actorId = await createProbeActor(page, { name: `Discipline heading probe (${line})`, type: `${line}-character` });
            expect(actorId, `${line} actor did not create`).not.toBeNull();
            try {
                const read = await readHeadings(page, actorId ?? '');
                expect(read.error, read.error ?? '').toBeNull();
                const labels = read.headings.map((h) => h.label);
                expect(labels.length, 'the Psychic Powers tab lists disciplines').toBeGreaterThan(0);

                for (const label of [...labels, ...read.rendered]) {
                    expect(label, `heading ${JSON.stringify(label)} has a newline`).not.toMatch(/\n/);
                    expect(label, `heading ${JSON.stringify(label)} has an x/z sort prefix`).not.toMatch(/^\s*[xz][A-Z]/);
                    expect(label, `heading ${JSON.stringify(label)} is an NPC bucket`).not.toMatch(/zNPC|xChaos|xRenegade/);
                }
                for (const heading of EXPECTED_HEADINGS[line]) expect(labels, `${line} lists ${heading}`).toContain(heading);

                const ungrouped = read.headings.filter((h) => /^(unknown|no discipline)$/i.test(h.label.trim()));
                expect(ungrouped, `powers with no discipline: ${JSON.stringify(ungrouped)}`).toEqual([]);

                if (read.appId !== null) {
                    await snap(page, `psychic-discipline-headings-${line}`, { selector: `#${read.appId}`, closeWindows: true, keepWindow: read.appId });
                }
            } finally {
                await deleteProbeActors(page, actorId === null ? [] : [actorId]);
            }
        });
    }
});
