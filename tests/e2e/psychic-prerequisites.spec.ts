import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors } from './lib/sheet-probe';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of psychic power prerequisites (#673, content#34).
 *
 * Psychic powers had no `prerequisites` field: the sheet's input was dropped on save,
 * the pack text never loaded, and the Advancement Dialog gated only on Psy Rating. The
 * field is now the shared structured shape talents use
 * (src/module/data/shared/prerequisites-field.ts), authored from each book's printed
 * Prerequisite line, and the dialog checks it. DH2 core prints Smite's prerequisite as
 * "Willpower 40" (p. 202).
 *
 * Captures: psychic-prerequisites-smite-blocked (a Willpower 25 character's dialog, Smite's
 * row outlined) and psychic-prerequisites-sheet (a power's sheet after a reload).
 *
 * Each flow records under `psychic-prerequisites.flow`. Keys MUST match
 * PSYCHIC_PREREQUISITE_FLOWS in scripts/e2e-coverage.mjs.
 */

const PSYCHIC_PREREQUISITE_FLOWS = ['smite-loads-printed-prerequisite', 'willpower-gate-blocks', 'willpower-gate-clears', 'sheet-keeps-prerequisites'] as const;
type FlowName = (typeof PSYCHIC_PREREQUISITE_FLOWS)[number];

const SMITE_GATE = 'willpower 40+';
const SHEET_POWER = 'e2e-673 psychic power';
const TYPED = 'Willpower 45, Psyniscience';

/** Smite as the DH2 compendium loads it through the DataModel. */
async function smitePrerequisites(page: Page): Promise<{ text: string; willpower: number | undefined } | string> {
    return page.evaluate(async () => {
        interface Pack {
            metadata: { name: string };
            documentName: string;
            getIndex: () => Promise<Array<{ _id: string; name: string }>>;
            getDocument: (id: string) => Promise<{ system: { prerequisites: { text: string; characteristics: Record<string, number> } } } | null>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { packs: { find: (fn: (p: Pack) => boolean) => Pack | undefined } } };
        const pack = g.game.packs.find((p) => p.documentName === 'Item' && p.metadata.name === 'dh2-core-items-psychic-powers');
        const entry = (await pack?.getIndex())?.find((e) => e.name === 'Smite');
        if (pack === undefined || entry === undefined) return 'Smite not found in dh2-core-items-psychic-powers';
        const doc = await pack.getDocument(entry._id);
        if (doc === null) return 'Smite did not load';
        return { text: doc.system.prerequisites.text, willpower: doc.system.prerequisites.characteristics['willpower'] };
    });
}

/** The unmet prerequisites the Advancement Dialog lists for Smite, after setting the actor's Willpower. */
async function smiteUnmet(page: Page, actorId: string, willpower: number, outline: boolean): Promise<{ appId: string; unmet: string[] } | string> {
    return page.evaluate(
        async (args: { actorId: string; willpower: number; outline: boolean }) => {
            interface PreparedPower {
                name: string;
                prereqDisplay: string[];
            }
            interface DialogInst {
                id: string;
                element: HTMLElement | null;
                render: (force?: boolean) => Promise<void>;
                _prepareContext: (options: object) => Promise<{ psychic?: { disciplines: Array<{ items: PreparedPower[] }> } }>;
            }
            interface ProbeActor {
                update: (data: object) => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game: { actors: { get: (id: string) => ProbeActor | undefined } } };
            const actor = g.game.actors.get(args.actorId);
            if (actor === undefined) return 'actor not found';
            await actor.update({ 'system.characteristics.willpower.base': args.willpower, 'system.characteristics.willpower.advance': 0 });
            await globalThis.wh40kE2E.settle(300);
            const url = '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js';
            const mod = (await import(/* @vite-ignore */ url)) as { default: new (a: object) => DialogInst };
            const dialog = new mod.default(actor);
            await dialog.render(true);
            await globalThis.wh40kE2E.settle(300);
            dialog.element?.querySelector<HTMLElement>('[data-action="switchTab"][data-tab="psychic"]')?.click();
            await globalThis.wh40kE2E.settle(800);
            const context = await dialog._prepareContext({});
            const smite = (context.psychic?.disciplines ?? []).flatMap((d) => d.items).find((p) => p.name === 'Smite');
            if (smite === undefined) return 'Smite not listed';
            if (args.outline) {
                const link = Array.from(dialog.element?.querySelectorAll<HTMLElement>('[data-action="openCompendiumItem"]') ?? []).find(
                    (l) => l.dataset['name'] === 'Smite',
                );
                const row = link?.closest<HTMLElement>('.tw-rounded-md');
                row?.style.setProperty('outline', '2px dashed #ff00ff');
                row?.scrollIntoView({ block: 'center' });
            }
            return { appId: dialog.id, unmet: smite.prereqDisplay };
        },
        { actorId, willpower, outline },
    );
}

/** Type prerequisites on a world psychic power's sheet, reload, and read them back from the server. */
async function sheetRoundTrip(page: Page): Promise<{ stored: string; shown: string; sheetId: string } | string> {
    const created = await page.evaluate(async (name: string) => {
        interface ProbeItem {
            sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { Item: { create: (data: object) => Promise<ProbeItem | null> } };
        const item = await g.Item.create({ name, type: 'psychicPower' });
        if (item === null) return null;
        await item.sheet.render({ force: true });
        await globalThis.wh40kE2E.settle(500);
        return item.sheet.id;
    }, SHEET_POWER);
    if (created === null) return 'power did not create';
    const input = page.locator(`#${created} [name="system.prerequisites.text"]`);
    await input.fill(TYPED);
    await input.dispatchEvent('change');
    await page.waitForTimeout(scaledMs(800));
    await page.reload();
    await joinOrSkip(page);
    return page.evaluate(async (name: string) => {
        interface ProbeItem {
            system: { prerequisites: { text: string } };
            sheet: { id: string; render: (opts: { force: boolean }) => Promise<void> };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { items: { getName: (n: string) => ProbeItem | undefined } } };
        const item = g.game.items.getName(name);
        if (item === undefined) return 'power missing after reload';
        await item.sheet.render({ force: true });
        await globalThis.wh40kE2E.settle(500);
        const shown = document.querySelector<HTMLInputElement>(`#${item.sheet.id} [name="system.prerequisites.text"]`)?.value ?? '<no input>';
        return { stored: item.system.prerequisites.text, shown, sheetId: item.sheet.id };
    }, SHEET_POWER);
}

async function deleteSheetPower(page: Page): Promise<void> {
    await page.evaluate(async (name: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { items: { filter: (fn: (i: { name: string }) => boolean) => Array<{ delete: () => Promise<void> }> } } };
        for (const item of g.game.items.filter((i) => i.name === name)) {
            // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
            await item.delete();
        }
    }, SHEET_POWER);
}

test.describe.serial('psychic power prerequisites are stored and enforced (Tier B, #673)', () => {
    test.setTimeout(scaledMs(240_000));
    test('Smite carries its printed Willpower gate and the dialog checks it', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        const actors: string[] = [];
        try {
            const smite = await smitePrerequisites(page);
            record(
                'smite-loads-printed-prerequisite',
                typeof smite !== 'string' && smite.text === 'Willpower 40' && smite.willpower === 40,
                JSON.stringify(smite),
            );

            const actorId = await createProbeActor(page, { name: 'Prerequisite probe (dh2)', type: 'dh2-character' });
            if (actorId === null) {
                record('willpower-gate-blocks', false, 'actor did not create');
                record('willpower-gate-clears', false, 'actor did not create');
            } else {
                actors.push(actorId);
                const weak = await smiteUnmet(page, actorId, 25, true);
                record('willpower-gate-blocks', typeof weak !== 'string' && weak.unmet.includes(SMITE_GATE), JSON.stringify(weak));
                if (typeof weak !== 'string') {
                    await snap(page, 'psychic-prerequisites-smite-blocked', { selector: `#${weak.appId}`, closeWindows: true, keepWindow: weak.appId });
                }
                const strong = await smiteUnmet(page, actorId, 40, false);
                record('willpower-gate-clears', typeof strong !== 'string' && !strong.unmet.includes(SMITE_GATE), JSON.stringify(strong));
            }

            const sheet = await sheetRoundTrip(page);
            record('sheet-keeps-prerequisites', typeof sheet !== 'string' && sheet.stored === TYPED && sheet.shown === TYPED, JSON.stringify(sheet));
            if (typeof sheet !== 'string') {
                await snap(page, 'psychic-prerequisites-sheet', { selector: `#${sheet.sheetId}`, closeWindows: true, keepWindow: sheet.sheetId });
            }
        } finally {
            await deleteProbeActors(page, actors);
            await deleteSheetPower(page);
        }
        assertFlowResults({ results }, PSYCHIC_PREREQUISITE_FLOWS, { dimension: 'psychic-prerequisites.flow', label: 'psychic prerequisites' });
    });
});
