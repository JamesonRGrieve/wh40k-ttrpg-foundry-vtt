import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid, packHoldingId } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: a DH1 character gets its career and its home world (content#43, content#44).
 *
 * Reported in play: a DH1 career was empty, and a DH1 home world gave DH2's mechanics.
 * With the DH1 careers' rank tables and the home worlds' DH1 variants authored,
 * a Guardsman's Advancement lists and sells its advances, shows a "+10" advance as
 * one, makes the player pick a path where the career branches (operator ruling
 * 2026-11-15), and a Feral Worlder carries DH1's modifiers and traits.
 *
 * Each flow records under `dh1-career.flow`. Keys MUST match DH1_CAREER_FLOWS in
 * scripts/e2e-coverage.mjs.
 */

/** Each click gets its own limit, so a covered or missing control fails at its step. */
const STEP = { timeout: scaledMs(30_000) };

const DH1_CAREER_FLOWS = [
    'rank1-advances-listed',
    'advance-bought',
    'levelled-advance-shown',
    'rank-from-experience',
    'branch-chosen',
    'gm-override-rank',
    'feral-world-dh1',
] as const;
type FlowName = (typeof DH1_CAREER_FLOWS)[number];

const GUARDSMAN = compendiumUuid({ line: 'dh1', category: 'origins' }, '50246daaaf45cce5');
// The DH1 pack holds Feral World as a reference stub (its file named by the stub's own id);
// the built document takes the shared canonical's id.
const FERAL_WORLD = `Compendium.wh40k-rpg.${packHoldingId({ line: 'dh1', category: 'origins' }, 'd4b1454a0df8ae96')}.Item.DH2FrlWld0000001`;

interface ActorRead {
    awarenessAdvance: number;
    xpUsed: number;
    careerBranches: string[];
}

/**
 * A DH1 character with `total` XP earned and the given origins; returns its id. Its rank
 * follows the XP (Guardsman: Guard at 500, the rank-6 paths at 6,000).
 */
async function dh1Character(page: Page, name: string, total: number, origins: string[]): Promise<string> {
    const id = await createProbeActor(page, { name, type: 'dh1-character', system: { experience: { total } } });
    if (id === null) throw new Error(`no actor ${name}`);
    await page.evaluate(
        async ({ actorId, uuids }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                fromUuid: (u: string) => Promise<{ toObject: () => object } | null>;
                game: { actors: { get: (i: string) => { createEmbeddedDocuments: (t: 'Item', d: object[]) => Promise<object[]> } | undefined } };
            };
            // Each copy names its compendium source, as a drag from the compendium or the
            // builder's commit does: that is what resolves the copy to its owner's line.
            const sources = await Promise.all(uuids.map(async (uuid) => ({ uuid, doc: await g.fromUuid(uuid) })));
            await g.game.actors.get(actorId)?.createEmbeddedDocuments(
                'Item',
                sources.flatMap(({ uuid, doc }) => (doc === null ? [] : [{ ...doc.toObject(), _stats: { compendiumSource: uuid } }])),
            );
        },
        { actorId: id, uuids: origins },
    );
    return id;
}

/** Open the actor's Advancement from its sheet; returns the dialog's element id. */
async function openAdvancement(page: Page, actorId: string): Promise<string> {
    const sheet = await openProbeSheet(page, actorId);
    if (sheet === null) throw new Error('the sheet did not open');
    await page.locator(`#${sheet.appId} [data-action="openAdvancement"]`).first().click(STEP);
    return page.evaluate(async (id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            foundry: { applications: { instances: Map<string, { id: string; actor?: { id: string }; constructor: { name: string } }> } };
        };
        const own = (): { id: string } | undefined =>
            [...g.foundry.applications.instances.values()].find((app) => app.constructor.name === 'AdvancementDialog' && app.actor?.id === id);
        await globalThis.wh40kE2E.waitFor(() => document.getElementById(own()?.id ?? '') !== null, 'advancement dialog', 10_000);
        await globalThis.wh40kE2E.settle(400);
        return own()?.id ?? '';
    }, actorId);
}

