import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { CHAT_PANEL_TRANSLUCENT, readChatCardOnDarkTheme } from './lib/chat-dark-theme';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the damage card's chrome (#615,
 * src/templates/chat/damage-roll-chat.hbs).
 *
 * The card's "Damage Roll" overline was literal English, and a two-digit Effective
 * value against a named target wrapped onto two lines. The DH1 Conversion Beamer is
 * fired at a target 5 m away and its damage rolled; the card is captured in a chat
 * popout (the chat sidebar's width), and its overline and Effective value are read.
 * The card is popped out again under the dark theme: its panel washes stay the
 * parchment message's and every line of its text meets WCAG AA there (#698).
 *
 * Grid: 100 px = 1 m. Each flow records under `damage-card-layout.flow`. Keys MUST
 * match DAMAGE_CARD_LAYOUT_FLOWS in scripts/e2e-coverage.mjs.
 */

const DAMAGE_CARD_LAYOUT_FLOWS = ['overline-from-langpack', 'effective-value-one-line', 'card-reads-on-dark-theme'] as const;
type FlowName = (typeof DAMAGE_CARD_LAYOUT_FLOWS)[number];

const CONVERSION_BEAMER = compendiumUuid({ line: 'dh1', category: 'weapons' }, '804d243ba234097d');
const marksman = { characteristics: { ballisticSkill: { base: 60 }, strength: { base: 40 } } };
const TOKENS = [
    { key: 'beamer', name: 'Beamer', type: 'dh1-character', x: 100, y: 100, items: [leanWeapon('Conversion Beamer', CONVERSION_BEAMER, 4)], system: marksman },
    { key: 'near', name: 'Near Target', type: 'dh1-npc', x: 600, y: 100 },
];

interface CardRead {
    overline: string;
    expectedOverline: string;
    effective: string;
    lineBoxes: number;
    heightPx: number;
    fontPx: number;
    insideRow: boolean;
}

/** Read the damage card's overline and Effective value inside the popped-out card. */
async function readCard(page: Page, selector: string): Promise<CardRead | null> {
    return page.evaluate((sel: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as { game: { i18n: { localize: (k: string) => string } } };
        const root = document.querySelector(sel);
        const value = root?.querySelector<HTMLElement>('[data-damage-effective-value]');
        const row = value?.closest<HTMLElement>('[data-damage-effective]');
        const expectedOverline = g.game.i18n.localize('WH40K.Chat.Damage.Overline');
        const overline = Array.from(root?.querySelectorAll<HTMLElement>('div') ?? []).find((el) => el.textContent.trim() === expectedOverline);
        if (root === null || value === undefined || value === null || row === null || row === undefined) return null;
        return {
            overline: overline?.textContent.trim() ?? '',
            expectedOverline,
            effective: value.textContent.trim(),
            lineBoxes: value.getClientRects().length,
            heightPx: value.getBoundingClientRect().height,
            fontPx: Number.parseFloat(getComputedStyle(value).fontSize),
            insideRow: value.getBoundingClientRect().right <= row.getBoundingClientRect().right + 1,
        };
    }, selector);
}

test.describe.serial('damage card chrome (Tier B, #615)', () => {
    test.setTimeout(scaledMs(300_000));
    test('the overline comes from the langpack and a two-digit Effective value stays on one line', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1200, height: 600, tokens }), TOKENS);
            const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['beamer'] ?? '',
                target: scene.tokens['near'] ?? '',
                weaponName: 'Conversion Beamer',
                faces: [[5, 100]] as Array<[number, number]>,
            });
            // The hit card's Roll Damage rolls the near band's 1d10+9: a 6 makes 15 Effective.
            const hitCard = await page.evaluate(async (ids: readonly string[]) => {
                const { pollUntil } = globalThis.wh40kE2E;
                for (const id of ids) {
                    const sel = `#sidebar .chat-log .message[data-message-id="${id}"]`;
                    // eslint-disable-next-line no-await-in-loop -- each card is read once it renders
                    await pollUntil(() => document.querySelector(sel) !== null);
                    if (document.querySelector(`${sel} [data-damage-effective-value]`) !== null) return { id, isDamage: true };
                    if (document.querySelector(`${sel} .roll-control__roll-damage`) !== null) return { id, isDamage: false };
                }
                return null;
            }, attack.messageIds);
            let damageId: string | null = hitCard?.isDamage === true ? hitCard.id : null;
            if (hitCard !== null && !hitCard.isDamage) {
                const posted = await page.evaluate(
                    async (id: string) =>
                        globalThis.wh40kAttack.clickInMessage({
                            messageId: id,
                            buttonSelector: '.roll-control__roll-damage',
                            faces: [[6, 10]],
                            expectMessages: 1,
                        }),
                    hitCard.id,
                );
                damageId = posted.at(-1) ?? null;
            }
            if (damageId === null) throw new Error(`no damage card; attack notices ${attack.notices.join(' | ')}`);
            const selector = await popOutChatMessage(page, damageId);
            const read = await readCard(page, selector);
            record(
                'overline-from-langpack',
                read !== null && read.overline === read.expectedOverline && read.expectedOverline !== 'WH40K.Chat.Damage.Overline',
                `card ${JSON.stringify(read)}`,
            );
            record(
                'effective-value-one-line',
                read !== null && read.effective.length >= 2 && read.lineBoxes === 1 && read.heightPx < read.fontPx * 2 && read.insideRow,
                `card ${JSON.stringify(read)}`,
            );
            await snap(page, 'damage-card-effective-two-digit', { selector });

            // Under the dark theme the card's panels stay the parchment message's, and
            // every line of text reads on them (#698).
            const dark = await readChatCardOnDarkTheme(page, damageId, 'damage-card-dark-theme');
            record(
                'card-reads-on-dark-theme',
                dark.unreadable.length === 0 && dark.panel === CHAT_PANEL_TRANSLUCENT,
                `panel token ${dark.panel}; unreadable ${JSON.stringify(dark.unreadable)}`,
            );
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
        assertFlowResults({ results }, DAMAGE_CARD_LAYOUT_FLOWS, { dimension: 'damage-card-layout.flow', label: 'damage card layout' });
    });
});
