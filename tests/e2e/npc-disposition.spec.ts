import type { Page } from '@playwright/test';
import { type HarnessScene, installAttackHarness } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * NPC Disposition on DH2 (#73) against live Foundry.
 *
 * A DH2 NPC stored before #73 (Disposition 2 on the old −3..+3 field, no scale
 * marker) loads at 70 on the 0–100 scale. Its sheet shows the 0–100 value and its
 * Personality; the Disposition test is a d100 against the value through the roll
 * dialog; and an acolyte's Charm against it carries the Personality's Charm
 * modifier and moves the Disposition by the Personality's effect per degree.
 */

const PERSONALITY = {
    name: 'Aggressive',
    zeroDisposition: 'Lashes out at the Acolytes.',
    skills: {
        charm: { modifier: -20, effect: '5', basis: 'dos' },
        command: { modifier: 0, effect: '5', basis: 'dof' },
        deceive: { modifier: 10, effect: '10', basis: 'dos' },
        inquiry: { modifier: 10, effect: '-10', basis: 'dof' },
        intimidate: { modifier: -10, effect: '5', basis: 'dof' },
        scrutiny: { modifier: 20, effect: '', basis: '' },
    },
};

const TOKENS = [
    { key: 'envoy', name: 'Envoy', type: 'dh2-character', x: 200, y: 300, system: { characteristics: { fellowship: { base: 60 } } } },
    {
        key: 'informant',
        name: 'Informant',
        type: 'dh2-npc',
        x: 500,
        y: 300,
        // A pre-#73 record: the old −3..+3 field with no scale marker.
        system: { characteristics: { willpower: { base: 30 } }, disposition: { value: 2, personality: PERSONALITY } },
    },
];

/**
 * The NPC's stored and prepared Disposition: the world actor's, or (with
 * `tokenId`) the placed token's actor, which a targeted social test writes to.
 */
async function npcDisposition(page: Page, actorId: string, tokenId?: string): Promise<{ stored: { value: number; scale: string }; value: number }> {
    return page.evaluate(
        ({ id, token }) => {
            interface DispositionActor {
                _source: { system: { disposition: { value: number; scale: string } } };
                system: { disposition: { value: number } };
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => DispositionActor | undefined } };
                canvas: { tokens: { get: (i: string) => { actor: DispositionActor | null } | undefined } };
            };
            const actor = token === undefined ? g.game.actors.get(id) : g.canvas.tokens.get(token)?.actor ?? undefined;
            if (actor === undefined) throw new Error('NPC missing');
            return { stored: { ...actor._source.system.disposition }, value: actor.system.disposition.value };
        },
        { id: actorId, token: tokenId },
    );
}

/**
 * Roll the open roll dialog whose roll key is `rollKey` through its own system roll,
 * feeding Foundry's dice `faces` in order (later draws roll the middle face).
 * Returns the chat messages it posted.
 */
async function rollDialog(page: Page, rollKey: string, faces: Array<[number, number]>): Promise<string[]> {
    return page.evaluate(
        async ({ key, queue }) => {
            interface DialogLike {
                rendered: boolean;
                actionData?: { rollData?: { rollKey?: string } };
                _systemRoll: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                game: { messages: { contents: Array<{ id: string }> } };
                CONFIG: { Dice: { randomUniform: () => number } };
                foundry: { applications: { instances: Map<string, object> } };
            };
            const { pollUntil, withTimeout, scaledMs: scale } = globalThis.wh40kE2E;
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            const mod = (await import(/* @vite-ignore */ modUrl)) as {
                default: abstract new (...a: never[]) => object;
            };
            const findDialog = (): DialogLike | null => {
                for (const app of g.foundry.applications.instances.values()) {
                    if (app instanceof mod.default && (app as DialogLike).actionData?.rollData?.rollKey === key) return app as DialogLike;
                }
                return null;
            };
            if (!(await pollUntil(() => findDialog()?.rendered === true, scale(15_000)))) throw new Error(`no roll dialog for ${key}`);
            const dialog = findDialog();
            if (dialog === null) throw new Error(`no roll dialog for ${key}`);
            const before = new Set(g.game.messages.contents.map((m) => m.id));
            const dice = g.CONFIG.Dice;
            const original = dice.randomUniform;
            const seeded = queue.map(([face, count]) => 1 - (face - 0.5) / count);
            dice.randomUniform = (): number => seeded.shift() ?? 0.5;
            try {
                await withTimeout(dialog._systemRoll(), `roll ${key}`, scale(30_000));
            } finally {
                dice.randomUniform = original;
            }
            await pollUntil(() => g.game.messages.contents.some((m) => !before.has(m.id)), scale(10_000));
            return g.game.messages.contents.map((m) => m.id).filter((id) => !before.has(id));
        },
        { key: rollKey, queue: faces },
    );
}

