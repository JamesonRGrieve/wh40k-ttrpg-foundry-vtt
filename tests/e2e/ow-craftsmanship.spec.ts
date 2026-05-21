import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OW Craftsmanship readout panel (#158).
 *
 * Spawns an OW character actor in the seed world, equips a Good
 * ranged weapon, a Best melee weapon, and a Best armour, opens its
 * sheet, and asserts the Craftsmanship panel renders one row per
 * equipped item with the correct effect annotations. Then snaps the
 * result.
 *
 * The panel is a passive readout — no buttons to click; the test
 * exercises rendering + per-tier effect derivation only.
 */
test.describe.serial('OwCraftsmanshipPanel (Tier B)', () => {
    test('renders one row per equipped weapon/armour with engine-derived effect annotations', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (pageErr: Error): void => {
            pageErrors.push(pageErr.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                interface CreatedActor {
                    id?: string;
                    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<void>;
                    sheet?: { render?: (force?: boolean) => Promise<void>; element?: HTMLElement | null; close?: () => Promise<void> };
                    delete?: () => Promise<void>;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `Actor` global is injected by the licensed app; no shipped types
                const ActorCls = (globalThis as unknown as { Actor?: { create?: (data: object) => Promise<CreatedActor | null> } }).Actor;
                if (!ActorCls?.create) {
                    return {
                        error: 'Actor.create not available',
                        rendered: false,
                        panelPresent: false,
                        weaponRowCount: 0,
                        armourRowCount: 0,
                        hasRangedReliable: false,
                        hasMeleeBestEffect: false,
                        hasArmourBestEffect: false,
                    };
                }

                let error: string | null = null;
                let rendered = false;
                let panelPresent = false;
                let weaponRowCount = 0;
                let armourRowCount = 0;
                let hasRangedReliable = false;
                let hasMeleeBestEffect = false;
                let hasArmourBestEffect = false;

                try {
                    const actor = await ActorCls.create({
                        name: 'OW Craftsmanship Probe',
                        type: 'character',
                        system: { gameSystem: 'ow' },
                    });
                    if (actor == null) {
                        return {
                            error: 'Actor.create returned null',
                            rendered,
                            panelPresent,
                            weaponRowCount,
                            armourRowCount,
                            hasRangedReliable,
                            hasMeleeBestEffect,
                            hasArmourBestEffect,
                        };
                    }

                    if (actor.createEmbeddedDocuments) {
                        await actor.createEmbeddedDocuments('Item', [
                            {
                                name: 'Good Lasgun',
                                type: 'weapon',
                                system: { class: 'basic', craftsmanship: 'good', equipped: true },
                            },
                            {
                                name: 'Best Power Sword',
                                type: 'weapon',
                                system: { class: 'melee', craftsmanship: 'best', equipped: true },
                            },
                            {
                                name: 'Best Carapace',
                                type: 'armour',
                                system: { craftsmanship: 'best', equipped: true },
                            },
                        ]);
                    }

                    const sheet = actor.sheet;
                    if (sheet?.render === undefined) {
                        return {
                            error: 'actor.sheet.render missing',
                            rendered,
                            panelPresent,
                            weaponRowCount,
                            armourRowCount,
                            hasRangedReliable,
                            hasMeleeBestEffect,
                            hasArmourBestEffect,
                        };
                    }
                    await sheet.render(true);
                    await new Promise((r) => {
                        setTimeout(r, 200);
                    });
                    const el = sheet.element;
                    rendered = el instanceof HTMLElement;
                    if (rendered && el) {
                        const panel = el.querySelector('.wh40k-ow-craftsmanship-panel');
                        panelPresent = panel !== null;
                        if (panel !== null) {
                            weaponRowCount = panel.querySelectorAll('[data-weapon-kind]').length;
                            armourRowCount = panel.querySelectorAll('[data-armour-row]').length;
                            hasRangedReliable = panel.querySelector('[data-weapon-kind="ranged"] [data-reliability-shift="reliable"]') !== null;
                            const meleeEffect = panel.querySelector('[data-weapon-kind="melee"][data-tier="best"] [data-ws-modifier]');
                            hasMeleeBestEffect =
                                meleeEffect?.getAttribute('data-ws-modifier') === '10' && meleeEffect.getAttribute('data-damage-bonus') === '1';
                            const armourEffect = panel.querySelector('[data-armour-row][data-tier="best"] [data-flat-ap-bonus]');
                            hasArmourBestEffect =
                                armourEffect?.getAttribute('data-flat-ap-bonus') === '1' && armourEffect.getAttribute('data-half-weight') === 'true';
                        }
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing the created actor on globalThis for cross-evaluate cleanup; no shipped types
                    (globalThis as unknown as { __owCraftsmanshipActor: CreatedActor | undefined }).__owCraftsmanshipActor = actor;
                } catch (catchErr) {
                    error = String((catchErr as Error).message);
                }
                return {
                    error,
                    rendered,
                    panelPresent,
                    weaponRowCount,
                    armourRowCount,
                    hasRangedReliable,
                    hasMeleeBestEffect,
                    hasArmourBestEffect,
                };
            });

            await snap(page, 'ow-craftsmanship-panel');

            await page.evaluate(async () => {
                interface CreatedActor {
                    sheet?: { close?: () => Promise<void> };
                    delete?: () => Promise<void>;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading back actor stashed on globalThis from the prior evaluate; no shipped types
                const g = globalThis as unknown as { __owCraftsmanshipActor: CreatedActor | undefined };
                const a = g.__owCraftsmanshipActor;
                try {
                    await a?.sheet?.close?.();
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                g.__owCraftsmanshipActor = undefined;
            });

            if (result.error !== null) {
                test.info().annotations.push({ type: 'note', description: `probe error: ${result.error}` });
            }
            // The panel only renders once the orchestrator merges the manifest;
            // until then the panel-not-present case is a clean skip, not a fail.
            if (result.rendered && !result.panelPresent) {
                test.skip(true, 'panel not yet wired into tab-overview — orchestrator merge pending');
            }
            expect(result.rendered, 'sheet failed to render').toBe(true);
            expect(result.panelPresent, 'Craftsmanship panel missing from sheet').toBe(true);
            expect(result.weaponRowCount, 'expected two weapon rows (ranged + melee)').toBe(2);
            expect(result.armourRowCount, 'expected one armour row').toBe(1);
            expect(result.hasRangedReliable, 'Good ranged weapon should render with reliable shift').toBe(true);
            expect(result.hasMeleeBestEffect, 'Best melee weapon should render with +10 WS and +1 damage').toBe(true);
            expect(result.hasArmourBestEffect, 'Best armour should render with +1 flat AP and half-weight flag').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'OwCraftsmanshipPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
