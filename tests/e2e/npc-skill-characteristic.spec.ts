import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the NPC skill row's characteristic (#725,
 * NPCData#skillRowCharacteristic, resolveSkillCharacteristic).
 *
 * A stat block or a hand-made NPC can store a skill with a blank characteristic.
 * The sheet's label, the row's target and the model's roll target each used to
 * fill that blank their own way, so a row could name one characteristic and roll
 * on another. They now read one resolution: the stored characteristic when the
 * NPC has one, the catalog's otherwise.
 *
 * A DH2 NPC with Agility 45 and Perception 25 stores Dodge with a blank
 * characteristic and Stealth with Perception. Its Skills tab is captured: the
 * Dodge row reads its catalog characteristic and shows that characteristic's
 * total; the Stealth row keeps its stored one.
 *
 * Each flow records under `npc-skill-characteristic.flow`. Keys MUST match
 * NPC_SKILL_CHARACTERISTIC_FLOWS in scripts/e2e-coverage.mjs.
 */

const NPC_SKILL_CHARACTERISTIC_FLOWS = ['blank-skill-labelled-from-catalog', 'blank-skill-target-on-its-label', 'stored-characteristic-wins'] as const;
type FlowName = (typeof NPC_SKILL_CHARACTERISTIC_FLOWS)[number];

const NPC_NAME = 'e2e-725-skill-characteristic';
/** Rank 1 (Known): the target is the characteristic total with no training bonus. */
const KNOWN = { advance: 1, trained: true, plus10: false, plus20: false, plus30: false, bonus: 0 };
const NPC_SYSTEM = {
    characteristics: { agility: { base: 45 }, perception: { base: 25 } },
    trainedSkills: {
        dodge: { name: 'Dodge', characteristic: '', ...KNOWN },
        stealth: { name: 'Stealth', characteristic: 'perception', ...KNOWN },
    },
};

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

interface CharacteristicLike {
    total: number;
    short: string;
}

interface StoredSkillLike {
    characteristic: string;
}

interface NpcLike {
    id: string;
    system: {
        characteristics: { agility: CharacteristicLike; perception: CharacteristicLike };
        getSkillTarget: (skillKey: string) => number;
    };
    _source: { system: { trainedSkills: { dodge: StoredSkillLike; stealth: StoredSkillLike } } };
    sheet: { id: string; rendered: boolean; render: (options: { force: boolean }) => Promise<void> };
}

/** What one rendered skill row shows. */
interface RowRead {
    /** The row's characteristic marker (its short name). */
    label: string;
    /** The row's visible name text, which ends in the bracketed characteristic. */
    shown: string;
    /** The target number the row prints. */
    value: number;
}

async function probeSkillRows(page: Page): Promise<ProbeState> {
    return page.evaluate(
        async (args: { name: string; system: typeof NPC_SYSTEM }): Promise<ProbeState> => {
            const out: FlowResult[] = [];
            const record = (name: FlowName, ok: boolean, detail: string | null = null): void => {
                out.push({ name, ok, detail });
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as { Actor: { create: (data: object) => Promise<NpcLike | null> } };
            const { waitFor, scaledMs: scale } = globalThis.wh40kE2E;
            const state: ProbeState = { results: out, actorId: null, sheetId: null };

            const readRow = (root: Element, skillKey: string): RowRead | null => {
                const row = root.querySelector(`[data-skill="${skillKey}"][data-characteristic]`);
                if (row === null) return null;
                const nameButton = row.querySelector('[data-action="viewSkillInfo"]');
                if (nameButton === null) return null;
                const printed = /: (-?\d+)$/.exec(nameButton.getAttribute('aria-label') ?? '');
                return {
                    label: row.getAttribute('data-characteristic') ?? '',
                    shown: nameButton.textContent.replace(/\s+/g, ' ').trim(),
                    value: printed === null ? Number.NaN : Number(printed[1]),
                };
            };

            try {
                const actor = await g.Actor.create({ name: args.name, type: 'dh2-npc', system: args.system });
                if (actor === null) {
                    record('blank-skill-labelled-from-catalog', false, 'Actor.create returned null');
                    return state;
                }
                state.actorId = actor.id;
                const { agility, perception } = actor.system.characteristics;
                if (agility.total === perception.total) {
                    record('blank-skill-labelled-from-catalog', false, `Agility and Perception both total ${agility.total}: the rows cannot be told apart`);
                    return state;
                }

                // The Skills tab is the NPC sheet's default tab.
                await actor.sheet.render({ force: true });
                await waitFor(() => actor.sheet.rendered, 'NPC sheet render', scale(10_000));
                state.sheetId = actor.sheet.id;
                const root = document.getElementById(actor.sheet.id);
                const dodge = root === null ? null : readRow(root, 'dodge');
                const stealth = root === null ? null : readRow(root, 'stealth');
                if (dodge === null || stealth === null) {
                    record('blank-skill-labelled-from-catalog', false, 'the Skills tab has no Dodge or Stealth row');
                    return state;
                }

                // 1. a skill stored with a blank characteristic is labelled from the catalog
                const storedBlank = actor._source.system.trainedSkills.dodge.characteristic === '';
                const labelled = storedBlank && dodge.label === agility.short && dodge.shown.endsWith(`(${agility.short})`);
                record(
                    'blank-skill-labelled-from-catalog',
                    labelled,
                    labelled
                        ? null
                        : `Dodge stored "${actor._source.system.trainedSkills.dodge.characteristic}", row marker "${dodge.label}", text "${dodge.shown}"`,
                );

                // 2. its printed target and its roll target sit on that same characteristic
                const dodgeTarget = actor.system.getSkillTarget('dodge');
                const onLabel = dodge.value === agility.total && dodgeTarget === agility.total;
                record(
                    'blank-skill-target-on-its-label',
                    onLabel,
                    onLabel ? null : `Dodge row prints ${dodge.value}, rolls on ${dodgeTarget}; Agility ${agility.total}, Perception ${perception.total}`,
                );

                // 3. a stored characteristic still wins over the catalog's
                const stealthTarget = actor.system.getSkillTarget('stealth');
                const storedWins =
                    stealth.label === perception.short &&
                    stealth.shown.endsWith(`(${perception.short})`) &&
                    stealth.value === perception.total &&
                    stealthTarget === perception.total;
                record(
                    'stored-characteristic-wins',
                    storedWins,
                    storedWins
                        ? null
                        : `Stealth row marker "${stealth.label}", text "${stealth.shown}", prints ${stealth.value}, rolls on ${stealthTarget}; Perception ${perception.total}`,
                );
            } catch (err) {
                record('blank-skill-labelled-from-catalog', false, err instanceof Error ? err.message : String(err));
            }
            return state;
        },
        { name: NPC_NAME, system: NPC_SYSTEM },
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

test.describe.serial('an NPC skill row labels and rolls one characteristic (Tier B, #725)', () => {
    test.setTimeout(scaledMs(180_000));
    test('a blank stored characteristic reads the catalog one; a stored one wins', async ({ page }) => {
        await joinOrSkip(page);

        let state: ProbeState = { results: [], actorId: null, sheetId: null };
        try {
            state = await probeSkillRows(page);
            if (state.sheetId !== null) {
                await snap(page, 'npc-skill-characteristic-skills-tab', {
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
        for (const flow of NPC_SKILL_CHARACTERISTIC_FLOWS) {
            const result = fired.get(flow);
            if (result?.ok === true) recordCoverage('npc-skill-characteristic.flow', flow);
            else failures.push(`flow ${flow}: ${result?.detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
