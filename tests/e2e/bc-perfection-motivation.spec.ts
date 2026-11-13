import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of a characteristic choice reaching the character (#729):
 * the Black Crusade Perfection motivation, "+5 to any one Characteristic, -3 to
 * any two other Characteristics". Its options carried no value, so the pick
 * changed nothing; now each option grants its characteristic value.
 *
 * The motivation document is read from the private BC compendium and created as
 * a world item with the three picks stored, as the choice dialog stores them.
 * Its derived `activeModifiers` must carry +5 and -3 -3, and the Origin Path
 * Builder's commit sum (`_collectOriginCharacteristicBonuses`) must apply them.
 *
 * Each flow records under `bc-perfection.flow`. Keys MUST match
 * BC_PERFECTION_FLOWS in scripts/e2e-coverage.mjs.
 */

const BC_PERFECTION_FLOWS = ['picks-become-modifiers', 'builder-applies-picks'] as const;
type FlowName = (typeof BC_PERFECTION_FLOWS)[number];

const PERFECTION_UUID = 'Compendium.wh40k-rpg.bc-core-origins-motivations.Item.421f4ccc90bc7b62';
const BUILDER_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';
const PLUS = 'Choose one Characteristic to gain +5';
const MINUS = 'Choose two Characteristics to suffer -3';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ActiveModifierLike {
    type: string;
    key: string;
    value: number | null;
}

interface OriginItemLike {
    id: string;
    system: { activeModifiers: ActiveModifierLike[] };
    delete: () => Promise<void>;
}

interface BuilderLike {
    selections: Map<string, { system: object }>;
    _collectOriginCharacteristicBonuses: () => Record<string, number>;
}

async function probePerfection(page: Page): Promise<FlowResult[]> {
    return page.evaluate(
        async ({ uuid, builderUrl, plus, minus }): Promise<FlowResult[]> => {
            const out: FlowResult[] = [];
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Item: { create: (data: object) => Promise<OriginItemLike | null> };
                Actor: { create: (data: object) => Promise<{ delete: () => Promise<void> } | null> };
                fromUuid: (u: string) => Promise<{ toObject: () => { name: string; type: string; system: { selectedChoices: object } } } | null>;
            };
            const trash: Array<{ delete: () => Promise<void> }> = [];
            try {
                const source = await g.fromUuid(uuid);
                if (source === null) {
                    out.push({ name: 'picks-become-modifiers', ok: false, detail: 'Perfection not found in the compendium' });
                    return out;
                }
                const data = source.toObject();
                data.system.selectedChoices = { [plus]: ['Strength'], [minus]: ['Agility', 'Fellowship'] };
                const item = await g.Item.create(data);
                if (item === null) {
                    out.push({ name: 'picks-become-modifiers', ok: false, detail: 'Item.create returned null' });
                    return out;
                }
                trash.push(item);
                const mods = item.system.activeModifiers.filter((m) => m.type === 'characteristic');
                const summary = mods.map((m) => `${m.key} ${m.value}`).sort();
                const expected = ['agility -3', 'fellowship -3', 'strength 5'];
                const picksOk = JSON.stringify(summary) === JSON.stringify(expected);
                out.push({ name: 'picks-become-modifiers', ok: picksOk, detail: picksOk ? null : `characteristic modifiers: ${summary.join(', ') || 'none'}` });

                const actor = await g.Actor.create({ name: 'e2e-729-perfection', type: 'bc-character' });
                if (actor === null) {
                    out.push({ name: 'builder-applies-picks', ok: false, detail: 'Actor.create returned null' });
                    return out;
                }
                trash.push(actor);
                const mod = (await import(/* @vite-ignore */ builderUrl)) as { default: new (a: object) => BuilderLike };
                const builder = new mod.default(actor);
                builder.selections.set('motivation', { system: { activeModifiers: item.system.activeModifiers, modifiers: { characteristics: {} } } });
                const sums = builder._collectOriginCharacteristicBonuses();
                const sumsOk = sums['strength'] === 5 && sums['agility'] === -3 && sums['fellowship'] === -3;
                out.push({ name: 'builder-applies-picks', ok: sumsOk, detail: sumsOk ? null : `builder sums: ${JSON.stringify(sums)}` });
            } catch (err) {
                out.push({ name: 'picks-become-modifiers', ok: false, detail: err instanceof Error ? err.message : String(err) });
            } finally {
                for (const doc of trash) {
                    // eslint-disable-next-line no-await-in-loop -- serial cleanup; parallel deletes race on Foundry's collection writes
                    await doc.delete().catch(() => undefined);
                }
            }
            return out;
        },
        { uuid: PERFECTION_UUID, builderUrl: BUILDER_URL, plus: PLUS, minus: MINUS },
    );
}

test.describe.serial('a Black Crusade characteristic choice reaches the character (Tier B, #729)', () => {
    test.setTimeout(scaledMs(120_000));
    test("Perfection's +5 and two -3 picks become characteristic modifiers the builder applies", async ({ page }) => {
        await joinOrSkip(page);
        const results = await probePerfection(page);
        const fired = new Map(results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of BC_PERFECTION_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('bc-perfection.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
