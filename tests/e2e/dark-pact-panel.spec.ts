import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { closeApp, openPackDocument } from './lib/pack-document';
import { compendiumUuid, packHoldingId } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Dark Pacts (#84, a DH2 supplement rule) against live Foundry, with the
 * real compendium pacts.
 *
 * A GM strikes the Pact of Might by dropping it on a character sheet's Dark
 * Pacts drop zone, and the Pact of Knowledge with Add Pact (the compendium
 * picker). Each strike starts the Daemon's Disposition at 15 + the character's
 * Corruption and rolls 2d10+10 Corruption. Choosing Boons and Banes gives the
 * character their mechanics through the central paths: Lord of Battle an
 * ActiveEffect on Weapon Skill, Mighty the Unnatural Characteristic trait. The
 * panel names each pact through `uuidNameCache`, never "[broken link]".
 */

const MIGHT = compendiumUuid({ line: 'dh2', category: 'dark-pacts' }, 'EB2PactMight0001');
const KNOWLEDGE = compendiumUuid({ line: 'dh2', category: 'dark-pacts' }, 'EB2PactKnowl0001');
const UNNATURAL = compendiumUuid({ line: 'dh2', category: 'traits' }, 'UnnatCharDh2TrX1');
/** The pack holding the Pact of Might. */
const PACTS_PACK = packHoldingId({ line: 'dh2', category: 'dark-pacts' }, 'EB2PactMight0001');
const ACTOR_NAME = 'dark-pact-panel-probe';
const START_CORRUPTION = 10;

interface ActorState {
    corruption: number;
    pacts: Array<{ pactUuid: string; disposition: number; boons: string[]; banes: string[] }>;
    /** ActiveEffect changes flagged as coming from a pact entry. */
    pactChanges: Array<{ entry: string; key: string; value: string }>;
    /** Owned items flagged as granted by a pact entry: compendium source, specialization, level. */
    pactItems: Array<{ entry: string; source: string; specialization: string; level: number | null }>;
}

/** Create the probe character, open its sheet on the Overview tab, and return the sheet's app id. */
async function openProbeSheet(page: Page): Promise<string> {
    return page.evaluate(
        async ({ name, corruption }): Promise<string> => {
            interface Sheet {
                id: string;
                rendered: boolean;
                render: (o: { force: boolean }) => Promise<object>;
                changeTab: (tab: string, group: string) => void;
            }
            interface ActorDoc {
                sheet: Sheet;
                delete: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, game) have no shipped types in this browser-side probe
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<ActorDoc | null> };
                game: { actors: { getName: (n: string) => ActorDoc | undefined } };
            };
            await g.game.actors.getName(name)?.delete();
            const actor = await g.Actor.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2', corruption } });
            if (actor === null) throw new Error('Actor.create returned null');
            await actor.sheet.render({ force: true });
            await globalThis.wh40kE2E.waitFor(() => actor.sheet.rendered, 'probe character sheet rendered');
            actor.sheet.changeTab('overview', 'primary');
            return actor.sheet.id;
        },
        { name: ACTOR_NAME, corruption: START_CORRUPTION },
    );
}

