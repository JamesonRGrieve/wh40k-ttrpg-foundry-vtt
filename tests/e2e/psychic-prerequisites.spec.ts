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
 * (src/module/rules/prerequisites.ts), authored from each book's printed
 * Prerequisite line, and the dialog checks it. DH2 core prints Smite's prerequisite as
 * "Willpower 40" (p. 202).
 *
 * Black Crusade's alignment and Corruption gates (#675): an unaligned, Corruption 0 sorcerer
 * sees Field of Pestilence ("Aligned Nurgle") and Wind of Chaos ("Corruption 30+") blocked;
 * aligned to Nurgle at Corruption 30, neither is.
 *
 * Captures: psychic-prerequisites-smite-blocked (a Willpower 25 character's dialog, Smite's
 * row outlined), psychic-prerequisites-bc-unaligned (Field of Pestilence outlined),
 * psychic-prerequisites-many-gates (Aegis of Euphedros, five unmet gates wrapped below its
 * untruncated name, #676), psychic-prerequisites-available-only (the "Available only" toggle
 * pressed, #696) and psychic-prerequisites-sheet (a power's sheet after a reload).
 *
 * Each flow records under `psychic-prerequisites.flow`. Keys MUST match
 * PSYCHIC_PREREQUISITE_FLOWS in scripts/e2e-coverage.mjs.
 */

const PSYCHIC_PREREQUISITE_FLOWS = [
    'smite-loads-printed-prerequisite',
    'willpower-gate-blocks',
    'willpower-gate-clears',
    'sheet-keeps-prerequisites',
    'bc-alignment-and-corruption-gate',
    'gated-names-not-truncated',
    'available-only-toggle',
    'gate-chips-full-contrast',
    'gate-chips-langpack-labels',
] as const;
type FlowName = (typeof PSYCHIC_PREREQUISITE_FLOWS)[number];

const SMITE_GATE = 'Willpower 40+';
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

/** The unmet prerequisites the Advancement Dialog lists for `power`, after applying `update` to the actor. */
async function powerUnmet(page: Page, actorId: string, update: object, power: string, outline: boolean): Promise<{ appId: string; unmet: string[] } | string> {
    return page.evaluate(
        async (args: { actorId: string; update: object; power: string; outline: boolean }) => {
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
            await actor.update(args.update);
            await globalThis.wh40kE2E.settle(300);
            const url = '/systems/wh40k-rpg/module/applications/dialogs/advancement-dialog.js';
            const mod = (await import(/* @vite-ignore */ url)) as { default: new (a: object) => DialogInst };
            const dialog = new mod.default(actor);
            await dialog.render(true);
            await globalThis.wh40kE2E.settle(300);
            dialog.element?.querySelector<HTMLElement>('[data-action="switchTab"][data-tab="psychic"]')?.click();
            await globalThis.wh40kE2E.settle(800);
            const context = await dialog._prepareContext({});
            const found = (context.psychic?.disciplines ?? []).flatMap((d) => d.items).find((p) => p.name === args.power);
            if (found === undefined) return `${args.power} not listed`;
            if (args.outline) {
                const link = Array.from(dialog.element?.querySelectorAll<HTMLElement>('[data-action="openCompendiumItem"]') ?? []).find(
                    (l) => l.dataset['name'] === args.power,
                );
                const row = link?.closest<HTMLElement>('.tw-rounded-md');
                row?.style.setProperty('outline', '2px dashed #ff00ff');
                row?.scrollIntoView({ block: 'center' });
            }
            return { appId: dialog.id, unmet: found.prereqDisplay };
        },
        { actorId, update, power, outline },
    );
}

/** The psychic power names in the dialog whose text overflows its box (#676). */
async function truncatedNames(page: Page, appId: string): Promise<string[] | string> {
    return page.evaluate((id: string) => {
        const dialog = document.getElementById(id);
        if (dialog === null) return 'dialog not open';
        const names = Array.from(dialog.querySelectorAll<HTMLElement>('[data-action="openCompendiumItem"]'), (link) => link.previousElementSibling);
        return names
            .filter((name): name is HTMLElement => name instanceof HTMLElement && name.scrollWidth > name.clientWidth)
            .map((name) => name.textContent.trim());
    }, appId);
}

/** The gate chips in the dialog drawn below full opacity, counting every faded ancestor (audit at the freeze). */
async function fadedGateChips(page: Page, appId: string): Promise<{ chips: number; faded: string[] } | string> {
    return page.evaluate((id: string) => {
        const dialog = document.getElementById(id);
        if (dialog === null) return 'dialog not open';
        const chips = Array.from(dialog.querySelectorAll<HTMLElement>('.fa-lock + span, .fa-lock ~ span'));
        const faded: string[] = [];
        for (const chip of chips) {
            let opacity = 1;
            for (let node: HTMLElement | null = chip; node !== null && node !== dialog; node = node.parentElement) {
                opacity *= Number(getComputedStyle(node).opacity);
            }
            if (opacity < 1) faded.push(`${chip.textContent.trim()} @ ${opacity.toFixed(2)}`);
        }
        return { chips: chips.length, faded };
    }, appId);
}

/** The gate chips in the dialog that print a raw key instead of a langpack label (#699 audit). */
async function rawKeyChips(page: Page, appId: string): Promise<string[] | string> {
    return page.evaluate((id: string) => {
        const dialog = document.getElementById(id);
        if (dialog === null) return 'dialog not open';
        const chips = Array.from(dialog.querySelectorAll<HTMLElement>('.fa-lock ~ span'), (chip) => chip.textContent.trim());
        // A lowercase word first ("willpower 40+", "aligned nurgle") is a key, not a label.
        return chips.filter((chip) => /^[a-z]/.test(chip));
    }, appId);
}

interface ToggleRead {
    pressed: string | null;
    iconHidden: boolean;
    checked: boolean;
}

/** The "Available only" toggle's state (#696), before and after one click. */
async function availableOnlyClick(page: Page, appId: string): Promise<{ before: ToggleRead; after: ToggleRead } | string> {
    return page.evaluate(async (id: string) => {
        const read = (): ToggleRead | null => {
            const button = document.getElementById(id)?.querySelector<HTMLElement>('[data-action="toggleAvailableOnly"]') ?? null;
            const icon = button?.querySelector('[data-toggle-icon]') ?? null;
            if (button === null || icon === null) return null;
            return {
                pressed: button.getAttribute('aria-pressed'),
                iconHidden: icon.getAttribute('aria-hidden') === 'true',
                checked: icon.classList.contains('fa-check-square'),
            };
        };
        const before = read();
        if (before === null) return 'no Available only toggle';
        document.getElementById(id)?.querySelector<HTMLElement>('[data-action="toggleAvailableOnly"]')?.click();
        await globalThis.wh40kE2E.settle(600);
        const after = read();
        return after === null ? 'toggle gone after the click' : { before, after };
    }, appId);
}

/** Scroll the row of `power` into view and outline it; false when it is not listed. */
async function scrollToRow(page: Page, appId: string, power: string): Promise<boolean> {
    return page.evaluate(
        (args: { id: string; power: string }) => {
            const link = Array.from(document.getElementById(args.id)?.querySelectorAll<HTMLElement>('[data-action="openCompendiumItem"]') ?? []).find(
                (l) => l.dataset['name'] === args.power,
            );
            const row = link?.closest<HTMLElement>('.tw-rounded-md');
            row?.style.setProperty('outline', '2px dashed #ff00ff');
            row?.scrollIntoView({ block: 'center' });
            return row !== undefined && row !== null;
        },
        { id: appId, power },
    );
}

/** A DH2 actor's Willpower set to `value`. */
function willpower(value: number): object {
    return { 'system.characteristics.willpower.base': value, 'system.characteristics.willpower.advance': 0 };
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
                const weak = await powerUnmet(page, actorId, willpower(25), 'Smite', true);
                record('willpower-gate-blocks', typeof weak !== 'string' && weak.unmet.includes(SMITE_GATE), JSON.stringify(weak));
                if (typeof weak !== 'string') {
                    await snap(page, 'psychic-prerequisites-smite-blocked', { selector: `#${weak.appId}`, closeWindows: true, keepWindow: weak.appId });
                }
                const strong = await powerUnmet(page, actorId, willpower(40), 'Smite', false);
                record('willpower-gate-clears', typeof strong !== 'string' && !strong.unmet.includes(SMITE_GATE), JSON.stringify(strong));
            }

            // #675: Black Crusade's alignment and Corruption gates.
            const bcId = await createProbeActor(page, { name: 'Prerequisite probe (bc)', type: 'bc-character' });
            if (bcId === null) {
                record('bc-alignment-and-corruption-gate', false, 'bc actor did not create');
            } else {
                actors.push(bcId);
                const unaligned = { 'system.chaosAlignment': 'unaligned', 'system.corruption': 0 };
                const field = await powerUnmet(page, bcId, unaligned, 'Field of Pestilence', true);
                if (typeof field !== 'string') {
                    await snap(page, 'psychic-prerequisites-bc-unaligned', { selector: `#${field.appId}`, closeWindows: true, keepWindow: field.appId });
                    // #676: many unmet gates wrap below a row's name instead of squeezing it.
                    const clipped = await truncatedNames(page, field.appId);
                    record('gated-names-not-truncated', Array.isArray(clipped) && clipped.length === 0, JSON.stringify(clipped));
                    const aegis = await scrollToRow(page, field.appId, 'Aegis of Euphedros');
                    if (aegis)
                        await snap(page, 'psychic-prerequisites-many-gates', { selector: `#${field.appId}`, closeWindows: true, keepWindow: field.appId });
                    // The gate chips stay at full contrast on a blocked row.
                    const chipRead = await fadedGateChips(page, field.appId);
                    record(
                        'gate-chips-full-contrast',
                        typeof chipRead !== 'string' && chipRead.chips > 0 && chipRead.faded.length === 0,
                        JSON.stringify(chipRead),
                    );
                    // Every chip is worded from the langpack: no raw key ("aligned nurgle", "infamy 70+").
                    const raw = await rawKeyChips(page, field.appId);
                    record('gate-chips-langpack-labels', Array.isArray(raw) && raw.length === 0, JSON.stringify(raw));
                    // #696: "Available only" is one toggle whose state reads as aria-pressed.
                    const toggle = await availableOnlyClick(page, field.appId);
                    record(
                        'available-only-toggle',
                        typeof toggle !== 'string' &&
                            toggle.before.pressed === 'false' &&
                            !toggle.before.checked &&
                            toggle.after.pressed === 'true' &&
                            toggle.after.checked &&
                            toggle.before.iconHidden &&
                            toggle.after.iconHidden,
                        JSON.stringify(toggle),
                    );
                    await snap(page, 'psychic-prerequisites-available-only', { selector: `#${field.appId}`, closeWindows: true, keepWindow: field.appId });
                } else {
                    record('gated-names-not-truncated', false, field);
                    record('available-only-toggle', false, field);
                    record('gate-chips-full-contrast', false, field);
                    record('gate-chips-langpack-labels', false, field);
                }
                const wind = await powerUnmet(page, bcId, unaligned, 'Wind of Chaos', false);
                const nurgle = { 'system.chaosAlignment': 'nurgle', 'system.corruption': 30 };
                const fieldMet = await powerUnmet(page, bcId, nurgle, 'Field of Pestilence', false);
                const windMet = await powerUnmet(page, bcId, nurgle, 'Wind of Chaos', false);
                const reads = [field, wind, fieldMet, windMet].map((read) => (typeof read === 'string' ? null : read.unmet));
                record(
                    'bc-alignment-and-corruption-gate',
                    reads[0]?.includes('Aligned to Nurgle') === true &&
                        reads[1]?.includes('Corruption 30+') === true &&
                        reads[2]?.includes('Aligned to Nurgle') === false &&
                        reads[3]?.includes('Corruption 30+') === false,
                    JSON.stringify({ field, wind, fieldMet, windMet }),
                );
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
