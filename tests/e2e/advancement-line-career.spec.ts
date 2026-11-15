import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { createProbeActor, deleteProbeActors, openProbeSheet } from './lib/sheet-probe';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: the Advancement dialog finds a character's career through its own line.
 *
 * It read every line's career through Rogue Trader's names, so a DH1 character with
 * the Guardsman career opened "Guardsman Advancement" onto "No Career Selected" and
 * could buy nothing. A DH1 Guardsman must now be recognised, and an RT career must
 * still list its advances.
 *
 * Each flow records under `advancement-career.flow`. Keys MUST match
 * ADVANCEMENT_CAREER_FLOWS in scripts/e2e-coverage.mjs.
 */

const ADVANCEMENT_CAREER_FLOWS = ['dh1-career-recognised', 'rt-career-advances-listed'] as const;
type FlowName = (typeof ADVANCEMENT_CAREER_FLOWS)[number];

const GUARDSMAN = compendiumUuid({ line: 'dh1', category: 'origins' }, '50246daaaf45cce5');
const EXPLORATOR = compendiumUuid({ line: 'rt', category: 'origins' }, 'NTbFQLfoHWa3xoOs');

interface DialogRead {
    title: string;
    blocked: boolean;
    appId: string;
}

/** Give a new character the career, open Advancement from its sheet, and read the dialog. */
async function openAdvancement(page: Page, type: string, career: string): Promise<{ actorId: string; read: DialogRead & { advances: number } }> {
    const actorId = await createProbeActor(page, { name: `e2e-adv-${type}`, type });
    if (actorId === null) throw new Error(`no ${type} probe actor`);
    await page.evaluate(
        async ({ id, uuid }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                fromUuid: (u: string) => Promise<{ toObject: () => object } | null>;
                game: { actors: { get: (i: string) => { createEmbeddedDocuments: (t: 'Item', d: object[]) => Promise<object[]> } | undefined } };
            };
            const source = await g.fromUuid(uuid);
            if (source === null) throw new Error(`no career ${uuid}`);
            await g.game.actors.get(id)?.createEmbeddedDocuments('Item', [source.toObject()]);
        },
        { id: actorId, uuid: career },
    );
    const sheet = await openProbeSheet(page, actorId);
    if (sheet === null) throw new Error(`the ${type} sheet did not open`);
    await page.locator(`#${sheet.appId} [data-action="openAdvancement"]`).first().click();
    const read = await page.evaluate(async (actorName) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as {
            foundry: { applications: { instances: Map<string, { id: string; title: string; actor?: { name: string }; constructor: { name: string } }> } };
        };
        // This actor's dialog, not one left open for an earlier actor.
        const ownDialog = (): { id: string; title: string } | undefined =>
            [...g.foundry.applications.instances.values()].find(
                (candidate) => candidate.constructor.name === 'AdvancementDialog' && candidate.actor?.name === actorName,
            );
        await globalThis.wh40kE2E.waitFor(() => document.getElementById(ownDialog()?.id ?? '') !== null, 'advancement dialog', 10_000);
        await globalThis.wh40kE2E.settle(400);
        const dialog = ownDialog();
        const root = document.getElementById(dialog?.id ?? '');
        return {
            title: dialog?.title ?? '',
            blocked: root?.querySelector('[data-wh40k-hook="adv__content"]') === null,
            appId: dialog?.id ?? '',
        };
    }, `e2e-adv-${type}`);
    // The career's advances list on the Skills tab.
    const skillsTab = page.locator(`#${read.appId} [data-action="switchTab"][data-tab="skills"]`);
    let advances = 0;
    if (!read.blocked && (await skillsTab.count()) > 0) {
        await skillsTab.first().click();
        await page.waitForTimeout(scaledMs(500));
        // One name link per listed skill advance, whether or not it is affordable yet.
        advances = await page.locator(`#${read.appId} [data-action="openCompendiumItem"][data-type="skill"]`).count();
    }
    return { actorId, read: { ...read, advances } };
}

test.describe.serial('advancement finds the career through its own line (Tier B)', () => {
    test.setTimeout(scaledMs(240_000));
    test('a DH1 Guardsman is recognised and an RT Explorator still lists its advances', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [];
        const actors: string[] = [];
        try {
            const dh1 = await openAdvancement(page, 'dh1-character', GUARDSMAN);
            actors.push(dh1.actorId);
            results.push({
                name: 'dh1-career-recognised',
                ok: !dh1.read.blocked && dh1.read.title.includes('Guardsman'),
                detail: `title "${dh1.read.title}", ${dh1.read.blocked ? 'blocked as no career' : 'open'}`,
            });
            await snap(page, 'advancement-dh1-guardsman', { selector: `#${dh1.read.appId}`, closeWindows: true, keepWindow: dh1.read.appId });

            const rt = await openAdvancement(page, 'rt-character', EXPLORATOR);
            actors.push(rt.actorId);
            results.push({
                name: 'rt-career-advances-listed',
                ok: !rt.read.blocked && rt.read.advances > 0,
                detail: `title "${rt.read.title}", ${rt.read.blocked ? 'blocked' : 'open'}, ${rt.read.advances} advances`,
            });
            await snap(page, 'advancement-rt-explorator', { selector: `#${rt.read.appId}`, closeWindows: true, keepWindow: rt.read.appId });
        } finally {
            await deleteProbeActors(page, actors);
        }

        const failures: string[] = [];
        for (const flow of ADVANCEMENT_CAREER_FLOWS) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('advancement-career.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