async function actorState(page: Page): Promise<ActorState> {
    return page.evaluate((name): ActorState => {
        interface Flagged {
            flags: { 'wh40k-rpg'?: { darkPact?: { entry: string } } };
        }
        interface Effect extends Flagged {
            changes: Array<{ key: string; value: string }>;
        }
        interface Item extends Flagged {
            _stats: { compendiumSource: string | null };
            /** A granted trait carries both; the probe only grants traits it reads these from. */
            system: { specialization: string; level: number | null };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.actors` has no shipped types in this browser-side probe
        const g = globalThis as unknown as {
            game: {
                actors: { getName: (n: string) => { system: Omit<ActorState, 'pactChanges' | 'pactItems'>; effects: Effect[]; items: Item[] } | undefined };
            };
        };
        const actor = g.game.actors.getName(name);
        if (actor === undefined) throw new Error('probe actor missing');
        const pactChanges = Array.from(actor.effects).flatMap((effect) => {
            const ref = effect.flags['wh40k-rpg']?.darkPact;
            return ref === undefined ? [] : effect.changes.map((change) => ({ entry: ref.entry, key: change.key, value: String(change.value) }));
        });
        const pactItems = Array.from(actor.items).flatMap((item) => {
            const ref = item.flags['wh40k-rpg']?.darkPact;
            return ref === undefined
                ? []
                : [
                      {
                          entry: ref.entry,
                          source: item._stats.compendiumSource ?? '',
                          specialization: item.system.specialization,
                          level: item.system.level,
                      },
                  ];
        });
        return {
            corruption: actor.system.corruption,
            pacts: actor.system.pacts.map(({ pactUuid, disposition, boons, banes }) => ({ pactUuid, disposition, boons: [...boons], banes: [...banes] })),
            pactChanges,
            pactItems,
        };
    }, ACTOR_NAME);
}

/** Drop a compendium item on an element the way a sidebar drag does: a `drop` event carrying Foundry's Item drag data. */
async function dropItem(page: Page, selector: string, uuid: string): Promise<void> {
    await page.locator(selector).evaluate((target, itemUuid) => {
        const data = new DataTransfer();
        data.setData('text/plain', JSON.stringify({ type: 'Item', uuid: itemUuid }));
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    }, uuid);
}

test('a GM strikes real Dark Pacts and chooses their Boons and Banes (#84)', async ({ page }) => {
    await joinOrSkip(page, 'no Gamemaster user available in this test world');
    // Page errors explain a strike that never lands; they are reported with the first failed assertion.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
    });

    const appId = await openProbeSheet(page);
    const sheet = page.locator(`#${appId}`);
    const panel = sheet.locator('.wh40k-dark-pact-panel');
    await expect(panel.locator('[data-dark-pact-drop]')).toBeVisible();
    await expect(panel.locator('[data-wh40k-hook="dark-pact-row"]')).toHaveCount(0);

    // Drop the Pact of Might on the drop zone.
    // The new sheet may still be re-rendering (hydration, the tab change) when the first drop lands on a
    // node it is about to replace; a repeat drop is harmless because a held pact is never struck twice.
    await expect(async () => {
        await dropItem(page, `#${appId} [data-dark-pact-drop]`, MIGHT);
        expect((await actorState(page)).pacts).toHaveLength(1);
    }).toPass();
    const might = panel.locator(`[data-wh40k-hook="dark-pact-row"][data-pact-uuid="${MIGHT}"]`);
    await expect(might.locator('[data-dark-pact-name]'), `page errors: ${pageErrors.join(' | ')}`).toHaveText('Pact of Might');
    let state = await actorState(page);
    expect(state.pacts.map((p) => [p.pactUuid, p.disposition])).toEqual([[MIGHT, 15 + START_CORRUPTION]]);
    const afterMight = state.corruption - START_CORRUPTION;
    expect(afterMight, '2d10+10 Corruption').toBeGreaterThanOrEqual(12);
    expect(afterMight).toBeLessThanOrEqual(30);
    await expect(might.locator('[data-dark-pact-disposition]')).toHaveText(String(15 + START_CORRUPTION));

    // Dropping it again is refused: the character already holds it.
    await dropItem(page, `#${appId} [data-dark-pact-drop]`, MIGHT);
    await expect(panel.locator('[data-wh40k-hook="dark-pact-row"]')).toHaveCount(1);

    // Add Pact: pick the Pact of Knowledge from the compendium picker.
    const corruptionBeforeKnowledge = state.corruption;
    await panel.locator('[data-action="addDarkPact"]').click();
    const choice = page.locator(`dialog button[data-action="${KNOWLEDGE}"], .application button[data-action="${KNOWLEDGE}"]`).first();
    await expect(choice).toBeVisible();
    await expect(page.locator(`button[data-action="${MIGHT}"]`).first()).toBeVisible();
    await choice.click();
    const knowledge = panel.locator(`[data-wh40k-hook="dark-pact-row"][data-pact-uuid="${KNOWLEDGE}"]`);
    await expect(knowledge.locator('[data-dark-pact-name]')).toHaveText('Pact of Knowledge');
    state = await actorState(page);
    expect(state.pacts[1]?.disposition).toBe(Math.min(100, 15 + corruptionBeforeKnowledge));

    // Choose the Pact of Might's Boons and a Bane.
    for (const [kind, entry] of [
        ['boons', 'lord-of-battle'],
        ['boons', 'mighty'],
        ['banes', 'blood-rage'],
    ] as const) {
        await might.locator(`[data-dark-pact-available="${kind}"] [data-entry="${entry}"]`).click();
        await expect(might.locator(`[data-dark-pact-column="${kind}"] [data-dark-pact-entries] [data-dark-pact-entry="${entry}"]`)).toBeVisible();
    }
    await knowledge.locator('[data-dark-pact-available="boons"] [data-entry="dark-genius"]').click();
    await knowledge.locator('[data-dark-pact-available="banes"] [data-entry="detached"]').click();
    await expect(knowledge.locator('[data-dark-pact-entry="detached"]')).toBeVisible();

    await expect(might.locator('[data-dark-pact-entry="lord-of-battle"] [data-dark-pact-mechanics]')).toHaveText(/Weapon Skill\s+\+5/);
    await expect(might.locator('[data-dark-pact-entry="mighty"] [data-dark-pact-mechanics]')).toHaveText(/Unnatural Characteristic.*Strength \(2\)/);
    await expect(might.locator('[data-dark-pact-entry="blood-rage"] [data-dark-pact-narrative]')).toBeVisible();
    await expect(panel).not.toContainText('[broken link]');

    // The mechanics landed on the character through the central paths.
    state = await actorState(page);
    expect(state.pacts.map((p) => [p.boons, p.banes])).toEqual([
        [['lord-of-battle', 'mighty'], ['blood-rage']],
        [['dark-genius'], ['detached']],
    ]);
    expect(state.pactChanges).toEqual(
        expect.arrayContaining([
            { entry: 'lord-of-battle', key: 'system.characteristics.weaponSkill.modifier', value: '5' },
            { entry: 'dark-genius', key: 'system.characteristics.intelligence.modifier', value: '5' },
            { entry: 'detached', key: 'system.characteristics.fellowship.modifier', value: '-10' },
        ]),
    );
    expect(state.pactChanges).toHaveLength(3);
    expect(state.pactItems).toEqual([{ entry: 'mighty', source: UNNATURAL, specialization: 'Strength', level: 2 }]);

    await snap(page, 'dark-pact-panel-real-pacts', { selector: `#${appId} .wh40k-dark-pact-panel` });

    // Taking a Boon away removes what it gave.
    await might.locator('[data-dark-pact-entry="mighty"] [data-action="togglePactEntry"]').click();
    await expect(might.locator('[data-dark-pact-available="boons"] [data-entry="mighty"]')).toBeVisible();
    await expect.poll(async () => (await actorState(page)).pactItems).toEqual([]);

    // Ending a pact removes its record and its effects.
    await knowledge.locator('[data-action="removeDarkPact"]').click();
    await expect(knowledge).toHaveCount(0);
    await expect.poll(async () => (await actorState(page)).pactChanges.map((c) => c.entry)).toEqual(['lord-of-battle']);

    await page.evaluate(async (name) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.actors` has no shipped types in this browser-side probe
        const g = globalThis as unknown as { game: { actors: { getName: (n: string) => { delete: () => Promise<void> } | undefined } } };
        await g.game.actors.getName(name)?.delete();
    }, ACTOR_NAME);
});

test("the Dark Pact item sheet shows a real pact's terms, Boons and Banes (#84)", async ({ page }) => {
    await joinOrSkip(page, 'no Gamemaster user available in this test world');

    const opened = await openPackDocument(page, { pack: PACTS_PACK, name: 'Pact of Might', view: 'sheet' });
    expect(opened.detail).toBeNull();
    const appId = opened.appId ?? '';
    const sheet = page.locator(`#${appId}`);

    await expect(sheet.locator('[data-dark-pact-term="corruption"]')).toHaveText('2d10+10');
    await expect(sheet.locator('[data-dark-pact-term="disposition"]')).toHaveText("15 + the character's Corruption");
    await expect(sheet.locator('[data-dark-pact-term="test"]')).toHaveText('-20');
    await expect(sheet.locator('[data-dark-pact-entries="boons"] [data-dark-pact-entry]')).toHaveCount(4);
    await expect(sheet.locator('[data-dark-pact-entries="banes"] [data-dark-pact-entry]')).toHaveCount(3);
    await expect(sheet.locator('[data-dark-pact-entry="unassailable"] [data-dark-pact-mechanics]')).toHaveText(/Combat Master\s+Counter Attack\s+Step Aside/);
    await expect(sheet.locator('[data-dark-pact-entry="reaver"] [data-dark-pact-mechanics]')).toHaveText(/Frenzy/);
    await expect(sheet.locator('[data-dark-pact-entry="reaver"]')).toContainText('re-roll a failed Attack test');
    await expect(sheet).not.toContainText('[broken link]');

    await snap(page, 'dark-pact-item-sheet-pact-of-might', { selector: `#${appId}`, closeWindows: true, keepWindow: appId });
    await closeApp(page, appId);
});
