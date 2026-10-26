import type { Page } from '@playwright/test';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#701 item 4): `rt-voidcraft` is the one ship type.
 *  - A legacy `rt-starship` world actor still opens. Its sheet says it is
 *    legacy, and a GM converts it in place: same id, items, stats and token link.
 *  - The create-actor dialog never offers `rt-starship`.
 *  - The voidcraft window title names the ship's own line from its gameSystem.
 */

interface ShipSnapshot {
    id: string;
    type: string;
    itemIds: string[];
    hullIntegrity: number;
    actorLink: boolean;
}
interface ProbeActor {
    id: string;
    type: string;
    items: { contents: Array<{ id: string }> };
    system: { hullIntegrity: { value: number } };
    prototypeToken: { actorLink: boolean };
    sheet: { id: string; title: string; render: (o: object) => Promise<object>; close: () => Promise<object> };
    update: (data: object) => Promise<object>;
    delete: () => Promise<object>;
}
interface ProbeGlobals {
    Actor: { create: (data: object) => Promise<ProbeActor | null>; implementation: { createDialog: (...args: object[]) => Promise<object | null> } };
    game: { actors: { get: (id: string) => ProbeActor | undefined } };
}

/** Create a ship, then set its line: creation seeds `gameSystem` from the type's own line (as ship-sheet-driver does). */
async function createShip(page: Page, data: object, gameSystem: string): Promise<string> {
    return page.evaluate(
        async ({ createData, line }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const doc = await (globalThis as unknown as ProbeGlobals).Actor.create(createData);
            if (doc === null) throw new Error('Actor.create returned null');
            await doc.update({ 'system.gameSystem': line });
            return doc.id;
        },
        { createData: data, line: gameSystem },
    );
}

async function shipState(page: Page, id: string): Promise<ShipSnapshot> {
    return page.evaluate((actorId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const actor = (globalThis as unknown as ProbeGlobals).game.actors.get(actorId);
        if (actor === undefined) throw new Error(`actor ${actorId} is gone`);
        return {
            id: actor.id,
            type: actor.type,
            itemIds: actor.items.contents.map((item) => item.id).sort(),
            hullIntegrity: actor.system.hullIntegrity.value,
            actorLink: actor.prototypeToken.actorLink,
        };
    }, id);
}

/** Render the actor's sheet and return its id and window title. */
async function openShip(page: Page, id: string): Promise<{ sheetId: string; title: string }> {
    const opened = await page.evaluate(async (actorId) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const actor = (globalThis as unknown as ProbeGlobals).game.actors.get(actorId);
        if (actor === undefined) throw new Error(`actor ${actorId} is gone`);
        await actor.sheet.render({ force: true });
        return actor.sheet.id;
    }, id);
    await expect(page.locator(`#${opened}`)).toBeVisible();
    await clearScreenOverlays(page, opened);
    const title = ((await page.locator(`#${opened} .window-header .window-title`).textContent()) ?? '').trim();
    return { sheetId: opened, title };
}

async function deleteActors(page: Page, ids: string[]): Promise<void> {
    await page.evaluate(async (actorIds) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
        const g = globalThis as unknown as ProbeGlobals;
        for (const id of actorIds) {
            const actor = g.game.actors.get(id);
            await actor?.sheet.close();
            await actor?.delete();
        }
    }, ids);
}

test.describe.serial('ship-type merge (Tier B, #701)', () => {
    test('a GM converts a legacy rt-starship in place, keeping its id, items, stats and token link', async ({ page }) => {
        await joinOrSkip(page);
        const id = await createShip(
            page,
            {
                name: 'e2e-701 Legacy Starship',
                type: 'rt-starship',
                system: { gameSystem: 'rt', hullType: 'frigate', hullIntegrity: { max: 40, value: 31 } },
                prototypeToken: { actorLink: true },
                items: [{ name: 'e2e-701 Augur Array', type: 'shipComponent', system: {} }],
            },
            'rt',
        );
        try {
            const before = await shipState(page, id);
            expect(before.type).toBe('rt-starship');
            expect(before.itemIds).toHaveLength(1);

            const legacy = await openShip(page, id);
            expect(legacy.title).toBe('Rogue Trader Starship (legacy): e2e-701 Legacy Starship');
            const notice = page.locator(`#${legacy.sheetId} [data-wh40k-hook="legacy-ship-notice"]`);
            await expect(notice).toBeVisible();
            await snap(page, 'legacy-starship-before-convert', { selector: `#${legacy.sheetId}` });

            await notice.locator('[data-action="convertToVoidcraft"]').click();
            const confirm = page.locator('dialog.application').filter({ hasText: 'Convert e2e-701 Legacy Starship to a Voidcraft?' });
            await expect(confirm).toBeVisible();
            await confirm.locator('button[data-action="yes"]').click();
            await expect(confirm).toBeHidden();
            await expect.poll(async () => (await shipState(page, id)).type).toBe('rt-voidcraft');
            await expect(page.locator('#notifications')).toContainText('e2e-701 Legacy Starship is now a Voidcraft.');

            const after = await shipState(page, id);
            expect(after).toEqual({ ...before, type: 'rt-voidcraft' });

            const converted = await openShip(page, id);
            expect(converted.title).toBe('Rogue Trader Voidcraft: e2e-701 Legacy Starship');
            await expect(page.locator(`#${converted.sheetId} [data-wh40k-hook="legacy-ship-notice"]`)).toHaveCount(0);
            await snap(page, 'legacy-starship-after-convert', { selector: `#${converted.sheetId}` });
        } finally {
            await deleteActors(page, [id]);
        }
    });

    test('the create-actor dialog never offers rt-starship', async ({ page }) => {
        await joinOrSkip(page);
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            void (globalThis as unknown as ProbeGlobals).Actor.implementation.createDialog({});
        });
        const dialog = page.locator('dialog.application').filter({ has: page.locator('select[name="type"]') });
        await expect(dialog).toBeVisible();
        const offered = await dialog
            .locator('select[name="type"] option')
            .evaluateAll((options) => options.map((o) => (o instanceof HTMLOptionElement ? o.value : '')));
        expect(offered).toContain('rt-voidcraft');
        expect(offered).not.toContain('rt-starship');
        await snap(page, 'actor-create-dialog-ship-types', { selector: 'dialog.application[open]', keepWindow: 'dialog' });
        await dialog.locator('[data-action="close"]').first().click();
    });

    for (const [line, expected] of [
        ['rt', 'Rogue Trader Voidcraft: e2e-701 Title Ship'],
        ['dh2', 'Dark Heresy 2e Voidcraft: e2e-701 Title Ship'],
    ] as const) {
        test(`a ${line} voidcraft's title names its own line`, async ({ page }) => {
            await joinOrSkip(page);
            const id = await createShip(page, { name: 'e2e-701 Title Ship', type: 'rt-voidcraft', system: { hullType: 'frigate' } }, line);
            try {
                const opened = await openShip(page, id);
                expect(opened.title).toBe(expected);
                await snap(page, `voidcraft-title-${line}`, { selector: `#${opened.sheetId}` });
            } finally {
                await deleteActors(page, [id]);
            }
        });
    }
});
