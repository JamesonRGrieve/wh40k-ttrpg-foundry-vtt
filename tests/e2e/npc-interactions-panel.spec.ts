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

    const result = await page.evaluate(async (): Promise<{ setupOk: boolean; panelPresent: boolean; rowCount: number; error: string | null }> => {
        interface SheetShape {
            render: (force?: boolean) => Promise<void>;
            changeTab?: (tab: string, group: string) => void;
            element: HTMLElement | null;
        }
        interface ActorDoc {
            sheet: SheetShape;
        }
        interface ActorCreateData {
            name: string;
            type: string;
            system: { gameSystem: string; characteristics?: { fellowship: { base: number; total: number; bonus: number } } };
        }
        interface ActorClassShape {
            create?: (data: ActorCreateData) => Promise<ActorDoc | null>;
        }
        interface FoundryGlobal {
            Actor: ActorClassShape;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor) have no shipped types in this browser-side probe
        const g = globalThis as unknown as FoundryGlobal;
        const ActorCls = g.Actor;
        if (ActorCls.create == null) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: 'Actor.create unavailable' };
        }

        let pc: ActorDoc | null, npc: ActorDoc | null;
        try {
            pc = await ActorCls.create({
                name: 'npc-interactions-pc-probe',
                type: 'dh2-character',
                system: {
                    gameSystem: 'dh2',
                    characteristics: { fellowship: { base: 40, total: 40, bonus: 4 } },
                },
            });
            npc = await ActorCls.create({
                name: 'npc-interactions-npc-probe',
                type: 'bc-npc',
                system: { gameSystem: 'dh2' },
            });
        } catch (err) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: err instanceof Error ? err.message : String(err) };
        }

        if (pc == null || npc == null) {
            return { setupOk: false, panelPresent: false, rowCount: 0, error: 'Actor.create returned null' };
        }

        await npc.sheet.render(true);
        await new Promise<void>((r) => {
            setTimeout(r, 250);
        });

        // The panel lives on the dedicated NPC tab.
        try {
            npc.sheet.changeTab?.('npc', 'primary');
        } catch {
            /* tab name may vary in older sheets */
        }
        await new Promise<void>((r) => {
            setTimeout(r, 200);
        });

        const root = npc.sheet.element;
        const panel = root?.querySelector('.wh40k-npc-interactions-panel') ?? null;
        const rows = root?.querySelectorAll('.wh40k-npc-interactions-row') ?? { length: 0 };
        const panelPresent = panel !== null;

        return { setupOk: true, panelPresent, rowCount: rows.length, error: null };
    });

    expect(result.setupOk, `setup error: ${result.error ?? ''}`).toBe(true);

    await snap(page, 'npc-interactions-panel');

    expect(result.panelPresent, 'expected .wh40k-npc-interactions-panel on the NPC tab').toBe(true);

    // Cleanup
    await page.evaluate(async (): Promise<void> => {
        interface CleanupActor {
            delete?: () => Promise<void>;
        }
        interface FoundryGlobal {
            game?: { actors?: { getName?: (name: string) => CleanupActor | undefined } };
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game) have no shipped types in this browser-side cleanup
        const g = globalThis as unknown as FoundryGlobal;
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
