import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: every NPC generator creates a real NPC (#644).
 *
 * Quick-create, batch-create and the stat-block import created `npcV2` actors,
 * a type Foundry does not register, so nothing was created. Each is driven here
 * the way a GM uses it — fill the dialog, press its button — and the actors it
 * makes must exist as the world's primary line's NPC type (dh2-npc in the e2e
 * world), or as the line an imported export names.
 */

const PREFIX = 'e2e-644';

interface ProbeActor {
    name: string;
    type: string;
    delete: () => Promise<void>;
    sheet?: { close: () => Promise<void> } | null;
}
interface ProbeWindow {
    game: {
        actors: { filter: (fn: (a: ProbeActor) => boolean) => ProbeActor[] };
        wh40k: {
            quickCreateNPC: (config?: object) => Promise<object | null>;
            batchCreateNPCs: (config?: object) => Promise<object[]>;
            importStatBlock: (input?: string) => Promise<object | null>;
        };
    };
    foundry: { applications: { instances: Map<string, { id: string; constructor: { name: string } }> } };
}

/** Start a generator through the system API (the macro entry point) and return its window id. */
async function openGenerator(
    page: Page,
    api: 'quickCreateNPC' | 'batchCreateNPCs' | 'importStatBlock',
    className: string,
    arg: object | string,
): Promise<string> {
    return page.evaluate(
        async ({ method, ctor, config }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const openId = (): string => [...w.foundry.applications.instances.values()].find((app) => app.constructor.name === ctor)?.id ?? '';
            if (method === 'importStatBlock') void w.game.wh40k.importStatBlock(config as string);
            else void w.game.wh40k[method](config as object);
            await globalThis.wh40kE2E.waitFor(() => openId() !== '', `${ctor} rendered`);
            return openId();
        },
        { method: api, ctor: className, config: arg },
    );
}

async function createdTypes(page: Page, name: string): Promise<string[]> {
    return page.evaluate(
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        (prefix) => (globalThis as unknown as ProbeWindow).game.actors.filter((a) => a.name.startsWith(prefix)).map((a) => a.type),
        name,
    );
}

test.describe.serial('NPC generators create registered NPCs (Tier B, #644)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const actor of w.game.actors.filter((a) => a.name.startsWith(prefix))) {
                await actor.sheet?.close();
                await actor.delete();
            }
        }, PREFIX);
    });

    test('quick-create makes a dh2-npc', async ({ page }) => {
        await joinOrSkip(page);
        const id = await openGenerator(page, 'quickCreateNPC', 'NPCQuickCreateDialog', {});
        const dialog = page.locator(`#${id}`);
        await dialog.locator('input[name="name"]').fill(`${PREFIX} Quick`);
        await clearScreenOverlays(page, id);
        // #701: the preview shows an NPC's nine characteristics, never a PC's Influence; and each select
        // shows its whole text (they were clipped at the bottom).
        await expect(dialog).not.toContainText(/\bInf\b/u);
        for (const name of ['role', 'type', 'preset']) {
            const fits = await dialog.locator(`select[name="${name}"]`).evaluate((select) => {
                const style = getComputedStyle(select);
                const textHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
                return select.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) >= textHeight - 0.5;
            });
            expect(fits, `${name} select clips its text`).toBe(true);
        }
        await snap(page, 'npc-quick-create-dialog', { selector: `#${id}` });
        await dialog.locator('button[type="submit"]').click();
        await expect.poll(async () => createdTypes(page, `${PREFIX} Quick`)).toEqual(['dh2-npc']);
        recordCoverage('dialog.action', 'NPCQuickCreateDialog.create');
    });

    test('batch-create makes every NPC a dh2-npc', async ({ page }) => {
        await joinOrSkip(page);
        const id = await openGenerator(page, 'batchCreateNPCs', 'BatchCreateDialog', {});
        const dialog = page.locator(`#${id}`);
        await dialog.locator('input[name="namePattern"]').fill(`${PREFIX} Batch {n}`);
        await dialog.locator('input[name="count"]').fill('3');
        await dialog.locator('input[name="count"]').press('Tab');
        // #701: the inputs have a visible border and field background, like Quick Create's (they read as plain text).
        // Tab re-renders the dialog, so the read is polled: an input caught mid-swap is detached and has no style.
        const readFields = async (): Promise<string[]> =>
            dialog.locator('input[name="namePattern"], input[name="count"], input[name="faction"], select[name="role"]').evaluateAll((els) =>
                els.map((el) => {
                    if (!el.isConnected) return `${el.getAttribute('name') ?? ''}: detached`;
                    const style = getComputedStyle(el);
                    return `${el.getAttribute('name') ?? ''}: ${style.borderTopStyle} ${style.borderTopWidth} ${style.borderTopColor} on ${
                        style.backgroundColor
                    }`;
                }),
            );
        const visible = (field: string): boolean => {
            const match = /: solid (\d+(?:\.\d+)?)px (rgba?\([^)]*\)) on (rgba?\([^)]*\))$/u.exec(field);
            const opaque = (colour: string): boolean => !/rgba\([^)]*,\s*0\)$/u.test(colour);
            return match !== null && Number(match[1]) >= 1 && opaque(match[2]) && opaque(match[3]);
        };
        await expect
            .poll(async () => (await readFields()).filter((field) => !visible(field)), { message: 'every batch-create input has a visible border and field' })
            .toEqual([]);
        expect((await readFields()).length).toBe(4);
        await clearScreenOverlays(page, id);
        await snap(page, 'npc-batch-create-dialog', { selector: `#${id}` });
        await dialog.locator('button[type="submit"]').click();
        await expect.poll(async () => createdTypes(page, `${PREFIX} Batch`)).toEqual(['dh2-npc', 'dh2-npc', 'dh2-npc']);
        recordCoverage('dialog.action', 'BatchCreateDialog.create');
    });

    test('the stat-block import keeps an export’s line, else makes the primary line’s NPC', async ({ page }) => {
        await joinOrSkip(page);
        // An export from Dark Heresy 1e stays a dh1-npc.
        const exported = JSON.stringify({ name: `${PREFIX} Imported DH1`, type: 'dh1-npc', system: { threatLevel: 6 } });
        const id = await openGenerator(page, 'importStatBlock', 'StatBlockParser', exported);
        const dialog = page.locator(`#${id}`);
        await dialog.locator('textarea[name="rawInput"]').fill(exported);
        await dialog.locator('[data-action="parse"]').first().click();
        await expect(dialog.locator('button[type="submit"]')).toBeEnabled();
        await clearScreenOverlays(page, id);
        await snap(page, 'npc-stat-block-parsed', { selector: `#${id}` });
        await dialog.locator('button[type="submit"]').click();
        await expect.poll(async () => createdTypes(page, `${PREFIX} Imported DH1`)).toEqual(['dh1-npc']);
        // The import closes its window; wait for it to go before opening the next.
        await expect(page.locator(`#${id}`)).toHaveCount(0);

        // Bare system data names no line: the primary line's NPC.
        const bare = JSON.stringify({ name: `${PREFIX} Imported Bare`, threatLevel: 4 });
        const second = await openGenerator(page, 'importStatBlock', 'StatBlockParser', bare);
        const parser = page.locator(`#${second}`);
        await parser.locator('textarea[name="rawInput"]').fill(bare);
        await parser.locator('[data-action="parse"]').first().click();
        await parser.locator('button[type="submit"]').click();
        await expect.poll(async () => createdTypes(page, `${PREFIX} Imported Bare`)).toEqual(['dh2-npc']);
        recordCoverage('dialog.action', 'StatBlockParser.import');
    });
});
