import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: an origin's starting kit arrives whole (content#40).
 *
 * The DH2 Adepta Sororitas background grants a chainblade, armoured bodyglove,
 * chrono, dataslate, stablight and micro-bead by name. DH2 prints the light as
 * "Glow-globe/Stablight", so the kit's "Stablight" matched nothing and the
 * character came up one piece short. The builder's equipment step is driven
 * against a real dh2-character with that background selected.
 *
 * Each flow records under `origin-kit.flow`. Keys MUST match ORIGIN_KIT_FLOWS
 * in scripts/e2e-coverage.mjs.
 */

const ORIGIN_KIT_FLOWS = ['sororitas-kit-complete', 'slash-named-item-granted'] as const;
type FlowName = (typeof ORIGIN_KIT_FLOWS)[number];

const SORORITAS = { line: 'dh2', documentName: 'Item', type: 'originPath', name: 'Adepta Sororitas' };
const BUILDER_URL = '/systems/wh40k-rpg/module/applications/character-creation/origin-path-builder.js';
/** The kit as the background names it, and the item each grant must become. */
const KIT: ReadonlyArray<readonly [grant: string, item: RegExp]> = [
    ['Chainblade', /^chainblade$/iu],
    ['Armoured Bodyglove', /^armou?red bodyglove$/iu],
    ['Chrono', /^chrono$/iu],
    ['Dataslate', /^data-?slate$/iu],
    ['Stablight', /^glow-globe\/stablight$/iu],
    ['Micro-bead', /^micro-bead$/iu],
];

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

/** Select the background on a builder for `actorId` and run its equipment step; the owned item names after. */
async function grantKit(page: Page, actorId: string): Promise<string[]> {
    return page.evaluate(
        async ({ ref, builderUrl, id }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                fromUuid: (uuid: string) => Promise<{ toObject: () => { system: object } } | null>;
                game: { actors: { get: (i: string) => { items: { contents: Array<{ name: string }> } } | undefined } };
            };
            const actor = g.game.actors.get(id);
            const background = await g.fromUuid(await globalThis.wh40kE2E.compendiumUuid(ref));
            if (actor === undefined || background === null)
                throw new Error(`actor ${actor === undefined ? 'missing' : 'found'}, background ${background === null ? 'missing' : 'found'}`);
            interface Builder {
                selections: Map<string, { system: object }>;
                _applyEquipmentGrantsFromOrigins: () => Promise<void>;
            }
            const mod = (await import(/* @vite-ignore */ builderUrl)) as { default: new (a: object) => Builder };
            const builder = new mod.default(actor);
            builder.selections.set('background', { system: background.toObject().system });
            await builder._applyEquipmentGrantsFromOrigins();
            return actor.items.contents.map((item) => item.name);
        },
        { ref: SORORITAS, builderUrl: BUILDER_URL, id: actorId },
    );
}

test.describe.serial('origin starting kits (Tier B, content#40)', () => {
    test.setTimeout(scaledMs(180_000));
    test('the Adepta Sororitas kit arrives whole, its Stablight included', async ({ page }) => {
        await joinOrSkip(page);
        const results: FlowResult[] = [];
        const actors: string[] = [];
        try {
            const actorId = await createProbeActor(page, { name: 'e2e-content40-sororitas', type: 'dh2-character', system: { gameSystem: 'dh2' } });
            if (actorId === null) throw new Error('probe actor was not created');
            actors.push(actorId);
            const names = await grantKit(page, actorId);
            const missing = KIT.filter(([, item]) => !names.some((name) => item.test(name))).map(([grant]) => grant);
            results.push({ name: 'sororitas-kit-complete', ok: missing.length === 0, detail: `missing ${missing.join(', ')}; owned: ${names.join(', ')}` });
            const light = names.some((name) => /^glow-globe\/stablight$/iu.test(name));
            results.push({ name: 'slash-named-item-granted', ok: light, detail: `no Glow-Globe/Stablight; owned: ${names.join(', ')}` });

            const sheet = await openProbeSheet(page, actorId, { tab: 'equipment' });
            if (sheet !== null)
                await snap(page, 'origin-kit-sororitas-equipment', { selector: `#${sheet.appId}`, closeWindows: true, keepWindow: sheet.appId });
        } finally {
            await deleteProbeActors(page, actors);
        }

        const failures: string[] = [];
        for (const flow of ORIGIN_KIT_FLOWS) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('origin-kit.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
