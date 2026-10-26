import type { Page } from '@playwright/test';
import {
    attackWith,
    awaitCard,
    type ChatCard,
    clickInCard,
    createActor,
    deleteDocuments,
    enterRoll,
    messageIds,
    prepareStage,
    restoreSettings,
    selectAttackMode,
    setWorldSettings,
    settledTarget,
    snapCard,
    snapWindow,
    submitRoll,
} from './combat-resolution-flow';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — the auto-fire hit ceiling on real Foundry (#607).
 *
 * A character with an autogun (RoF S/3/10) opens the weapon's Roll Test dialog
 * from the weapon sheet, picks Semi-Auto Burst, and enters the d100. The attack
 * card prints the burst's hit ceiling as hoverable rows, and Roll Damage posts one
 * damage entry per hit actually scored:
 *
 *   - DH2 caps the TOTAL hits at the rate of fire (core p. 223): a 01 against BS 75
 *     earns more than three hits, and three land.
 *   - DH1 caps only the EXTRA hits, so the first hit sits outside the cap and a
 *     burst can land RoF + 1 (DH1 core): four land, and the card shows the
 *     first-hit row.
 *   - A barely-passing roll lands one hit under either rule (under the cap).
 *
 * Each case records an `auto-fire.flow` coverage key; keep AUTO_FIRE_FLOWS in sync
 * with the denominator in scripts/e2e-coverage.mjs.
 */

const AUTO_FIRE_FLOWS = ['dh2-capped', 'dh2-under-cap', 'dh1-capped', 'dh1-under-cap'] as const;
type AutoFireFlow = (typeof AUTO_FIRE_FLOWS)[number];

interface LineCase {
    line: 'dh2' | 'dh1';
    weaponUuid: string;
    /** The most hits a Semi-Auto Burst may land under this line's rule. */
    ceiling: number;
    /** Whether this line's ceiling carries the first-hit row (an `extra` cap). */
    firstHitRow: boolean;
}

const CASES: readonly LineCase[] = [
    { line: 'dh2', weaponUuid: 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.r5S6t7U8v9W0x1Y2', ceiling: 3, firstHitRow: false },
    { line: 'dh1', weaponUuid: 'Compendium.wh40k-rpg.dh1-core-items-weapons.Item.r5S6t7U8v9W0x1Y2', ceiling: 4, firstHitRow: true },
];

/** The hits the attack's damage roll produced, read off the client's stored attack. */
async function hitsScored(page: Page, attack: ChatCard): Promise<number> {
    const rollId = /data-roll-id="([^"]+)"/.exec(attack.html)?.[1] ?? '';
    return page.evaluate(async (id) => {
        interface ManagerModule {
            DHBasicActionManager: { getActionData: (rollId: string) => { damageData?: { hits: object[] } } | null };
        }
        const url = '/systems/wh40k-rpg/module/actions/basic-action-manager.js';
        // eslint-disable-next-line no-restricted-syntax -- boundary: runtime ESM import of the Foundry-served system module; shape declared via ManagerModule
        const mod = (await import(/* @vite-ignore */ url)) as unknown as ManagerModule;
        return mod.DHBasicActionManager.getActionData(id)?.damageData?.hits.length ?? -1;
    }, rollId);
}

/**
 * Capture a chat card taller than the viewport whole: pop it out, grow the viewport
 * until the popout fits its content, snap it, then restore the viewport. A capped
 * burst's damage card lists every hit and runs past 900px, so even the popout cut
 * its lower hits off.
 */
async function snapTallCard(page: Page, label: string, id: string): Promise<string | null> {
    const viewport = page.viewportSize();
    const popout = await popOutChatMessage(page, id);
    // The tallest scroll extent inside the popout (whichever element scrolls), plus its header.
    const needed = await page.evaluate((sel) => {
        const frame = document.querySelector<HTMLElement>(sel);
        const header = frame?.querySelector<HTMLElement>('.window-header')?.offsetHeight ?? 0;
        const tallest = Math.max(0, ...[...(frame?.querySelectorAll<HTMLElement>('*') ?? [])].map((el) => el.scrollHeight));
        return tallest + header + 60;
    }, popout);
    if (viewport !== null && needed > viewport.height) await page.setViewportSize({ width: viewport.width, height: needed });
    await page.evaluate((sel) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
        const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { setPosition: (p: object) => void }> } } }).foundry
            .applications.instances;
        apps.get(sel.slice(1))?.setPosition({ height: 'auto' });
    }, popout);
    const shot = await snap(page, label, { selector: popout });
    if (viewport !== null) await page.setViewportSize(viewport);
    return shot;
}

