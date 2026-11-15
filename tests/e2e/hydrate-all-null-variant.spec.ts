import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: an owned item whose canonical has an all-null line field still joins it.
 *
 * The DH2 Imperial Robes print no maximum Agility, authored as `maxAgility: { dh2: null }`.
 * The variant collapse left that container in place, the field rejected it ("must be a
 * number"), and the in-memory join skipped the whole item: on the live world Tyr Knoch's
 * robes and Shade Lite's bodyglove kept only what their own records stored. A lean copy
 * here must come out of the join with the book's armour.
 *
 * Each flow records under `hydrate-null-variant.flow`. Keys MUST match
 * HYDRATE_NULL_VARIANT_FLOWS in scripts/e2e-coverage.mjs.
 */

const HYDRATE_NULL_VARIANT_FLOWS = ['robes-joined', 'no-skipped-join'] as const;
type FlowName = (typeof HYDRATE_NULL_VARIANT_FLOWS)[number];

const IMPERIAL_ROBES = compendiumUuid({ line: 'dh2', category: 'armour' }, 'KpONRR0TAk2qOmv1');

test.describe.serial('the compendium join with an all-null line field (Tier B)', () => {
    test.setTimeout(scaledMs(180_000));
    test('lean Imperial Robes join their canonical body', async ({ page }) => {
        await joinOrSkip(page);
        const skipped: string[] = [];
        page.on('console', (message) => {
            const text = message.text();
            if (text.includes('compendium-hydrate: skipped item')) skipped.push(text.split('\n')[0] ?? text);
        });
        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [];
        const actors: string[] = [];
        try {
            const actorId = await createProbeActor(page, {
                name: 'e2e-hydrate-null-variant',
                type: 'dh2-character',
                items: [{ name: 'Imperial Robes', type: 'armour', _stats: { compendiumSource: IMPERIAL_ROBES }, system: {} }],
            });
            if (actorId === null) throw new Error('probe actor was not created');
            actors.push(actorId);
            // Rendering the sheet runs the join.
            const sheet = await openProbeSheet(page, actorId, { tab: 'equipment' });
            const robes = await page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: {
                        actors: {
                            get: (
                                i: string,
                            ) =>
                                | { items: { contents: Array<{ name: string; system: { armourPoints: Record<string, number>; maxAgility: number | null } }> } }
                                | undefined;
                        };
                    };
                };
                const item = g.game.actors.get(id)?.items.contents.find((i) => i.name === 'Imperial Robes');
                return item === undefined
                    ? null
                    : { body: item.system.armourPoints['body'], leftArm: item.system.armourPoints['leftArm'], maxAgility: item.system.maxAgility };
            }, actorId);
            const joined = robes !== null && robes.body === 1 && robes.leftArm === 1;
            results.push({ name: 'robes-joined', ok: joined, detail: `the robes read ${JSON.stringify(robes)}` });
            results.push({ name: 'no-skipped-join', ok: skipped.length === 0, detail: skipped.join('; ') });
            if (sheet !== null)
                await snap(page, 'hydrate-null-variant-imperial-robes', { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
        } finally {
            await deleteProbeActors(page, actors);
        }

        const failures: string[] = [];
        for (const flow of HYDRATE_NULL_VARIANT_FLOWS) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('hydrate-null-variant.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
