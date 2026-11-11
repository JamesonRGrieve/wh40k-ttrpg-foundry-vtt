import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of an NPC's specialisation rows (#725, NPCData#specialistSkillGroups,
 * NPCData#skillEntryTest, WH40KNPC#rollSkill, NPCData#statBlockSkills).
 *
 * An imported NPC stores its specialisations under `trainedSkills[<skill>].entries`.
 * The sheet fed its specialist panel an empty list, the roll had no entry path and
 * the stat-block export skipped them, so the rows were stored and never shown,
 * rolled or exported.
 *
 * A DH2 NPC with Intelligence 40 stores Common Lore with two specialisations:
 * Imperium at the first rank and Tech at the fourth. Its Skills tab is captured
 * with both rows in view. Each row prints its own name and target and its roll
 * button carries its stored position; the Tech button opens the roll dialog on
 * that entry's target and rank; the text stat block lists both.
 *
 * Each flow records under `npc-specialist-skills.flow`. Keys MUST match
 * NPC_SPECIALIST_SKILLS_FLOWS in scripts/e2e-coverage.mjs.
 */

const NPC_SPECIALIST_SKILLS_FLOWS = [
    'specialisation-rows-listed',
    'row-prints-entry-target',
    'roll-button-carries-position',
    'entry-roll-opens-on-entry-target',
    'stat-block-lists-specialisations',
] as const;
type FlowName = (typeof NPC_SPECIALIST_SKILLS_FLOWS)[number];

const NPC_NAME = 'e2e-725-specialist-skills';
const SKILL_KEY = 'commonLore';
/** The fourth rank adds this much to the characteristic. */
const FOURTH_RANK_BONUS = 30;
const NPC_SYSTEM = {
    characteristics: { intelligence: { base: 40 } },
    trainedSkills: {
        // The skill itself is unranked: only its two specialisations are.
        commonLore: {
            name: 'Common Lore',
            characteristic: '',
            advance: 0,
            trained: false,
            plus10: false,
            plus20: false,
            plus30: false,
            bonus: 0,
            entries: [
                { name: 'Imperium', specialization: 'Imperium', advance: 1 },
                { name: 'Tech', specialization: 'Tech', advance: 4 },
            ],
        },
    },
};
const EXPORTER_URL = '/systems/wh40k-rpg/module/applications/npc/stat-block-exporter.js';
const ROLL_DIALOG_URL = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';

interface FlowResult {
    name: FlowName;
    ok: boolean;
    detail: string | null;
}

interface ProbeState {
    results: FlowResult[];
    actorId: string | null;
    sheetId: string | null;
}

/** What the model resolves for one stored specialisation. */
interface EntryTestLike {
    name: string;
    current: number;
    rank: number;
}

interface NpcLike {
    id: string;
    system: {
        characteristics: { intelligence: { total: number } };
        skillEntryTest: (skillKey: string, speciality: number) => EntryTestLike | undefined;
    };
    sheet: { id: string; rendered: boolean; render: (options: { force: boolean }) => Promise<void> };
}

/** The open roll dialog, as far as this probe reads it. */
interface RollDialogLike {
    rendered: boolean;
    actionData?: { rollData?: { rollKey?: string; baseTarget?: number; skillRank?: number; nameOverride?: string } };
    close: () => Promise<void>;
}

/** What one rendered specialisation row shows. */
interface RowRead {
    name: string;
    /** The target number the row prints. */
    value: number;
    rollType: string | null;
    rollTarget: string | null;
    /** The stored position the roll button sends. */
    specialty: string | null;
}

interface ProbeArgs {
    name: string;
    system: typeof NPC_SYSTEM;
    skillKey: string;
    fourthRankBonus: number;
    exporterUrl: string;
    rollDialogUrl: string;
}

