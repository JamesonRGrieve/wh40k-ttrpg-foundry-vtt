import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Visual + DOM-presence regression spec for #145 (DH2 errata p.125):
 * the NPC sheet's "Interaction Counts" panel surfaces a per-PC tally
 * gated by each PC's Fellowship bonus.
 *
 * Strategy: seed one dh2-character (the PC) and one bc-npc (the NPC —
 * bc-npc is what the rest of the NPC-tool suite uses for in-world
 * coverage), open the NPC sheet, switch to the NPC tab where the panel
 * lives, assert the panel renders, then snap it.
 */
test('npc-interactions-panel renders on the NPC tab (#145)', async ({ page }) => {
    const joined = await joinAsGM(page);
    test.skip(!joined, 'no Gamemaster user available in this test world');

    const result = await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
        const g = globalThis as any;
        const Actor = g.Actor;
        if (!Actor?.create) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: 'Actor.create unavailable' };
        }

        let pc, npc;
        try {
            pc = await Actor.create({
                name: 'npc-interactions-pc-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2e',
                    characteristics: { fellowship: { base: 40, total: 40, bonus: 4 } },
                },
            });
            npc = await Actor.create({
                name: 'npc-interactions-npc-probe',
                type: 'bc-npc',
                system: { gameSystem: 'dh2e' },
            });
        } catch (err) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: String((err as Error)?.message ?? err) };
        }

        if (!pc || !npc) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: 'Actor.create returned null' };
        }

        await npc.sheet.render(true);
        await new Promise((r) => setTimeout(r, 250));

        // The panel lives on the dedicated NPC tab.
        try {
            npc.sheet.changeTab?.('npc', 'primary');
        } catch {
            /* tab name may vary in older sheets */
        }
        await new Promise((r) => setTimeout(r, 200));

        const root = npc.sheet.element as HTMLElement | null;
        const panel = root?.querySelector?.('.wh40k-npc-interactions-panel') ?? null;
        const rows = root?.querySelectorAll?.('.wh40k-npc-interactions-row') ?? { length: 0 };
        const panelPresent = panel !== null && panel !== undefined;

        return { setupOk: true, panelPresent, rowCount: rows.length, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'npc-interactions-panel');

    expect(result.panelPresent, 'expected .wh40k-npc-interactions-panel on the NPC tab').toBe(true);

    // Cleanup
    await page.evaluate(async () => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const g = globalThis as any;
        for (const name of ['npc-interactions-pc-probe', 'npc-interactions-npc-probe']) {
            const a = g.game?.actors?.getName?.(name);
            try {
                await a?.delete?.();
            } catch {
                /* ignore */
            }
        }
    });
});
