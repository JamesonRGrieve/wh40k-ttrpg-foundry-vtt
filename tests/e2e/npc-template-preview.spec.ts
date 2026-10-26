import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B (#699): the NPC template's Preview tab shows the stat block it
 * previews. The tab read `previewData`, which the sheet never supplied (it
 * passed `preview`), so it showed "Characteristics" over nothing and "Wounds",
 * "Movement" and "Armour" with no numbers.
 */

interface PreviewProbe {
    characteristics: Array<{ short: string; value: number }>;
    wounds: number;
    armour: number;
    movement: string;
    skills: Array<{ name: string; target: number }>;
}
interface ProbeDoc {
    id: string;
    system: { previewAtThreat: (threat: number) => PreviewProbe };
    sheet: { id: string; render: (o: object) => Promise<object>; close: () => Promise<object> };
    delete: () => Promise<object>;
}
interface ProbeGlobals {
    Item: { create: (data: object) => Promise<ProbeDoc | null> };
    game: { items: { get: (id: string) => ProbeDoc | undefined } };
}

/** `label` followed, past any whitespace, by exactly `value`. */
function labelled(label: string, value: string): RegExp {
    const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&');
    return new RegExp(`${literal(label)}\\s*${literal(value)}(?!\\d)`, 'u');
}

/** The sheet's preview threat before the slider moves. */
const DEFAULT_PREVIEW_THREAT = 5;

test.describe.serial('NPC template Preview tab (Tier B, #699)', () => {
    test('the Preview tab shows the previewed characteristics, vitals, skills and weapons', async ({ page }) => {
        await joinOrSkip(page);
        const opened = await page.evaluate(async (threat) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
            const g = globalThis as unknown as ProbeGlobals;
            const doc = await g.Item.create({
                name: 'e2e-699 Preview Template',
                type: 'npcTemplate',
                system: {
                    equipmentPreset: 'custom',
                    trainedSkills: [{ key: 'awareness', name: 'Awareness', characteristic: 'perception', level: 'plus10', bonus: 0 }],
                    customWeapons: [
                        { name: 'Autogun', damage: '1d10+3', pen: 0, range: '90m', rof: 'S/3/10', clip: 30, reload: 'Full', special: '', class: 'basic' },
                    ],
                    talents: [{ name: 'Ambidextrous' }],
                },
            });
            if (doc === null) throw new Error('Item.create returned null');
            await doc.sheet.render({ force: true });
            return { itemId: doc.id, sheetId: doc.sheet.id, expected: doc.system.previewAtThreat(threat) };
        }, DEFAULT_PREVIEW_THREAT);
        try {
            const sheet = page.locator(`#${opened.sheetId}`);
            await expect(sheet).toBeVisible();
            await clearScreenOverlays(page, opened.sheetId);
            await sheet.locator('nav [data-tab="preview"]').first().click();
            const tab = sheet.locator('section[data-tab="preview"]');

            // Every characteristic tile carries its abbreviation and value.
            expect(opened.expected.characteristics.length).toBeGreaterThan(0);
            for (const char of opened.expected.characteristics) await expect(tab).toContainText(labelled(char.short, String(char.value)));
            // The vitals show their numbers, not bare labels.
            await expect(tab).toContainText(labelled('Wounds', String(opened.expected.wounds)));
            await expect(tab).toContainText(labelled('Movement', opened.expected.movement));
            await expect(tab).toContainText(labelled('Armour', String(opened.expected.armour)));
            const awareness = opened.expected.skills.find((skill) => skill.name === 'Awareness');
            expect(awareness).toBeDefined();
            await expect(tab).toContainText(labelled('Awareness', String(awareness?.target)));
            await expect(tab).toContainText('Autogun');
            await expect(tab).toContainText('Ambidextrous');
            // Headings are labels, never raw keys, and carry no icon the caller did not ask for.
            await expect(tab).not.toContainText('WH40K.');
            await expect(tab.locator('[data-item-subheading] i')).toHaveCount(0);

            await snap(page, 'npc-template-preview', { selector: `#${opened.sheetId}` });
        } finally {
            await page.evaluate(async (id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                const doc = (globalThis as unknown as ProbeGlobals).game.items.get(id);
                await doc?.sheet.close();
                await doc?.delete();
            }, opened.itemId);
        }
    });
});
