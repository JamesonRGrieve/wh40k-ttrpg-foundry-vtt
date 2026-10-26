import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { CHAT_PANEL_TRANSLUCENT, readChatCardOnDarkTheme } from './lib/chat-dark-theme';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the area results card's provenance rows (#616,
 * src/module/rules/area-template.ts `areaAvoidanceComponents`).
 *
 * Each Spray avoidance test listed a "Difficulty 0" row: a Challenging (+0) test
 * changes nothing, and the card's statement already names it. The DH2 Hand Flamer
 * sprays two creatures; the results card is resolved with seeded d100s (one hit, one
 * avoided) and captured, and its provenance rows are read.
 *
 * Grid: 100 px = 1 m. Each flow records under `area-difficulty-row.flow`. Keys MUST
 * match AREA_DIFFICULTY_ROW_FLOWS in scripts/e2e-coverage.mjs.
 */

const AREA_DIFFICULTY_ROW_FLOWS = ['no-zero-difficulty-row', 'tests-and-statement-kept', 'results-read-on-dark-theme'] as const;
type FlowName = (typeof AREA_DIFFICULTY_ROW_FLOWS)[number];

const HAND_FLAMER = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.j7K8l9M0n1O2p3Q4';
const agility30 = { characteristics: { agility: { base: 30 } } };
const TOKENS = [
    {
        key: 'firer',
        name: 'Gunner',
        type: 'dh2-character',
        x: 200,
        y: 500,
        items: [leanWeapon('Hand Flamer', HAND_FLAMER, 2)],
        system: { characteristics: { ballisticSkill: { base: 50 } } },
    },
    { key: 'target', name: 'Mark', type: 'dh2-npc', x: 700, y: 500, system: agility30 },
    { key: 'flank', name: 'Flanker', type: 'dh2-npc', x: 900, y: 550, system: agility30 },
];

interface ResultsRead {
    statement: string;
    tests: number;
    rows: Array<{ label: string; value: string }>;
}

/** The id of the first of `ids` whose rendered card has `selector`. */
async function cardWith(page: Page, ids: readonly string[], selector: string): Promise<string | null> {
    return page.evaluate(
        async (args: { ids: readonly string[]; selector: string }) => {
            for (const id of args.ids) {
                const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
                // eslint-disable-next-line no-await-in-loop -- each card is read once it renders
                await globalThis.wh40kE2E.pollUntil(() => document.querySelector(sel) !== null);
                if (document.querySelector(`${sel} ${args.selector}`) !== null) return id;
            }
            return null;
        },
        { ids, selector },
    );
}

async function readResults(page: Page, selector: string): Promise<ResultsRead> {
    return page.evaluate((sel: string) => {
        const card = document.querySelector(sel);
        return {
            statement: card?.querySelector('[data-area-statement]')?.textContent.trim() ?? '',
            tests: card?.querySelectorAll('[data-area-roll]').length ?? 0,
            rows: Array.from(card?.querySelectorAll<HTMLElement>('[data-area-target] [data-wh40k-tooltip="modifier"]') ?? []).map((row) => ({
                label: row.querySelector('span')?.textContent.trim() ?? '',
                value: row.querySelector('span:last-child')?.textContent.trim() ?? '',
            })),
        };
    }, selector);
}

test.describe.serial('area results card provenance rows (Tier B, #616)', () => {
    test.setTimeout(scaledMs(300_000));
    test('a +0 avoidance test lists no "Difficulty 0" row', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1400, height: 1100, tokens }), TOKENS);
            const spray = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['firer'] ?? '',
                target: scene.tokens['target'] ?? '',
                weaponName: 'Hand Flamer',
                faces: [[50, 100]] as Array<[number, number]>,
            });
            const attackCard = await cardWith(page, spray.messageIds, '.roll-control__resolve-area');
            if (attackCard === null) throw new Error(`no spray card with Resolve; notices ${spray.notices.join(' | ')}`);
            const posted = await page.evaluate(
                async (id: string) =>
                    globalThis.wh40kAttack.clickInMessage({
                        messageId: id,
                        buttonSelector: '.roll-control__resolve-area',
                        faces: [
                            [96, 100],
                            [5, 100],
                        ],
                        expectMessages: 1,
                    }),
                attackCard,
            );
            const resultsCard = await cardWith(page, posted, '[data-area-target]');
            if (resultsCard === null) throw new Error('no area results card');
            const selector = await popOutChatMessage(page, resultsCard);
            const read = await readResults(page, selector);
            record(
                'no-zero-difficulty-row',
                read.rows.every((row) => row.value !== '0' && row.value !== '+0'),
                `rows ${JSON.stringify(read.rows)}`,
            );
            record('tests-and-statement-kept', read.tests === 2 && read.statement.includes('(+0)'), `statement "${read.statement}", tests ${read.tests}`);
            await snap(page, 'area-spray-results-no-zero-difficulty', { selector });
            // On the dark theme the results card keeps the parchment's panels, and every line reads (#698).
            const dark = await readChatCardOnDarkTheme(page, resultsCard, 'area-spray-results-dark-theme');
            record(
                'results-read-on-dark-theme',
                dark.unreadable.length === 0 && dark.panel === CHAT_PANEL_TRANSLUCENT,
                `panel token ${dark.panel}; unreadable ${JSON.stringify(dark.unreadable)}`,
            );
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
        assertFlowResults({ results }, AREA_DIFFICULTY_ROW_FLOWS, { dimension: 'area-difficulty-row.flow', label: 'area difficulty row' });
    });
});