/** Fire a Semi-Auto Burst with a fixed d100, roll its damage, and capture both cards. */
async function semiAutoBurst(
    page: Page,
    actorId: string,
    weaponId: string,
    roll: (target: number) => number,
    label: string,
): Promise<{ attack: ChatCard; damage: ChatCard }> {
    const before = await messageIds(page);
    const dialogId = await attackWith(page, actorId, weaponId);
    await selectAttackMode(page, dialogId, 'semiAuto');
    const target = (await settledTarget(page, dialogId)) ?? 0;
    expect(target, 'the dialog shows the burst’s target').toBeGreaterThan(10);
    await enterRoll(page, dialogId, roll(target));
    if (label.endsWith('capped')) {
        // Typing the roll scrolled the dialog to its manual-roll field; the capture
        // starts at its first section (#701).
        await page.evaluate((id: string) => {
            document
                .getElementById(id)
                ?.querySelectorAll<HTMLElement>('*')
                .forEach((el) => {
                    if (el.scrollTop > 0) el.scrollTop = 0;
                });
        }, dialogId);
        expect(await snapWindow(page, `${label}-dialog`, dialogId)).not.toBeNull();
    }
    await submitRoll(page, dialogId);
    const attack = await awaitCard(page, before, 'data-hit-ceiling');
    const beforeDamage = await messageIds(page);
    await clickInCard(page, attack.id, '.roll-control__roll-damage');
    const damage = await awaitCard(page, beforeDamage, 'Damage Roll');
    expect(await snapCard(page, `${label}-attack-card`, attack.id)).not.toBeNull();
    expect(await snapTallCard(page, `${label}-damage-card`, damage.id)).not.toBeNull();
    return { attack, damage };
}

test.describe.serial('Auto-fire hit ceiling (Tier B)', () => {
    for (const lineCase of CASES) {
        test(`${lineCase.line.toUpperCase()}: a Semi-Auto Burst lands at most ${lineCase.ceiling} hits, and the card shows why (#607)`, async ({ page }) => {
            await joinOrSkip(page);
            await prepareStage(page);
            const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false, 'require-combat-to-attack': false });
            const shooter = await createActor(page, {
                data: {
                    name: `Autogunner (${lineCase.line.toUpperCase()})`,
                    type: `${lineCase.line}-character`,
                    img: 'icons/svg/mystery-man.svg',
                    system: { gameSystem: lineCase.line, characteristics: { ballisticSkill: { base: 75, advance: 0, modifier: 0 } } },
                },
                compendiumItems: [{ uuid: lineCase.weaponUuid, equip: true }],
            });
            try {
                const weaponId = shooter.items['Autogun'] ?? '';
                expect(weaponId, 'the shooter holds the autogun').not.toBe('');

                // A 01 against BS 75 earns more hits than the rate of fire allows (DH2 8 DoS → 4; DH1 7 DoS → 1 + 3 extra).
                const capped = await semiAutoBurst(page, shooter.id, weaponId, () => 1, `auto-fire-${lineCase.line}-capped`);
                expect(capped.attack.html, 'the hit ceiling is on the attack card').toContain('data-hit-ceiling');
                expect(capped.attack.html).toContain('Rate of fire (semi-auto)');
                if (lineCase.firstHitRow) expect(capped.attack.html, 'an extra-hit cap leaves the first hit outside it').toContain('First hit');
                else expect(capped.attack.html, 'a total-hit cap has no first-hit row').not.toContain('First hit');
                expect(await hitsScored(page, capped.attack), 'the burst lands exactly its ceiling').toBe(lineCase.ceiling);
                recordCoverage('auto-fire.flow', `${lineCase.line}-capped` satisfies AutoFireFlow);

                // A roll one under the target only just passes: one hit, under the ceiling.
                const underCap = await semiAutoBurst(page, shooter.id, weaponId, (target) => Math.min(target, 95) - 1, `auto-fire-${lineCase.line}-under-cap`);
                expect(underCap.attack.html).toContain('data-hit-ceiling');
                expect(await hitsScored(page, underCap.attack), 'one hit, below the ceiling').toBe(1);
                recordCoverage('auto-fire.flow', `${lineCase.line}-under-cap` satisfies AutoFireFlow);
            } finally {
                await restoreSettings(page, settings);
                await deleteDocuments(page, { actors: [shooter.id] });
            }
        });
    }
    test('every flow has a case', () => {
        expect(CASES.flatMap((c) => [`${c.line}-capped`, `${c.line}-under-cap`])).toEqual([...AUTO_FIRE_FLOWS]);
    });
});
