import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

interface DropdownState {
    rendered: boolean;
    optionCount: number;
    optionLabels: string[];
    selectedValue: string | null;
}

interface ProbeResult {
    error: string | null;
    state: DropdownState | null;
}

interface UnifiedRollDialogInstance {
    render: (force: boolean) => Promise<void>;
    element?: HTMLElement;
    close?: () => Promise<void>;
}
interface UnifiedRollDialogModule {
    default: new (actionData: object) => UnifiedRollDialogInstance;
}

interface FakeCombat {
    combatants: Array<{ id: string; name: string; actorId: string }>;
}

/**
 * e2e coverage for #250 — the weapon Roll Test panel's "Select Target" control is
 * a dropdown of the active Combat's combatants (game.combat.combatants), not
 * Foundry canvas token-targeting.
 *
 * Opens the real UnifiedRollDialog against a WeaponRollData-shaped roll (so
 * `rollType === 'weapon'` and the weapon panel renders), with game.combat
 * stubbed to a two-combatant roster, and asserts the combatant `<select>` renders
 * with one option per combatant (plus the "no target" entry).
 */
test.describe.serial('weapon target combatant dropdown (#250)', () => {
    test('renders a dropdown of the active combat roster', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await page.evaluate(async (): Promise<ProbeResult> => {
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            const mod = (await import(/* @vite-ignore */ modUrl)) as UnifiedRollDialogModule;
            const Cls = mod.default;
            if (typeof Cls !== 'function') return { error: 'UnifiedRollDialog default export missing', state: null };

            // Stub the active combat with a synthetic two-combatant roster — the
            // dropdown sources its options from game.combat.combatants.
            const fakeCombat: FakeCombat = {
                combatants: [
                    { id: 'c1', name: 'Cultist Alpha', actorId: 'a1' },
                    { id: 'c2', name: 'Cultist Beta', actorId: 'a2' },
                ],
            };
            // eslint-disable-next-line no-restricted-syntax -- boundary: overriding the Foundry `game.combat` global getter for this e2e probe
            const gameObj = game as unknown as { combat?: FakeCombat };
            const prior = Object.getOwnPropertyDescriptor(gameObj, 'combat');
            Object.defineProperty(gameObj, 'combat', { configurable: true, get: () => fakeCombat });

            const sourceActor = {
                name: 'Probe',
                img: 'icons/svg/mystery-man.svg',
                getActiveTokens: () => [],
                skills: {},
                characteristics: { ballisticSkill: { total: 40, label: 'Ballistic Skill', short: 'BS' } },
                items: { find: () => undefined, filter: () => [] },
            };

            // Named WeaponRollData so dialog.rollType === 'weapon' (see get rollType()).
            class WeaponRollData {
                name = 'Hand Cannon Attack';
                nameOverride = 'Hand Cannon Attack';
                type = 'Weapon';
                baseTarget = 40;
                sourceActor = sourceActor;
                actor = sourceActor;
                targetActor: { name?: string } | null = null;
                distance = 0;
                rangeBonus = 0;
                action = 'Standard Attack';
                actions: Record<string, string> = {};
                modifiers: Record<string, number> = { modifier: 0, attack: 0 };
                weapon = {
                    name: 'Hand Cannon',
                    img: 'icons/svg/item-bag.svg',
                    isRanged: true,
                    isThrown: false,
                    system: { attack: { rateOfFire: { single: true, semi: 0, full: 0 }, range: 30 }, special: [] },
                };
                weapons = [];
                calculateTotalModifiers = async (): Promise<void> => {};
                finalize = async (): Promise<void> => {};
                update = async (): Promise<void> => {};
                hasAttackSpecial = (): boolean => false;
            }

            const actionData = {
                name: 'Hand Cannon Attack',
                rollData: new WeaponRollData(),
                performActionAndSendToChat: async (): Promise<void> => {},
                calculateSuccessOrFailure: async (): Promise<void> => {},
            };

            let state: DropdownState | null = null;
            let error: string | null = null;
            try {
                const dialog = new Cls(actionData);
                await dialog.render(true);
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 120);
                });
                const root = dialog.element;
                if (!(root instanceof HTMLElement)) {
                    error = 'dialog.element is not an HTMLElement';
                } else {
                    const select = root.querySelector<HTMLSelectElement>('select[name="targetCombatantId"]');
                    state = {
                        rendered: select !== null,
                        optionCount: select?.options.length ?? 0,
                        optionLabels: select ? Array.from(select.options).map((o) => o.text.trim()) : [],
                        selectedValue: select?.value ?? null,
                    };
                }
                if (typeof dialog.close === 'function') await dialog.close();
            } catch (err) {
                error = `dialog render threw: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
                if (prior) Object.defineProperty(gameObj, 'combat', prior);
                else delete gameObj.combat;
            }
            return { error, state };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const dropdown = result.state;
        expect(dropdown, 'dropdown state returned').not.toBeNull();
        if (dropdown === null) return;

        expect(dropdown.rendered, 'combatant dropdown renders').toBe(true);
        // "No target" + one option per combatant.
        expect(dropdown.optionCount).toBe(3);
        expect(dropdown.optionLabels.join(' | ')).toContain('Cultist Alpha');
        expect(dropdown.optionLabels.join(' | ')).toContain('Cultist Beta');

        await snap(page, 'target-combatant-dropdown');
    });
});