async function probeSpecialisationRows(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async (args: ProbeArgs): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<NpcLike | null> };
                foundry: { applications: { instances: Map<string, object> } };
            };
            const { waitFor, pollUntil, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, actorId: null, sheetId: null };

            const rowElement = (root: Element, index: number): Element | null =>
                root.querySelector(`div[data-skill="${args.skillKey}"][data-index="${index}"]`);
            const readRow = (root: Element, index: number): RowRead | null => {
                const row = rowElement(root, index);
                if (row === null) return null;
                const button = row.querySelector('[data-action="roll"]');
                const printed = row.lastElementChild?.textContent.trim() ?? '';
                return {
                    name: row.querySelector('[data-testid="skill-name"]')?.textContent.trim() ?? '',
                    value: printed === '' ? Number.NaN : Number(printed),
                    rollType: button?.getAttribute('data-roll-type') ?? null,
                    rollTarget: button?.getAttribute('data-roll-target') ?? null,
                    specialty: button?.getAttribute('data-specialty') ?? null,
                };
            };

            try {
                const actor = await g.Actor.create({ name: args.name, type: 'dh2-npc', system: args.system });
                if (actor === null) {
                    record('specialisation-rows-listed', false, 'Actor.create returned null');
                    return state;
                }
                state.actorId = actor.id;
                const intelligence = actor.system.characteristics.intelligence.total;

                // The Skills tab is the NPC sheet's default tab.
                await actor.sheet.render({ force: true });
                await waitFor(() => actor.sheet.rendered, 'NPC sheet render', scale(10_000));
                state.sheetId = actor.sheet.id;
                const root = document.getElementById(actor.sheet.id);
                const imperium = root === null ? null : readRow(root, 0);
                const tech = root === null ? null : readRow(root, 1);
                if (root === null || imperium === null || tech === null) {
                    record('specialisation-rows-listed', false, 'the Skills tab has no Common Lore specialisation rows');
                    return state;
                }

                // 1. each stored specialisation has a row under its skill
                const listed = imperium.name === 'Imperium' && tech.name === 'Tech';
                record('specialisation-rows-listed', listed, listed ? null : `rows read "${imperium.name}" and "${tech.name}"`);

                // 2. each row prints its own target: the characteristic plus what its rank adds
                const imperiumTest = actor.system.skillEntryTest(args.skillKey, 0);
                const techTest = actor.system.skillEntryTest(args.skillKey, 1);
                const printsOwn =
                    imperium.value === intelligence &&
                    tech.value === intelligence + args.fourthRankBonus &&
                    imperiumTest?.current === imperium.value &&
                    techTest?.current === tech.value;
                record(
                    'row-prints-entry-target',
                    printsOwn,
                    printsOwn
                        ? null
                        : `Imperium prints ${imperium.value} (model ${imperiumTest?.current}), Tech prints ${tech.value} (model ${techTest?.current}); Intelligence ${intelligence}`,
                );

                // 3. each roll button names the skill and the row's stored position
                const carries = [imperium, tech].every(
                    (row, index) => row.rollType === 'skill' && row.rollTarget === args.skillKey && row.specialty === String(index),
                );
                record(
                    'roll-button-carries-position',
                    carries,
                    carries
                        ? null
                        : `Imperium button ${imperium.rollType}/${imperium.rollTarget}/${imperium.specialty}, Tech button ${tech.rollType}/${tech.rollTarget}/${tech.specialty}`,
                );

                // 4. the Tech button opens the roll on that entry's target and rank, not the skill's
                const dialogMod = (await import(/* @vite-ignore */ args.rollDialogUrl)) as { default: abstract new (...a: never[]) => object };
                const findDialog = (): RollDialogLike | null => {
                    for (const app of g.foundry.applications.instances.values()) {
                        if (app instanceof dialogMod.default && (app as RollDialogLike).actionData?.rollData?.rollKey === args.skillKey)
                            return app as RollDialogLike;
                    }
                    return null;
                };
                const techRow = rowElement(root, 1);
                techRow?.querySelector<HTMLElement>('[data-action="roll"]')?.click();
                const opened = await pollUntil(() => findDialog()?.rendered === true, scale(15_000));
                const dialog = findDialog();
                const rollData = dialog?.actionData?.rollData;
                const onEntry =
                    opened &&
                    rollData?.baseTarget === tech.value &&
                    techTest?.rank === 4 &&
                    rollData.skillRank === techTest.rank &&
                    (rollData.nameOverride ?? '').includes('Common Lore: Tech');
                record(
                    'entry-roll-opens-on-entry-target',
                    onEntry,
                    onEntry
                        ? null
                        : `dialog opened ${opened}; target ${rollData?.baseTarget} (row ${tech.value}), rank ${rollData?.skillRank} (entry ${techTest?.rank}), title "${rollData?.nameOverride}"`,
                );
                await dialog?.close().catch(() => undefined);

                // 5. the text stat block lists both, the fourth rank with what it adds
                const exporterMod = (await import(/* @vite-ignore */ args.exporterUrl)) as { default?: { toText: (a: NpcLike) => string } };
                const text = exporterMod.default?.toText(actor) ?? '';
                const exported = text.includes('Common Lore (Imperium)') && text.includes(`Common Lore (Tech) +${args.fourthRankBonus}`);
                const skillsLine = text.split('\n').find((line) => line.includes('Common Lore')) ?? '';
                record('stat-block-lists-specialisations', exported, exported ? null : `the stat block's skills read "${skillsLine}"`);

                // Bring the rows into view for the capture.
                techRow?.scrollIntoView({ block: 'center' });
            } catch (err) {
                record('specialisation-rows-listed', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        {
            name: NPC_NAME,
            system: NPC_SYSTEM,
            skillKey: SKILL_KEY,
            fourthRankBonus: FOURTH_RANK_BONUS,
            exporterUrl: EXPORTER_URL,
            rollDialogUrl: ROLL_DIALOG_URL,
        },
    );
}

async function cleanupProbe(page: Page, actorId: string | null): Promise<void> {
    if (actorId === null) return;
    await page.evaluate(async (id: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { actors: { get: (i: string) => { delete: () => Promise<void> } | undefined } } };
        await g.game.actors
            .get(id)
            ?.delete()
            .catch(() => undefined);
    }, actorId);
}

test.describe.serial("an NPC's specialisation rows show, roll and export (Tier B, #725)", () => {
    test.setTimeout(scaledMs(180_000));
    test('each stored specialisation has a row, rolls its own target and prints in the stat block', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, sheetId: null };
        try {
            state = await probeSpecialisationRows(page);
            if (state.sheetId !== null) {
                await snap(page, 'npc-specialist-skills-panel', {
                    selector: `#${state.sheetId}`,
                    closeWindows: true,
                    keepWindow: state.sheetId,
                });
            }
        } finally {
            await cleanupProbe(page, state.actorId);
        }

        const fired = new Map(state.results.map((r) => [r.name, r]));
        const failures: string[] = [];
        for (const flow of NPC_SPECIALIST_SKILLS_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('npc-specialist-skills.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
