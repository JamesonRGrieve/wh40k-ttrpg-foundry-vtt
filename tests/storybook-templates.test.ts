import Handlebars from 'handlebars';
import { describe, expect, it } from 'vitest';
import actionRollChatSrc from '../src/templates/chat/action-roll-chat.hbs?raw';
import damageRollChatSrc from '../src/templates/chat/damage-roll-chat.hbs?raw';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import gearSheetSrc from '../src/templates/item/item-gear-sheet.hbs?raw';
import armourSheetSrc from '../src/templates/item/item-armour-sheet.hbs?raw';
import weaponSheetSrc from '../src/templates/item/item-weapon-sheet.hbs?raw';
import activeEffectsPanelSrc from '../src/templates/item/panel/active-effects-panel.hbs?raw';
import activeModifiersPanelSrc from '../src/templates/components/active-modifiers-panel.hbs?raw';
import quickActionsBarSrc from '../src/templates/components/quick-actions-bar.hbs?raw';
import {
    mockActionRollData,
    mockActiveEffectsContext,
    mockArmourSheetContext,
    mockDamageRollData,
    mockGearSheetContext,
    mockModifiersPanel,
    mockQuickActionItem,
    mockRollData,
    mockWeaponSheetContext,
    renderTemplate,
} from '../stories/mocks';
import { initializeStoryHandlebars } from '../stories/template-support';

initializeStoryHandlebars();

function compileToElement(source: string, context: unknown): HTMLElement {
    const template = Handlebars.compile(source);
    return renderTemplate(template, context);
}

describe('storybook shared component templates', () => {
    it('renders active effects panel controls for non-embedded items', () => {
        const element = compileToElement(activeEffectsPanelSrc, mockActiveEffectsContext());

        expect(element.querySelector('[data-action="createEffect"]')).not.toBeNull();
        // The canonical effect-row partial uses `effectEdit` (matching the
        // BaseItemSheet action wiring); the legacy `editEffect` name was
        // never registered. Two effects → two edit buttons.
        expect(element.querySelectorAll('[data-action="effectEdit"]')).toHaveLength(2);
        expect(element.textContent).toContain('Blessed Ammunition');
    });

    it('hides active effect controls for embedded items', () => {
        const element = compileToElement(
            activeEffectsPanelSrc,
            mockActiveEffectsContext({
                item: { isEmbedded: true },
            }),
        );

        expect(element.querySelector('[data-action="createEffect"]')).toBeNull();
        expect(element.querySelector('[data-action="effectEdit"]')).toBeNull();
    });

    it('renders expanded modifier groups and counts', () => {
        const element = compileToElement(activeModifiersPanelSrc, mockModifiersPanel());

        expect(element.querySelector('.wh40k-modifier-count')?.textContent?.trim()).toBe('5');
        expect(element.querySelectorAll('[data-action="toggleModifier"]')).toHaveLength(2);
        expect(element.textContent).toContain('On Fire');
    });

    it('renders compact condition quick actions with stack and remove controls', () => {
        const item = mockQuickActionItem('condition');
        const element = compileToElement(quickActionsBarSrc, {
            item,
            system: item.system,
            compact: true,
            inSheet: false,
        });

        const actions = Array.from(element.querySelectorAll('[data-action]')).map((node) => node.getAttribute('data-action'));
        expect(actions).toEqual(expect.arrayContaining(['stackCondition', 'reduceCondition', 'removeCondition', 'postToChat', 'deleteItem']));
        expect(element.querySelector('span')).toBeNull();
    });

    it('renders in-sheet talent quick actions without chat/delete controls', () => {
        const item = mockQuickActionItem('talent');
        const element = compileToElement(quickActionsBarSrc, {
            item,
            system: item.system,
            compact: false,
            inSheet: true,
        });

        expect(element.querySelector('[data-action="itemRoll"]')).not.toBeNull();
        expect(element.querySelector('[data-action="editItem"]')).not.toBeNull();
        expect(element.querySelector('[data-action="postToChat"]')).toBeNull();
        expect(element.querySelector('[data-action="deleteItem"]')).toBeNull();
    });
});

describe('storybook chat card templates', () => {
    it('renders simple roll success with modifier breakdown', () => {
        const element = compileToElement(simpleRollChatSrc, mockRollData());

        expect(element.textContent).toContain('Ballistic Skill Test');
        expect(element.textContent).toContain('Routine (+20)');
        expect(element.textContent).toContain('Degrees of Success');
        expect(element.querySelector('.wh40k-roll-card__value--negative')?.textContent).toContain('-20');
    });

    it('renders damage roll assign button when target actor is present', () => {
        const element = compileToElement(damageRollChatSrc, mockDamageRollData());
        const button = element.querySelector('.roll-control__assign-damage');

        expect(button).not.toBeNull();
        expect(button?.getAttribute('data-target-uuid')).toBe('Actor.mock-target');
        expect(element.textContent).toContain('Tearing');
    });

    it('renders action roll controls and qualities', () => {
        const element = compileToElement(actionRollChatSrc, mockActionRollData());

        expect(element.querySelector('.roll-control__roll-damage')).not.toBeNull();
        expect(element.querySelector('.roll-control__refund')).not.toBeNull();
        expect(element.textContent).toContain('Active Qualities');
        expect(element.textContent).toContain('Suppressive');
    });
});

describe('storybook composed item sheet templates', () => {
    it('renders weapon sheet with ammo card and active effects partial', () => {
        const element = compileToElement(weaponSheetSrc, mockWeaponSheetContext());

        expect(element.querySelector('[data-action="rollDamage"]')).not.toBeNull();
        expect(element.textContent).toContain('Kraken Penetrator');
        expect(element.textContent).toContain('Machine Spirit Agitation');
    });

    it('renders armour sheet edit mode with AP grid and effects tab content', () => {
        const element = compileToElement(
            armourSheetSrc,
            mockArmourSheetContext({
                inEditMode: true,
            }),
        );

        expect(element.querySelector('input[name="system.armourPoints.head"]')).not.toBeNull();
        expect(element.querySelector('[data-action="toggleEditMode"]')).not.toBeNull();
        expect(element.textContent).toContain('Blessing of Saint Drusus');
    });

    it('renders gear sheet exhausted usage state and hides throne gelt when configured', () => {
        const exhausted = compileToElement(
            gearSheetSrc,
            mockGearSheetContext({
                usesExhausted: true,
                usesPercentage: 0,
                system: {
                    uses: 0,
                },
            }),
        );
        const hiddenCost = compileToElement(
            gearSheetSrc,
            mockGearSheetContext({
                hideThroneGelt: true,
                hasLimitedUses: false,
            }),
        );

        expect(exhausted.querySelector('[data-action="consumeUse"]')?.getAttribute('disabled')).not.toBeNull();
        expect(exhausted.querySelector('[data-exhausted="true"]')).not.toBeNull();
        expect(hiddenCost.textContent).not.toContain('Cost');
    });
});
