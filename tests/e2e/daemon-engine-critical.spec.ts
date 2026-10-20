import { awaitCard, cardHtml, messageIds, restoreSettings, setWorldSettings, snapCard } from './combat-resolution-flow';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — a Black Crusade Daemon Engine reads its Critical damage on the Daemon
 * Engine Critical Hit Chart (#678): "Daemon Engines suffer Damage like all other
 * types of creatures but have their own special rules for Critical Damage" (BC
 * Tome of Decay p. 96; the Tomes of Fate, Excess and Blood print the same chart).
 * The Daemon Engine trait names the chart (`criticalChart: daemon-engine`) and
 * the chart's roll tables carry the matching flag.
 *
 * A BC daemon engine with 5 wounds takes an autocannon hit of 27 + 8; what passes
 * its wounds is Critical damage past the chart's last row, 10: Daemon Unbound!
 */

const AUTOCANNON = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.l7M8n9O0p1Q2r3S4';
const DAEMON_ENGINE = 'Compendium.wh40k-rpg.bc-core-items-traits.Item.daa6cb2b520ede6f';

test.describe.serial('BC Daemon Engine critical chart (Tier B, #678)', () => {
    test.setTimeout(scaledMs(180_000));

    test('a Daemon Engine takes its Critical damage on the Daemon Engine Critical Hit Chart', async ({ page }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        try {
            const scene: HarnessScene = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.setup({ width: 1000, height: 1000, tokens }),
                [
                    {
                        key: 'Defiler',
                        name: 'Bound Defiler',
                        type: 'bc-npc',
                        x: 400,
                        y: 300,
                        system: { gameSystem: 'bc', wounds: { max: 5, value: 5, critical: 0 }, characteristics: { toughness: { base: 30 } } },
                        items: [{ name: 'Daemon Engine (5)', type: 'trait', _stats: { compendiumSource: DAEMON_ENGINE }, system: { specialization: '5' } }],
                    },
                    {
                        key: 'Gunner',
                        name: 'Heretek Gunner',
                        type: 'dh2-character',
                        x: 400,
                        y: 800,
                        items: [leanWeapon('Autocannon', AUTOCANNON, 24)],
                        system: { gameSystem: 'dh2', characteristics: { ballisticSkill: { base: 60 } } },
                    },
                ],
            );
            // The lean trait joins its compendium body, which names the chart; the line's packs carry it.
            const joined = await page.evaluate(async (tokenId) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry `canvas` / `game`, no repo types available in page.evaluate
                const g = globalThis as unknown as {
                    canvas: {
                        tokens: { get: (i: string) => { actor: { items: Array<{ type: string; system: { criticalChart?: string } }> } | null } | undefined };
                    };
                    game: {
                        packs: Iterable<{
                            collection: string;
                            metadata: { type: string };
                            getIndex: (o: object) => Promise<Iterable<{ flags?: { 'wh40k-rpg'?: { criticalChart?: string } } }>>;
                        }>;
                    };
                };
                const trait = [...(g.canvas.tokens.get(tokenId)?.actor?.items ?? [])].find((item) => item.type === 'trait');
                const charts: string[] = [];
                for (const pack of g.game.packs) {
                    if (pack.metadata.type !== 'RollTable' || !pack.collection.includes('bc-')) continue;
                    // eslint-disable-next-line no-await-in-loop -- a few BC packs, read in turn
                    const index = await pack.getIndex({ fields: ['flags.wh40k-rpg.criticalChart'] });
                    for (const row of index) if (row.flags?.['wh40k-rpg']?.criticalChart === 'daemon-engine') charts.push(pack.collection);
                }
                return { criticalChart: trait?.system.criticalChart ?? '', charts };
            }, scene.tokens['Defiler'] ?? '');
            expect(joined.criticalChart, 'the Daemon Engine trait names its chart').toBe('daemon-engine');
            expect(joined.charts.length, 'the BC packs carry the flagged chart').toBeGreaterThan(0);
            const attack = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                firer: scene.tokens['Gunner'] ?? '',
                target: scene.tokens['Defiler'] ?? '',
                weaponName: 'Autocannon',
                faces: [[12, 100]] as Array<[number, number]>,
            });
            const attackCard = await (async (): Promise<string> => {
                for (const id of attack.messageIds) {
                    // eslint-disable-next-line no-await-in-loop -- a handful of cards, read in posting order
                    if ((await cardHtml(page, id)).includes('roll-control__roll-damage')) return id;
                }
                throw new Error(`no attack card; notices ${attack.notices.join(' | ')}`);
            })();
            const before = await messageIds(page);
            const posted = await page.evaluate(
                async (id) =>
                    globalThis.wh40kAttack.clickInMessage({
                        messageId: id,
                        buttonSelector: '.roll-control__roll-damage',
                        faces: [
                            [9, 10],
                            [9, 10],
                            [9, 10],
                        ],
                        expectMessages: 2,
                    }),
                attackCard,
            );
            const cards = await Promise.all(posted.map(async (id) => ({ id, html: await cardHtml(page, id) })));
            const text = cards.map((card) => card.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).join(' | ');
            expect(text, 'the critical row comes from the Daemon Engine chart').toContain('Daemon Unbound');
            const assign = await awaitCard(page, before, 'Daemon Unbound');
            expect(await snapCard(page, 'daemon-engine-critical-chart', assign.id)).not.toBeNull();
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
        }
    });
});
