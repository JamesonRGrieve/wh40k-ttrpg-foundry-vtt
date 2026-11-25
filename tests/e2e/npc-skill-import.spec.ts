import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B: an NPC's printed skill line becomes clean skill rows (#726).
 *
 * An NPC whose skills are only printed text ("Command (+20), Linguistics (Int) (Low
 * Gothic)") has them parsed into skill rows when its data loads. Two printed shapes
 * left artefacts in the row's name: an advance-only bracket ("Command (+20)") stored
 * "Command ()", and a characteristic tag before the specialisation stored "(Int)" in
 * the name and lost the characteristic. A DH2 NPC with that line must store and show
 * "Command" at +20 and Linguistics (Low Gothic) on Intelligence.
 *
 * Each flow records under `npc-skill-import.flow`. Keys MUST match
 * NPC_SKILL_IMPORT_FLOWS in scripts/e2e-coverage.mjs.
 */

const NPC_SKILL_IMPORT_FLOWS = [
    'advance-bracket-dropped',
    'characteristic-tag-read',
    'sheet-shows-clean-names',
    'run-on-line-splits',
    'nested-row-lifted',
] as const;
type FlowName = (typeof NPC_SKILL_IMPORT_FLOWS)[number];

const PRINTED = 'Command (+20), Linguistics (Int) (Low Gothic)';

interface StoredSkill {
    name: string;
    characteristic: string;
    advance: number;
    entries?: Array<{ name?: string; specialization?: string }>;
}

test.describe.serial('an NPC printed skill line parses to clean rows (Tier B, #726)', () => {
    test.setTimeout(scaledMs(180_000));
    test('Command (+20) and Linguistics (Int) (Low Gothic) store and show clean names', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [];
        const read = await page.evaluate(async (printed) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: {
                    create: (data: object) => Promise<{
                        id: string;
                        system: { trainedSkills: Record<string, StoredSkill> };
                        sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<void> };
                    } | null>;
                };
            };
            const actor = await g.Actor.create({ name: 'e2e-726-printed-skills', type: 'dh2-npc', system: { skills: printed } });
            if (actor === null) return null;
            await actor.sheet.render({ force: true });
            await globalThis.wh40kE2E.waitFor(() => actor.sheet.rendered, 'NPC sheet render', 10_000);
            await globalThis.wh40kE2E.settle(400);
            const root = document.getElementById(actor.sheet.id);
            const shown = Array.from(root?.querySelectorAll('[data-testid="skill-name"]') ?? [], (el) => el.textContent.trim());
            return { id: actor.id, sheetId: actor.sheet.id, stored: actor.system.trainedSkills, shown };
        }, PRINTED);
        try {
            if (read === null) throw new Error('the NPC was not created');
            const skills = Object.values(read.stored);
            const command = skills.find((skill) => skill.name.startsWith('Command'));
            const linguistics = skills.find((skill) => skill.name.startsWith('Linguistics'));
            results.push({
                name: 'advance-bracket-dropped',
                ok: command?.name === 'Command' && command.advance === 3,
                detail: `Command stored as ${JSON.stringify(command)}`,
            });
            const linguisticsText = JSON.stringify(linguistics);
            results.push({
                name: 'characteristic-tag-read',
                ok: linguistics?.characteristic === 'intelligence' && !linguisticsText.includes('(Int)') && linguisticsText.includes('Low Gothic'),
                detail: `Linguistics stored as ${linguisticsText}`,
            });
            const artefacts = read.shown.filter((name) => name.includes('()') || name.includes('(Int)'));
            results.push({
                name: 'sheet-shows-clean-names',
                ok: read.shown.length > 0 && artefacts.length === 0,
                detail: `the Skills tab shows [${read.shown.join(', ')}]`,
            });
            await snap(page, 'npc-printed-skills-clean', { selector: `#${read.sheetId}`, closeWindows: true, keepWindow: read.sheetId });
        } finally {
            if (read !== null) {
                await page.evaluate(async (id) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                    await g.game.actors.get(id)?.delete();
                }, read.id);
            }
        }

        const failures: string[] = [];
        for (const flow of NPC_SKILL_IMPORT_FLOWS.slice(0, 3)) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('npc-skill-import.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });

    // A printed line the next one ran into ("Tracking. Resistance (Psychic Powers)") put a "."
    // in the stored key; Foundry nested it, the row had no name and the sheet would not open.
    test('a run-on skill line and a row nested under a dotted key both open the sheet', async ({ page }) => {
        await joinOrSkip(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string }> = [];
        const reads = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: {
                    create: (data: object) => Promise<{
                        id: string;
                        system: { trainedSkills: Record<string, StoredSkill> };
                        sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<void> };
                    } | null>;
                };
            };
            const nested = { name: 'Tracking. Resistance (Psychic Powers)', characteristic: 'intelligence', advance: 2, trained: true, plus10: true };
            const specs = [
                { name: 'e2e-runon-printed-skills', system: { skills: 'Awareness, Tracking. Resistance (Psychic Powers), Dodge' } },
                { name: 'e2e-nested-skill-row', system: { trainedSkills: { tracking: { Resistance: nested } } } },
            ];
            const out: Array<{ id: string; sheetId: string; keys: string[]; shown: string[]; error: string | null }> = [];
            for (const spec of specs) {
                const actor = await g.Actor.create({ name: spec.name, type: 'dh2-npc', system: spec.system });
                if (actor === null) continue;
                let error: string | null = null;
                try {
                    await actor.sheet.render({ force: true });
                    await globalThis.wh40kE2E.waitFor(() => actor.sheet.rendered, 'NPC sheet render', 10_000);
                    await globalThis.wh40kE2E.settle(400);
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }
                const root = document.getElementById(actor.sheet.id);
                const shown = Array.from(root?.querySelectorAll('[data-testid="skill-name"]') ?? [], (el) => el.textContent.trim());
                out.push({ id: actor.id, sheetId: actor.sheet.id, keys: Object.keys(actor.system.trainedSkills).sort(), shown, error });
            }
            return out;
        });
        try {
            const runOn = reads.at(0);
            const lifted = reads.at(1);
            const clean = (keys: string[]): boolean => keys.every((key) => /^[A-Za-z0-9]+$/.test(key));
            results.push({
                name: 'run-on-line-splits',
                ok:
                    runOn?.error === null &&
                    clean(runOn.keys) &&
                    runOn.keys.includes('tracking') &&
                    runOn.keys.includes('resistance') &&
                    // A specialist skill shows under its group, its row named by the specialisation.
                    runOn.shown.includes('Psychic Powers'),
                detail: JSON.stringify(runOn),
            });
            results.push({
                name: 'nested-row-lifted',
                ok:
                    lifted?.error === null &&
                    clean(lifted.keys) &&
                    lifted.keys.join() === 'resistance,tracking' &&
                    lifted.shown.some((name) => name.startsWith('Tracking')),
                detail: JSON.stringify(lifted),
            });
            if (lifted !== undefined)
                await snap(page, 'npc-nested-skill-row-lifted', { selector: `#${lifted.sheetId}`, closeWindows: true, keepWindow: lifted.sheetId });
        } finally {
            await page.evaluate(
                async (ids) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<object> } | undefined } } };
                    for (const id of ids) await g.game.actors.get(id)?.delete();
                },
                reads.map((read) => read.id),
            );
        }

        const failures: string[] = [];
        for (const flow of NPC_SKILL_IMPORT_FLOWS.slice(3)) {
            const result = results.find((r) => r.name === flow);
            if (result?.ok === true) recordCoverage('npc-skill-import.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
