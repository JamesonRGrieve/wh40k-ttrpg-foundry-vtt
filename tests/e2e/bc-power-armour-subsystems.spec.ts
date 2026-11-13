import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of power-armour sub-systems (#730): dropping an armour
 * modification on an armour sheet fits it (ArmourSheet#_onDrop,
 * rules/armour-modifications.ts), Black Crusade power armour holds three
 * sub-systems, Careful Maintenance adds two more, and Enhanced Ceramite Plating
 * raises the Body to AP 10.
 *
 * The compendium Legion Power Armour is created as a world item and its sheet
 * opened on the Mods tab; real compendium sub-systems are dropped on it through
 * the sheet's own drop handler with a real DragEvent.
 *
 * Each flow records under `bc-power-armour.flow`. Keys MUST match
 * BC_POWER_ARMOUR_FLOWS in scripts/e2e-coverage.mjs.
 */

const BC_POWER_ARMOUR_FLOWS = ['three-subsystems-fit', 'fourth-subsystem-refused', 'ceramite-raises-body-ap', 'careful-maintenance-adds-slots'] as const;
type FlowName = (typeof BC_POWER_ARMOUR_FLOWS)[number];

const PACK = 'Compendium.wh40k-rpg.bc-core-items-armor-mods.Item';
const ARMOUR_UUID = 'Compendium.wh40k-rpg.bc-core-items-armour.Item.N3zPRPfbjrBSZvON';
const MODS = {
    ceramite: `${PACK}.fLP7rbh3csSxUrEL`,
    vox: `${PACK}.5R3gkOsvjFScQo0m`,
    autoSenses: `${PACK}.Otb9fKYDjzQTJDFP`,
    boots: `${PACK}.vkOmZ69HhXjvIADl`,
    maintenance: `${PACK}.dz5TesCtsEQt40hp`,
};

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    itemId: string | null;
    sheetId: string | null;
}

interface ArmourItemLike {
    id: string;
    system: {
        modifications: Array<{ name: string; category: string }>;
        subsystemCapacity: number;
        getEffectiveAPForLocation: (location: string) => number;
    };
    sheet: {
        id: string;
        rendered: boolean;
        render: (options: { force: boolean }) => Promise<void>;
        changeTab: (tab: string, group: string) => void;
        _onDrop: (event: DragEvent) => Promise<boolean>;
    };
}

async function probeSubsystems(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async ({ armourUuid, mods }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Item: { create: (data: object) => Promise<ArmourItemLike | null> };
                fromUuid: (u: string) => Promise<{ toObject: () => object } | null>;
            };
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, itemId: null, sheetId: null };
            try {
                const source = await g.fromUuid(armourUuid);
                const armour = source === null ? null : await g.Item.create(source.toObject());
                if (armour === null) {
                    record('three-subsystems-fit', false, 'the Legion Power Armour could not be created from the compendium');
                    return state;
                }
                state.itemId = armour.id;
                await armour.sheet.render({ force: true });
                await waitFor(() => armour.sheet.rendered, 'armour sheet render', scale(10_000));
                armour.sheet.changeTab('mods', 'primary');
                state.sheetId = armour.sheet.id;

                const drop = async (uuid: string): Promise<boolean> => {
                    const transfer = new DataTransfer();
                    transfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid }));
                    return armour.sheet._onDrop(new DragEvent('drop', { dataTransfer: transfer, cancelable: true }));
                };
                const fitted = (): string[] => armour.system.modifications.map((m) => `${m.name}[${m.category}]`);

                // 1. three sub-systems fit
                const results = [await drop(mods.ceramite), await drop(mods.vox), await drop(mods.autoSenses)];
                const three = results.every(Boolean) && armour.system.modifications.filter((m) => m.category === 'subsystem').length === 3;
                record('three-subsystems-fit', three, three ? null : `drops ${results.join('/')}; fitted ${fitted().join(', ')}`);

                // 2. a fourth is refused
                const fourth = await drop(mods.boots);
                const refused = !fourth && armour.system.modifications.length === 3;
                record('fourth-subsystem-refused', refused, refused ? null : `fourth drop ${fourth}; fitted ${fitted().join(', ')}`);

                // 3. Enhanced Ceramite Plating: Body 10, Head stays 8
                const body = armour.system.getEffectiveAPForLocation('body');
                const head = armour.system.getEffectiveAPForLocation('head');
                record('ceramite-raises-body-ap', body === 10 && head === 8, body === 10 && head === 8 ? null : `body ${body}, head ${head}`);

                // 4. Careful Maintenance adds two slots; the boots then fit
                const maintained = await drop(mods.maintenance);
                const capacity = armour.system.subsystemCapacity;
                const bootsFit = await drop(mods.boots);
                const roomy = maintained && capacity === 5 && bootsFit;
                record('careful-maintenance-adds-slots', roomy, roomy ? null : `maintenance ${maintained}, capacity ${capacity}, boots ${bootsFit}`);
                await armour.sheet.render({ force: true });
                armour.sheet.changeTab('mods', 'primary');
            } catch (err) {
                record('three-subsystems-fit', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { armourUuid: ARMOUR_UUID, mods: MODS },
    );
}

async function cleanupProbe(page: Page, itemId: string | null): Promise<void> {
    if (itemId === null) return;
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { items: { get: (i: string) => { delete: () => Promise<void> } | undefined } } };
        await g.game.items
            .get(id)
            ?.delete()
            .catch(() => undefined);
    }, itemId);
}

test.describe.serial('Black Crusade power armour sub-systems (Tier B, #730)', () => {
    test.setTimeout(scaledMs(150_000));
    test('sub-systems dropped on Legion power armour fit, cap at three, and change its AP', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], itemId: null, sheetId: null };
        try {
            state = await probeSubsystems(page);
            if (state.sheetId !== null) {
                await snap(page, 'bc-legion-power-armour-subsystems', { selector: `#${state.sheetId}`, closeWindows: true, keepWindow: state.sheetId });
            }
        } finally {
            await cleanupProbe(page, state.itemId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of BC_POWER_ARMOUR_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('bc-power-armour.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
