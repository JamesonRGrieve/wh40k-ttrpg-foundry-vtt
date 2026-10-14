import type { Page } from '@playwright/test';
import { createActor, deleteDocuments, openActorSheet, prepareStage, snapWindow } from './combat-resolution-flow';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B — which sheet each line's NPC opens with (#644).
 *
 * A `getActorSheetClass` hook used to pick a craft sheet for `npcV2` actors whose
 * `primaryUse` was a vehicle or ship. No actor can be `npcV2` (Foundry does not
 * register the type), so it never chose anything, and it was deleted. This pins what
 * the registration really does, from live Foundry: each line's NPC type has exactly
 * one default sheet, that line's NPC sheet, and an NPC opens with it — including one
 * whose `primaryUse` is a vehicle or a ship.
 */

const NPC_SHEETS: Readonly<Record<string, string>> = {
    'dh1-npc': 'DarkHeresy1NPCSheet',
    'dh2-npc': 'DarkHeresy2NPCSheet',
    'rt-npc': 'RogueTraderNPCSheet',
    'bc-npc': 'BlackCrusadeNPCSheet',
    'ow-npc': 'OnlyWarNPCSheet',
    'dw-npc': 'DeathwatchNPCSheet',
    'im-npc': 'ImperiumMaledictumNPCSheet',
};

/** The default sheet ids Foundry's registry holds for an actor type. */
async function defaultSheetIds(page: Page, type: string): Promise<string[]> {
    return page.evaluate((actorType) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `CONFIG.Actor.sheetClasses` has no browser-side types
        const g = globalThis as unknown as {
            CONFIG: { Actor: { sheetClasses: Record<string, Record<string, { id: string; default: boolean }> | undefined> } };
        };
        return Object.values(g.CONFIG.Actor.sheetClasses[actorType] ?? {})
            .filter((entry) => entry.default)
            .map((entry) => entry.id);
    }, type);
}

/** The class name of the sheet an actor opens with. */
async function sheetClassName(page: Page, actorId: string): Promise<string> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { actors: { get: (actor: string) => { sheet: object | null } | undefined } } };
        return g.game.actors.get(id)?.sheet?.constructor.name ?? '';
    }, actorId);
}

test.describe.serial('NPC sheet registration (Tier B, #644)', () => {
    test("every line's NPC opens with that line's NPC sheet, whatever its primary use", async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const created: string[] = [];
        try {
            for (const [type, sheet] of Object.entries(NPC_SHEETS)) {
                expect(await defaultSheetIds(page, type), `${type} has one default sheet`).toEqual([`wh40k-rpg.${sheet}`]);
                for (const primaryUse of ['npc', 'vehicle', 'ship']) {
                    // eslint-disable-next-line no-await-in-loop -- one actor at a time, so a failure names its type and use
                    const actor = await createActor(page, { data: { name: `e2e-644 ${type} ${primaryUse}`, type, system: { primaryUse } } });
                    created.push(actor.id);
                    // eslint-disable-next-line no-await-in-loop -- see above
                    expect(await sheetClassName(page, actor.id), `${type} (${primaryUse})`).toBe(sheet);
                }
            }
            const shown = created.at(-1) ?? '';
            const sheetId = await openActorSheet(page, shown, 'npc');
            expect(await snapWindow(page, 'npc-sheet-registration-ship-npc', sheetId)).not.toBeNull();
        } finally {
            await deleteDocuments(page, { actors: created });
        }
    });
});