test.describe.serial('NPC Disposition on DH2 (Tier B, #73)', () => {
    test.setTimeout(scaledMs(240_000));

    test('a pre-#73 NPC loads on the 0–100 scale, is tested with a d100, and a Charm moves it by its Personality', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        try {
            const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 900, height: 700, tokens }), TOKENS);
            const npcId = scene.actors['informant'] ?? '';
            const envoyId = scene.actors['envoy'] ?? '';
            const npcTokenId = scene.tokens['informant'] ?? '';

            // Migration: the old +2 becomes 70, and the record is stamped.
            const migrated = await npcDisposition(page, npcId);
            expect(migrated.stored).toMatchObject({ value: 70, scale: 'characteristic' });

            // The panel shows the 0–100 value and the Personality.
            const sheetId = await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as {
                    game: {
                        actors: {
                            get: (i: string) =>
                                | {
                                      sheet: {
                                          id: string;
                                          rendered: boolean;
                                          render: (o: object) => Promise<object>;
                                          changeTab: (t: string, g: string) => void;
                                      };
                                  }
                                | undefined;
                        };
                    };
                };
                const sheet = g.game.actors.get(id)?.sheet;
                if (sheet === undefined) throw new Error('NPC sheet missing');
                await sheet.render({ force: true });
                await globalThis.wh40kE2E.waitFor(() => sheet.rendered, 'NPC sheet rendered');
                sheet.changeTab('npc', 'primary');
                return sheet.id;
            }, npcId);
            const panel = page.locator(`#${sheetId} [data-wh40k-hook="npc-disposition-panel"]`);
            await panel.scrollIntoViewIfNeeded();
            await expect(panel).toHaveAttribute('data-disposition-model', 'characteristic');
            const value = panel.locator('input[name="system.disposition.value"]');
            await expect(value).toHaveValue('70');
            await expect(value).toHaveAttribute('max', '100');
            await expect(panel.locator('input[name="system.disposition.personality.skills.charm.modifier"]')).toHaveValue('-20');
            await snap(page, 'npc-disposition-panel-dh2-0-100', { selector: `#${sheetId} [data-wh40k-hook="npc-disposition-panel"]` });

            // The Disposition test: a d100 against 70 through the roll dialog.
            await panel.locator('[data-action="rollDisposition"]').click();
            const testMessages = await rollDialog(page, 'disposition', [[35, 100]]);
            expect(testMessages.length).toBeGreaterThan(0);
            const testCard = await popOutChatMessage(page, testMessages.at(-1) ?? '');
            await expect(page.locator(testCard)).toContainText('Disposition');
            await expect(page.locator(testCard)).toContainText('70');
            await snap(page, 'npc-disposition-test-card', { selector: testCard });

            // A Charm against the NPC: the Personality's −20 is on the test, and a win moves
            // the Disposition +5 per degree of success.
            await page.evaluate(
                async ({ tokenId, actorId }) => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                    const g = globalThis as unknown as {
                        canvas: { tokens: { get: (i: string) => { setTarget: (t: boolean, o: object) => void } | undefined } };
                        game: { actors: { get: (i: string) => { rollSkill: (k: string) => Promise<void> } | undefined } };
                        foundry: { applications: { instances: Map<string, { close?: () => Promise<void> }> } };
                    };
                    for (const app of g.foundry.applications.instances.values()) await app.close?.();
                    g.canvas.tokens.get(tokenId)?.setTarget(true, { releaseOthers: true, groupSelection: false });
                    await g.game.actors.get(actorId)?.rollSkill('charm');
                },
                { tokenId: npcTokenId, actorId: envoyId },
            );
            const charmDialog = page.locator('.application:has([data-action="selectSkillUse"][data-use-id="social"])');
            await charmDialog.locator('[data-action="selectSkillUse"][data-use-id="social"]').click();
            await expect(charmDialog).toContainText('Personality');
            // The acolyte rolls 05; the Informant's opposing Willpower rolls 95.
            const charmMessages = await rollDialog(page, 'charm', [
                [5, 100],
                [95, 100],
            ]);
            const charmCard = await popOutChatMessage(page, charmMessages.at(-1) ?? '');
            const charmText = (await page.locator(charmCard).textContent()) ?? '';
            // The target is the placed (unlinked) token's actor, so the shift lands there.
            const after = await npcDisposition(page, npcId, npcTokenId);
            expect(after.stored.scale).toBe('characteristic');
            expect(after.value, `Charm card: ${charmText.replace(/\s+/g, ' ')}`).toBeGreaterThan(70);
            expect((after.value - 70) % 5).toBe(0);
            await expect(page.locator(charmCard)).toContainText('Personality');
            await expect(page.locator(charmCard)).toContainText(`Disposition 70 → ${after.value}`);
            // #671: the social use is labelled as the skill, so the title names Charm once.
            expect(charmText).not.toMatch(/charm:\s*charm/i);
            await snap(page, 'npc-disposition-charm-card', { selector: charmCard });
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
    });
});
