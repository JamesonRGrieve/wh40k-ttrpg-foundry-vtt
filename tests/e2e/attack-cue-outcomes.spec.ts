import type { Page } from '@playwright/test';
import { createPlayer, deleteDocuments, restoreSettings, setWorldSettings } from './combat-resolution-flow';
import { type HarnessScene, installAttackHarness, leanWeapon } from './lib/attack-harness';
import { canvasClip } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { armCueFreeze, awaitCueFreeze, installCueProbe, releaseFreeze } from './lib/cue-probe';
import { joinAsUser, joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B — every attack-cue outcome plays against real tokens, on every client (#594).
 *
 * The GM drives real DH2 attacks and casts through the attack harness, each with
 * seeded dice, so every outcome is fixed. A player joins on a second client and
 * views the same scene. Each cue step a client plays fires the system's
 * `wh40k-rpg.attackCuePlayed` hook. The spec records those on both clients and
 * checks the outcome's events played, drawn on the canvas, on the GM's client and,
 * over the system socket, on the player's.
 *
 * | Outcome | How |
 * |---|---|
 * | fire, hit | a Lasgun hit; and a Semi-Auto Burst spread onto a second creature, whose spread hit is drawn on it when the damage is rolled (#513) |
 * | miss | a Lasgun miss |
 * | critical | the hit's damage rolls a 10 (Righteous Fury) |
 * | dodge | the target Dodges a hit from its evasion prompt |
 * | jam | an Autogun rolls 97 |
 * | overheat | a Plasma Gun rolls 95 |
 * | explode | a Scavenged autogun rolls 00 |
 * | spray | a Hand Flamer |
 * | blast | a Frag Grenade that hits |
 * | scatter | a Frag Grenade that misses |
 * | melee-hit, melee-miss | a Chainsword at the adjacent foe |
 * | parry | the foe Parries a Chainsword hit |
 * | manifest | Smite cast at the target |
 * | phenomena | Smite on a doubles Focus Power roll (11): the Phenomena table rolls 30 |
 * | perils | Smite on doubles (22): the Phenomena table rolls 90, so Perils follow |
 *
 * Each outcome's canvas is captured on the GM's client, the frame frozen just after
 * its own cue (lib/cue-probe.ts): `attack-cue-outcome-<outcome>`.
 *
 * Each event records under `attack-cue.outcome`. Keys MUST match
 * ATTACK_CUE_OUTCOMES in scripts/e2e-coverage.mjs (the cue vocabulary).
 */

const ATTACK_CUE_OUTCOMES = [
    'fire',
    'hit',
    'miss',
    'critical',
    'jam',
    'overheat',
    'explode',
    'scatter',
    'blast',
    'spray',
    'melee-hit',
    'melee-miss',
    'parry',
    'dodge',
    'manifest',
    'phenomena',
    'perils',
] as const;
type CueEvent = (typeof ATTACK_CUE_OUTCOMES)[number];

const dh2Weapon = (docId: string): string => compendiumUuid({ line: 'dh2', category: 'weapons' }, docId);
const LASGUN = dh2Weapon('z3A4b5C6d7E8f9G0');
const AUTOGUN = dh2Weapon('r5S6t7U8v9W0x1Y2');
const PLASMA_GUN = dh2Weapon('DH2CorePlasGun01');
const CHAINSWORD = dh2Weapon('z5A6b7C8d9E0f1G2');
const HAND_FLAMER = dh2Weapon('j7K8l9M0n1O2p3Q4');
const FRAG_GRENADE = dh2Weapon('x1Y2z3A4b5C6d7E8');
const SMITE = compendiumUuid({ line: 'dh2', category: 'psychic-powers' }, 'Ks7wXmP4nRtL2bYq');
const PLAYER = 'E2E Cue Watcher';

/** The firer carries one of each; the target stands 6 m east, the foe adjacent. */
const TOKENS = [
    {
        key: 'firer',
        name: 'Cue Trooper',
        type: 'dh2-character',
        x: 200,
        y: 400,
        items: [
            leanWeapon('Lasgun', LASGUN, 30),
            leanWeapon('Autogun', AUTOGUN, 30),
            { ...leanWeapon('Junk Autogun', AUTOGUN, 30), system: { clip: { value: 30 }, special: ['scavenged'] } },
            leanWeapon('Plasma Gun', PLASMA_GUN, 20),
            leanWeapon('Chainsword', CHAINSWORD, 0),
            leanWeapon('Hand Flamer', HAND_FLAMER, 3),
            leanWeapon('Frag Grenade', FRAG_GRENADE, 3),
            { name: 'Smite', type: 'psychicPower', _stats: { compendiumSource: SMITE } },
        ],
        system: {
            characteristics: { ballisticSkill: { base: 50 }, weaponSkill: { base: 50 }, willpower: { base: 50 } },
            psy: { rating: 3 },
        },
    },
    { key: 'target', name: 'Cue Heretic', type: 'dh2-npc', x: 800, y: 400 },
    // 1 m beside the target: a burst can spread onto it (#513).
    { key: 'cultist', name: 'Cue Cultist', type: 'dh2-npc', x: 900, y: 400 },
    { key: 'foe', name: 'Cue Brawler', type: 'dh2-npc', x: 300, y: 600 },
];
/** Token centres, for the canvas capture region. */
const TOKEN_CENTRES = [
    { x: 250, y: 450 },
    { x: 850, y: 450 },
    { x: 950, y: 450 },
    { x: 350, y: 650 },
];
/** How long after its cue appears the capture frame is frozen, in ms. */
const FREEZE_AFTER_MS = 120;

/** One played cue step, as the hook carries it. */
interface Played {
    event: string;
    renderer: string;
}

declare global {
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kCueLog: Played[] | undefined;
}

/** Record every cue step this client plays. */
async function listenForCues(client: Page): Promise<void> {
    await client.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Hooks` global has no browser-side types
        const g = globalThis as unknown as { Hooks: { on: (hook: string, fn: (played: Played) => void) => number } };
        globalThis.wh40kCueLog = [];
        g.Hooks.on('wh40k-rpg.attackCuePlayed', (played) => {
            globalThis.wh40kCueLog?.push({ event: played.event, renderer: played.renderer });
        });
    });
}

async function clearCues(clients: readonly Page[]): Promise<void> {
    await Promise.all(clients.map(async (client) => client.evaluate(() => (globalThis.wh40kCueLog = []))));
}

/** Wait until this client has drawn every one of `events`; returns what it played. */
async function awaitCues(client: Page, events: readonly CueEvent[]): Promise<Played[]> {
    return client.evaluate(
        async ({ wanted }) => {
            const drawn = (): Set<string> => new Set((globalThis.wh40kCueLog ?? []).filter((p) => p.renderer === 'canvas').map((p) => p.event));
            await globalThis.wh40kE2E.pollUntil(() => wanted.every((event) => drawn().has(event)), globalThis.wh40kE2E.scaledMs(8_000));
            return [...(globalThis.wh40kCueLog ?? [])];
        },
        { wanted: [...events] },
    );
}

/** The events a log drew on the canvas. */
function drawnEvents(log: readonly Played[]): string[] {
    return [...new Set(log.filter((p) => p.renderer === 'canvas').map((p) => p.event))].sort();
}

test.describe.serial('every attack-cue outcome on a live canvas, on every client (Tier B, #594)', () => {
    test.setTimeout(scaledMs(300_000));
    test('each outcome plays its cue on the GM’s client and on a player’s', async ({ page, openClient }) => {
        await joinOrSkip(page);
        await installAttackHarness(page);
        // Cues on; dice from the harness, not typed in; damage only when the spec rolls it (seeded).
        const settings = await setWorldSettings(page, { 'attack-cues': true, 'allow-manual-roll': false, 'auto-roll-damage': false });
        const playerId = await createPlayer(page, PLAYER);
        const scene: HarnessScene = await page.evaluate(async (tokens) => globalThis.wh40kAttack.setup({ width: 1200, height: 900, tokens }), TOKENS);
        try {
            // The player's client views the same scene: the GM activates it.
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.scenes` has no browser-side types
                const g = globalThis as unknown as { game: { scenes: { get: (i: string) => { activate: () => Promise<object> } | undefined } } };
                await g.game.scenes.get(id)?.activate();
            }, scene.sceneId);
            const player = await openClient();
            expect(await joinAsUser(player, PLAYER), 'the player joins on a second client').toBe(true);
            await player.waitForFunction(
                (id) =>
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` global has no browser-side types
                    (globalThis as unknown as { canvas: { ready: boolean; scene: { id: string } | null } }).canvas.ready &&
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` global has no browser-side types
                    (globalThis as unknown as { canvas: { scene: { id: string } | null } }).canvas.scene?.id === id,
                scene.sceneId,
            );
            const clients = [page, player];
            await Promise.all(clients.map(listenForCues));

            await installCueProbe(page, FREEZE_AFTER_MS);
            await clearScreenOverlays(page);
            const clip = await canvasClip(page, TOKEN_CENTRES, 150);

            const attack = async (
                weaponName: string,
                target: string | null,
                faces: Array<[number, number]>,
                choices?: { action: string; hitAllocation: 'spread' },
            ): Promise<string[]> => {
                const result = await page.evaluate(async (a) => globalThis.wh40kAttack.attack(a), {
                    firer: scene.tokens['firer'] ?? '',
                    target: target === null ? null : scene.tokens[target] ?? '',
                    weaponName,
                    faces,
                    ...(choices === undefined ? {} : { choices }),
                });
                expect(result.messageIds.length, `${weaponName} posted its card (${result.notices.join(' | ')})`).toBeGreaterThan(0);
                return result.messageIds;
            };
            /** The card among `messageIds` that offers `selector`. */
            const cardOffering = async (messageIds: readonly string[], selector: string): Promise<string> => {
                const messageId = await page.evaluate(
                    ({ ids, sel }) => ids.find((id) => document.querySelector(`#sidebar .chat-log .message[data-message-id="${id}"] ${sel}`) !== null) ?? '',
                    { ids: [...messageIds], sel: selector },
                );
                expect(messageId, `a card offering ${selector}`).not.toBe('');
                return messageId;
            };
            const click = async (messageIds: readonly string[], selector: string, faces: Array<[number, number]>): Promise<string[]> => {
                const messageId = await cardOffering(messageIds, selector);
                return page.evaluate(async (a) => globalThis.wh40kAttack.clickInMessage(a), { messageId, buttonSelector: selector, faces, expectMessages: 1 });
            };
            /** Click an evasion control and roll the test it opens. */
            const evade = async (messageIds: readonly string[], skill: 'dodge' | 'parry', face: number): Promise<string[]> => {
                const selector = `.roll-control__evade[data-skill="${skill}"]`;
                const messageId = await cardOffering(messageIds, selector);
                return page.evaluate(async (a) => globalThis.wh40kAttack.clickAndRoll(a), {
                    messageId,
                    buttonSelector: selector,
                    faces: [[face, 100]] as Array<[number, number]>,
                });
            };
            /**
             * Run one outcome, check both clients drew its events, and capture the GM's
             * canvas frozen just after the `capture` cue (the outcome's own, drawn last; a
             * run that has to arm the freeze itself passes null).
             */
            const expectCues = async (label: string, events: readonly CueEvent[], capture: CueEvent | null, run: () => Promise<void>): Promise<void> => {
                await clearCues(clients);
                if (capture !== null) await armCueFreeze(page, capture);
                await run();
                for (const [index, client] of clients.entries()) {
                    // eslint-disable-next-line no-await-in-loop -- each client is checked in turn, after the attack resolved
                    const log = await awaitCues(client, events);
                    const who = index === 0 ? 'GM' : 'player';
                    for (const event of events) {
                        expect(drawnEvents(log), `${label}: the ${who}’s client draws ${event} (it played ${JSON.stringify(log)})`).toContain(event);
                    }
                }
                expect(await awaitCueFreeze(page, scaledMs(3_000)), `${label}: the capture froze on its cue`).toBe(true);
                const slug = label.toLowerCase().replace(/[^a-z0-9]+/gu, '-');
                expect(await snap(page, `attack-cue-outcome-${slug}`, clip === null ? { selector: '#board' } : { clip })).not.toBeNull();
                await releaseFreeze(page);
                // An area attack's template stays on the scene; clear it so it does not sit in the next outcome's capture.
                await page.evaluate(async (id) => {
                    interface TemplateScene {
                        templates: { contents: Array<{ id: string }> };
                        deleteEmbeddedDocuments: (type: string, ids: string[]) => Promise<object[]>;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.scenes` has no browser-side types
                    const g = globalThis as unknown as { game: { scenes: { get: (i: string) => TemplateScene | undefined } } };
                    const stage = g.game.scenes.get(id);
                    const ids = stage?.templates.contents.map((t) => t.id) ?? [];
                    if (ids.length > 0) await stage?.deleteEmbeddedDocuments('MeasuredTemplate', ids);
                }, scene.sceneId);
                for (const event of events) recordCoverage('attack-cue.outcome', event);
            };

            await expectCues('a Lasgun hit', ['fire', 'hit'], 'hit', async () => {
                await attack('Lasgun', 'target', [[5, 100]]);
            });
            await expectCues('a successful Dodge', ['dodge'], 'dodge', async () => {
                const hit = await attack('Lasgun', 'target', [[5, 100]]);
                // The target Dodges from its evasion prompt (whispered to the GM, who plays it).
                await evade(hit, 'dodge', 1);
            });
            await expectCues('a Lasgun miss', ['fire', 'miss'], 'miss', async () => {
                await attack('Lasgun', 'target', [[90, 100]]);
            });
            await expectCues('a burst spread onto a second creature', ['fire', 'hit'], null, async () => {
                const burst = await attack('Autogun', 'target', [[1, 100]], { action: 'Semi-Auto Burst', hitAllocation: 'spread' });
                await click(burst, '.roll-control__take-hit', []);
                // Only the damage roll's cues from here on: a targeted burst's hits are drawn
                // again at damage time only where one was spread onto another creature.
                await clearCues(clients);
                await armCueFreeze(page, 'hit');
                await click(burst, '.roll-control__roll-damage', [
                    [5, 10],
                    [5, 10],
                    [5, 10],
                    [5, 10],
                    [5, 10],
                    [5, 10],
                ]);
            });
            await expectCues('Righteous Fury on the damage', ['critical'], 'critical', async () => {
                const hit = await attack('Lasgun', 'target', [[5, 100]]);
                await click(hit, '.roll-control__take-hit', []);
                await click(hit, '.roll-control__roll-damage', [
                    [10, 10],
                    [5, 10],
                    [5, 10],
                ]);
            });
            await expectCues('an Autogun jam', ['jam'], 'jam', async () => {
                await attack('Autogun', 'target', [[97, 100]]);
            });
            await expectCues('a Plasma Gun overheat', ['overheat'], 'overheat', async () => {
                await attack('Plasma Gun', 'target', [[95, 100]]);
            });
            await expectCues('a Scavenged weapon on 00', ['explode'], 'explode', async () => {
                await attack('Junk Autogun', 'target', [[100, 100]]);
            });
            await expectCues('a Hand Flamer', ['spray'], 'spray', async () => {
                await attack('Hand Flamer', 'target', [[50, 100]]);
            });
            await expectCues('a Frag Grenade that hits', ['blast'], 'blast', async () => {
                await attack('Frag Grenade', 'target', [[10, 100]]);
            });
            await expectCues('a Frag Grenade that misses', ['scatter', 'blast'], 'blast', async () => {
                await attack('Frag Grenade', 'target', [
                    [95, 100],
                    [5, 10],
                    [3, 10],
                ]);
            });
            await expectCues('a Chainsword hit', ['melee-hit'], 'melee-hit', async () => {
                await attack('Chainsword', 'foe', [[5, 100]]);
            });
            await expectCues('a Chainsword miss', ['melee-miss'], 'melee-miss', async () => {
                await attack('Chainsword', 'foe', [[95, 100]]);
            });
            await expectCues('a successful Parry', ['parry'], 'parry', async () => {
                const hit = await attack('Chainsword', 'foe', [[5, 100]]);
                await evade(hit, 'parry', 1);
            });
            await expectCues('Smite manifests', ['manifest'], 'manifest', async () => {
                await attack('Smite', 'target', [[5, 100]]);
            });
            // A doubles Focus Power roll draws Phenomena; the table's 75+ is Perils.
            await expectCues('Smite on doubles draws Phenomena', ['manifest', 'phenomena'], 'phenomena', async () => {
                await attack('Smite', 'target', [
                    [11, 100],
                    [30, 100],
                ]);
            });
            await expectCues('Smite on doubles falls into Perils', ['perils'], 'perils', async () => {
                await attack('Smite', 'target', [
                    [22, 100],
                    [90, 100],
                    [50, 100],
                ]);
            });
            expect(ATTACK_CUE_OUTCOMES).toHaveLength(17);
        } finally {
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
            await restoreSettings(page, settings);
            await deleteDocuments(page, { users: [playerId] });
        }
    });
});
