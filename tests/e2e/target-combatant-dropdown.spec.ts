import { joinOrSkip } from './lib/join';
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
    /** The open dialog's element id, left open for the capture (#701). */
    dialogId?: string | null;
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
        await joinOrSkip(page);

        const result = await page.evaluate(async (): Promise<ProbeResult> => {
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            const mod = (await import(/* @vite-ignore */ modUrl)) as UnifiedRollDialogModule;
            // Every production caller hands the dialog a real RollData, so the probe extends one.
            const rollDataUrl = '/systems/wh40k-rpg/module/rolls/roll-data.js';
            const { WeaponRollData: RollDataBase } = (await import(/* @vite-ignore */ rollDataUrl)) as { WeaponRollData: new () => object };
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
                // An actor's items are an iterable collection; the attack's passive to-hit walks them.
                items: [],
                // Every actor carries its DataModel; this one has no passive modifier sources.
                system: {},
            };

            // Named WeaponRollData so dialog.rollType === 'weapon' (see get rollType()).
            class WeaponRollData extends RollDataBase {
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
                    // A weapon item's embedded modifications (none fitted).
                    items: [],
                    // A weapon's qualities are a Set on its DataModel (SetField), as the quality lookup reads them.
                    system: { attack: { rateOfFire: { single: true, semi: 0, full: 0 }, range: 30 }, special: new Set<string>() },
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
            let dialogId: string | null = null;
            try {
                const dialog = new Cls(actionData);
                await dialog.render(true);
                // Wait for the target dropdown to render (the assertions report a miss).
                await globalThis.wh40kE2E.pollUntil(() => dialog.element?.querySelector('select[name="targetCombatantId"]') != null);
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
                    // Left open: the capture below is of this dialog's dropdown; it closes after.
                    dialogId = root.id;
                }
            } catch (err) {
                error = `dialog render threw: ${err instanceof Error ? err.message : String(err)}`;
            } finally {
                if (prior) Object.defineProperty(gameObj, 'combat', prior);
                else delete gameObj.combat;
            }
            return { error, state, dialogId };
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

        // The capture is the Roll Test dialog carrying the dropdown (a bare snap() found no window: it had closed).
        const openDialogId = result.dialogId ?? '';
        expect(openDialogId, 'the dialog stayed open for the capture').not.toBe('');
        await page.locator(`#${openDialogId} select[name="targetCombatantId"]`).scrollIntoViewIfNeeded();
        // #701: the select shows its whole option text and the selection hint reads whole
        // (they read "Select a Ta" and "No target — tar…").
        const fit = await page.evaluate((id: string) => {
            const select = document.querySelector<HTMLSelectElement>(`#${id} [data-wh40k-hook="target-combatant-select"]`);
            const hint = document.querySelector<HTMLElement>(`#${id} [data-wh40k-hook="target-selection"]`);
            if (select === null || hint === null) throw new Error('target row not rendered');
            const style = getComputedStyle(select);
            const ctx = document.createElement('canvas').getContext('2d');
            if (ctx === null) throw new Error('no 2d context');
            ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            const widest = Math.max(...Array.from(select.options, (option) => ctx.measureText(option.text).width));
            const textRoom = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
            return {
                selectFits: select.scrollWidth <= select.clientWidth,
                optionsFit: widest <= textRoom + 1,
                detail: `widest option ${Math.round(widest)}px in ${Math.round(textRoom)}px`,
                hintFits: hint.scrollWidth <= hint.clientWidth,
                hintText: hint.textContent.trim(),
            };
        }, openDialogId);
        expect(fit.selectFits, 'the select scrolls its text').toBe(true);
        expect(fit.optionsFit, fit.detail).toBe(true);
        expect(fit.hintFits, `the hint is clipped: "${fit.hintText}"`).toBe(true);
        await snap(page, 'target-combatant-dropdown', { selector: `#${openDialogId}` });
        await page.evaluate(async (id: string) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.instances is the untyped V14 open-application registry
            const apps = (globalThis as unknown as { foundry: { applications: { instances: Map<string, { close: () => Promise<void> }> } } }).foundry
                .applications.instances;
            await apps.get(id)?.close();
        }, openDialogId);
    });
});
