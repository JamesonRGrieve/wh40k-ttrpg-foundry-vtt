import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { packHoldingName } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of printed psychic power XP (content#30, src/module/utils/item-variant-utils.ts
 * `systemForLine`). Every psychic power now carries the XP its book prints in `system.cost`: a
 * plain number, or a per-line map where the power is shared and the books differ.
 * Precognition is one canonical DH2 document, stubbed into the BC pack, printing 400 xp in DH2
 * core and 100 xp in BC core. The Advancement Dialog reads the raw compendium index, resolves the
 * map to the actor's line and charges that value; before, a per-line map read as "not authored"
 * and every power was priced by the Psy Rating heuristic.
 *
 * For a DH2 and a BC character this opens the dialog on its Psychic Powers tab, reads what each
 * power is charged and captures the tab with Precognition's row outlined. It also loads Cauterise
 * from the DH2 compendium (the issue's spot check, "Value: 300 xp", as DH2 core prints it).
 *
 * Each flow records under `psychic-printed-xp.flow`. Keys MUST match PSYCHIC_PRINTED_XP_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

const PSYCHIC_PRINTED_XP_FLOWS = [
    'dh2-charges-dh2-printing',
    'bc-charges-bc-printing',
    'cauterise-carries-300',
    'dh2-tiers-by-printed-psy-rating',
    'bc-lists-every-book-once',
    'disciplines-as-printed',
] as const;

/** The Psy Rating DH2 core prints for these powers (content#34). */
const PRINTED_PSY_RATING: Record<string, number> = { 'Molten Beam': 4, 'Flame Breath': 3 };
type FlowName = (typeof PSYCHIC_PRINTED_XP_FLOWS)[number];

/**
 * What each line's printing charges: Precognition as DH2 core and BC core print it; Fate Loom
 * is a BC supplement's power, and Doombolt a BC core power that another BC book restates
 * for a pregenerated sorcerer.
 */
const EXPECTED: Record<'dh2' | 'bc', { flow: FlowName; charges: Record<string, number> }> = {
    dh2: { flow: 'dh2-charges-dh2-printing', charges: { Precognition: 400, Cauterise: 300 } },
    bc: { flow: 'bc-charges-bc-printing', charges: { 'Precognition': 100, 'Fate Loom': 500, 'Doombolt': 200 } },
};

interface DialogRead {
    appId: string | null;
    charges: Record<string, number>;
    tiers: Record<string, number>;
    /** How many rows each power name takes in the list. */
    listed: Record<string, number>;
    /** The discipline group each power is listed under (content#35). */
    groupOf: Record<string, string>;
    error: string | null;
}

/** Open the Advancement Dialog on the Psychic Powers tab and read each named power's cost and PR tier. */
async function readCharges(page: Page, actorId: string, names: readonly string[]): Promise<DialogRead> {
    return page.evaluate(
        async (args: { actorId: string; names: readonly string[] }) => {
            interface PreparedPower {
                name: string;
                cost: number;
                prCost: number;
            }
            interface DialogInst {
                id: string;
                element: HTMLElement | null;
                render: (force?: boolean) => Promise<void>;
                _prepareContext: (options: object) => Promise<{ psychic?: { disciplines: Array<{ label: string; items: PreparedPower[] }> } }>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { actors: { get: (id: string) => object | undefined } } };
            const actor = g.game.actors.get(args.actorId);
            if (actor === undefined) return { appId: null, charges: {}, tiers: {}, listed: {}, groupOf: {}, error: 'actor not found' };
            const url = '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js';
            const mod = (await import(/* @vite-ignore */ url)) as { default: new (a: object) => DialogInst };
            const dialog = new mod.default(actor);
            await dialog.render(true);
            await globalThis.wh40kE2E.settle(300);
            dialog.element?.querySelector<HTMLElement>('[data-action="switchTab"][data-tab="psychic"]')?.click();
            await globalThis.wh40kE2E.settle(800);
            const context = await dialog._prepareContext({});
            const powers = (context.psychic?.disciplines ?? []).flatMap((discipline) => discipline.items);
            const charges: Record<string, number> = {};
            const tiers: Record<string, number> = {};
            const listed: Record<string, number> = {};
            for (const power of powers) {
                if (args.names.includes(power.name)) charges[power.name] = power.cost;
                tiers[power.name] = power.prCost;
                listed[power.name] = (listed[power.name] ?? 0) + 1;
            }
            const groupOf: Record<string, string> = {};
            for (const discipline of context.psychic?.disciplines ?? []) {
                for (const power of discipline.items) groupOf[power.name] = discipline.label;
            }
            // Outline Precognition's row for the capture.
            const row = Array.from(dialog.element?.querySelectorAll<HTMLElement>('[data-action="openCompendiumItem"]') ?? []).find(
                (link) => link.dataset['name'] === 'Precognition',
            );
            const rowBox = row?.closest<HTMLElement>('.tw-rounded-md');
            rowBox?.style.setProperty('outline', '2px dashed #ff00ff');
            rowBox?.scrollIntoView({ block: 'center' });
            return { appId: dialog.id, charges, tiers, listed, groupOf, error: null };
        },
        { actorId, names },
    );
}

/** Do two name → number records hold the same entries, whatever their key order? */
function sameEntries(a: Record<string, number | undefined>, b: Record<string, number>): boolean {
    const keys = Object.keys(b);
    return Object.keys(a).length === keys.length && keys.every((key) => a[key] === b[key]);
}

/** The DH2 compendium's Cauterise, loaded through the DataModel. */
async function cauteriseCost(page: Page): Promise<number | null | string> {
    const packName = packHoldingName({ line: 'dh2', category: 'psychic-powers' }, 'Cauterise');
    return page.evaluate(async (powersPack) => {
        interface Pack {
            metadata: { name: string };
            documentName: string;
            getIndex: () => Promise<Array<{ _id: string; name: string }>>;
            getDocument: (id: string) => Promise<{ system: { cost: number | null } } | null>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { packs: { find: (fn: (p: Pack) => boolean) => Pack | undefined } } };
        const pack = g.game.packs.find((p) => p.documentName === 'Item' && p.metadata.name === powersPack);
        if (pack === undefined) return `${powersPack} pack missing`;
        const entry = (await pack.getIndex()).find((e) => e.name === 'Cauterise');
        if (entry === undefined) return 'Cauterise missing from the pack';
        const doc = await pack.getDocument(entry._id);
        return doc === null ? 'Cauterise did not load' : doc.system.cost;
    }, packName);
}

test.describe.serial('psychic powers charge their printed XP (Tier B, content#30)', () => {
    test.setTimeout(scaledMs(240_000));
    test('the Advancement Dialog charges each line its own printing', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        const printedGroups: Partial<Record<'dh2' | 'bc', { precognition: string; nurgle: boolean; ungrouped: string[] }>> = {};
        try {
            for (const line of ['dh2', 'bc'] as const) {
                const { flow, charges: expected } = EXPECTED[line];
                // eslint-disable-next-line no-await-in-loop -- one dialog at a time, captured in turn
                const actorId = await createProbeActor(page, { name: `Printed XP probe (${line})`, type: `${line}-character` });
                if (actorId === null) {
                    record(flow, false, `${line} actor did not create`);
                    continue;
                }
                actors.push(actorId);
                // eslint-disable-next-line no-await-in-loop -- reads the dialog just opened
                const read = await readCharges(page, actorId, Object.keys(expected));
                record(flow, read.error === null && sameEntries(read.charges, expected), `${line}: ${JSON.stringify(read.charges)}`);
                if (line === 'dh2') {
                    const tiers = Object.fromEntries(Object.keys(PRINTED_PSY_RATING).map((name) => [name, read.tiers[name]]));
                    record('dh2-tiers-by-printed-psy-rating', sameEntries(tiers, PRINTED_PSY_RATING), `dh2 tiers ${JSON.stringify(tiers)}`);
                }
                if (line === 'bc') {
                    // The BC supplement's power is listed (#674), and a power two books print takes one row.
                    const rows = { 'Fate Loom': read.listed['Fate Loom'], 'Doombolt': read.listed['Doombolt'] };
                    record('bc-lists-every-book-once', sameEntries(rows, { 'Fate Loom': 1, 'Doombolt': 1 }), `bc rows ${JSON.stringify(rows)}`);
                }
                // content#35: every power groups under the discipline its book prints, none under "No discipline".
                const groups = new Set(Object.values(read.groupOf));
                printedGroups[line] = {
                    precognition: read.groupOf['Precognition'] ?? '',
                    nurgle: groups.has('Nurgle'),
                    ungrouped: [...groups].filter((g) => /^(no discipline|unknown)$/i.test(g)),
                };
                if (line === 'bc') {
                    const dh2 = printedGroups.dh2;
                    const bc = printedGroups.bc;
                    record(
                        'disciplines-as-printed',
                        dh2?.precognition === 'Divination' && dh2.ungrouped.length === 0 && bc?.nurgle === true && bc.ungrouped.length === 0,
                        JSON.stringify(printedGroups),
                    );
                }
                if (read.appId !== null) {
                    // eslint-disable-next-line no-await-in-loop -- captures the dialog just opened
                    await snap(page, `psychic-printed-xp-${line}-advancement`, { selector: `#${read.appId}`, closeWindows: true, keepWindow: read.appId });
                }
            }
            const cost = await cauteriseCost(page);
            record('cauterise-carries-300', cost === 300, `Cauterise system.cost ${String(cost)}`);
        } finally {
            await deleteProbeActors(page, actors);
        }
        assertFlowResults({ results }, PSYCHIC_PRINTED_XP_FLOWS, { dimension: 'psychic-printed-xp.flow', label: 'psychic printed XP' });
    });
});