/** The listed advances' names on a tab of the dialog, as shown (the span beside each compendium link). */
async function listed(page: Page, appId: string, tab: 'skills' | 'talents'): Promise<string[]> {
    await page.locator(`#${appId} [data-action="switchTab"][data-tab="${tab}"]`).click(STEP);
    await page.waitForTimeout(scaledMs(400));
    return page
        .locator(`#${appId} [data-action="openCompendiumItem"]`)
        .evaluateAll((els) => els.map((el) => (el.previousElementSibling?.textContent ?? '').replace(/\s+/gu, ' ').trim()));
}

async function readActor(page: Page, actorId: string): Promise<ActorRead> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            game: {
                actors: {
                    get: (
                        i: string,
                    ) => { system: { skills: Record<string, { advance?: number }>; experience: { used?: number }; careerBranches?: string[] } } | undefined;
                };
            };
        };
        const system = g.game.actors.get(id)?.system;
        return {
            awarenessAdvance: system?.skills['awareness']?.advance ?? 0,
            xpUsed: system?.experience.used ?? 0,
            careerBranches: system?.careerBranches ?? [],
        };
    }, actorId);
}

test.describe.serial('a DH1 career and home world (Tier B, content#43, content#44)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a Guardsman lists, sells, ranks and branches its advances; a Feral Worlder gets DH1 rules', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail });
        };
        const actors: string[] = [];
        try {
            // Rank 1: the Conscript's skills and talents, and a purchase.
            const recruit = await dh1Character(page, 'e2e-dh1-conscript', 400, [GUARDSMAN]);
            actors.push(recruit);
            let appId = await openAdvancement(page, recruit);
            const skills = await listed(page, appId, 'skills');
            const talents = await listed(page, appId, 'talents');
            const rankOne =
                ['Awareness', 'Swim'].every((name) => skills.some((s) => s.startsWith(name))) && talents.some((t) => t.startsWith('Sound Constitution'));
            record('rank1-advances-listed', rankOne, `skills [${skills.join(', ')}]; talents [${talents.join(', ')}]`);
            await page.locator(`#${appId} [data-action="switchTab"][data-tab="skills"]`).click(STEP);
            await page.waitForTimeout(scaledMs(400));
            // The row holding Awareness's compendium link holds its buy button.
            const row = page.locator(`#${appId} [data-action="openCompendiumItem"][data-name="Awareness"]`).locator('xpath=../..');
            await row.locator('[data-action="purchaseAdvance"]').click(STEP);
            await page.locator('.confirmation-dialog').last().locator('[data-action="confirm"]').click(STEP);
            await expect.poll(async () => (await readActor(page, recruit)).awarenessAdvance).toBe(1);
            const bought = await readActor(page, recruit);
            record('advance-bought', bought.awarenessAdvance === 1 && bought.xpUsed === 100, `awareness ${bought.awarenessAdvance}, xp used ${bought.xpUsed}`);
            await snap(page, 'dh1-guardsman-rank1-advancement', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });

            // Rank 2: a printed "+10" advance shows as one.
            const guard = await dh1Character(page, 'e2e-dh1-guard', 500, [GUARDSMAN]);
            actors.push(guard);
            appId = await openAdvancement(page, guard);
            const rankTwo = await listed(page, appId, 'skills');
            record(
                'levelled-advance-shown',
                rankTwo.some((s) => s === 'Swim +10'),
                `skills [${rankTwo.join(', ')}]`,
            );

            // Rank 6: the career branches; the player picks Scout.
            const veteran = await dh1Character(page, 'e2e-dh1-veteran', 6000, [GUARDSMAN]);
            actors.push(veteran);
            // The sidebar's Rank shows the rank its 6,000 XP reaches, with nothing overridden.
            await openProbeSheet(page, veteran);
            const sidebarRank = await page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game: { actors: { get: (i: string) => { sheet: { id: string } } | undefined } } };
                const input = document.querySelector<HTMLInputElement>(
                    `#${g.game.actors.get(id)?.sheet.id ?? ''} [data-sidebar-field="system.rankOverride"] input`,
                );
                return input === null ? null : { value: input.value, placeholder: input.placeholder, disabled: input.disabled };
            }, veteran);
            record(
                'rank-from-experience',
                sidebarRank !== null && sidebarRank.value === '' && sidebarRank.placeholder === '6' && !sidebarRank.disabled,
                `the sidebar Rank reads ${JSON.stringify(sidebarRank)}`,
            );
            appId = await openAdvancement(page, veteran);
            const picker = page.locator(`#${appId} [data-action="chooseCareerBranch"]`);
            const options = await picker.evaluateAll((els) => els.map((el) => el.textContent.trim()));
            await snap(page, 'dh1-guardsman-branch-picker', { selector: `#${appId}` });
            await picker.filter({ hasText: 'Scout' }).click(STEP);
            await expect.poll(async () => (await readActor(page, veteran)).careerBranches).toEqual(['scout']);
            await expect(page.locator(`#${appId} [data-action="chooseCareerBranch"]`)).toHaveCount(0);
            record(
                'branch-chosen',
                options.join('|') === 'Assault Veteran|Lieutenant|Scout',
                `picker offered [${options.join(', ')}]; branches ${JSON.stringify((await readActor(page, veteran)).careerBranches)}`,
            );
            await page.evaluate(async () => {
                for (const app of globalThis.foundry.applications.instances.values()) await app.close();
            });

            // The GM sets the veteran back to rank 2: the paths and their advances go.
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game: { actors: { get: (i: string) => { update: (d: object) => Promise<object> } | undefined } } };
                await g.game.actors.get(id)?.update({ 'system.rankOverride': 2 });
            }, veteran);
            appId = await openAdvancement(page, veteran);
            const overridden = await listed(page, appId, 'skills');
            const noPicker = (await page.locator(`#${appId} [data-action="chooseCareerBranch"]`).count()) === 0;
            record(
                'gm-override-rank',
                noPicker && overridden.includes('Swim +10') && !overridden.some((name) => name.endsWith('+20')),
                `at rank 2 by override: picker ${noPicker ? 'gone' : 'shown'}; skills [${overridden.join(', ')}]`,
            );
            await page.evaluate(async () => {
                for (const app of globalThis.foundry.applications.instances.values()) await app.close();
            });

            // A Feral Worlder: DH1's modifiers and traits, no Influence, no aptitude.
            const feral = await dh1Character(page, 'e2e-dh1-feral', 0, [FERAL_WORLD]);
            actors.push(feral);
            const world = await page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: {
                        actors: {
                            get: (i: string) =>
                                | {
                                      items: {
                                          contents: Array<{
                                              type: string;
                                              system: {
                                                  modifiers: { characteristics: Record<string, number> };
                                                  grants: { aptitudes: string[]; specialAbilities: Array<{ name: string }> };
                                              };
                                          }>;
                                      };
                                  }
                                | undefined;
                        };
                    };
                };
                const item = g.game.actors.get(id)?.items.contents.find((candidate) => candidate.type === 'originPath');
                return item === undefined
                    ? null
                    : {
                          characteristics: item.system.modifiers.characteristics,
                          aptitudes: item.system.grants.aptitudes,
                          traits: item.system.grants.specialAbilities.map((ability) => ability.name),
                      };
            }, feral);
            const feralOk =
                world !== null &&
                world.characteristics['strength'] === 5 &&
                world.characteristics['willpower'] === -5 &&
                (world.characteristics['influence'] ?? 0) === 0 &&
                world.aptitudes.length === 0 &&
                world.traits.includes('Iron Stomach');
            record('feral-world-dh1', feralOk, `the Feral World reads ${JSON.stringify(world)}`);
        } finally {
            await deleteProbeActors(page, actors);
        }

        const failures: string[] = [];
        for (const flow of DH1_CAREER_FLOWS) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('dh1-career.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
