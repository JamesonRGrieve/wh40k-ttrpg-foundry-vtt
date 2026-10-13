import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import actionRollChatSrc from '../src/templates/chat/action-roll-chat.hbs?raw';
import damageRollChatSrc from '../src/templates/chat/damage-roll-chat.hbs?raw';
import simpleRollChatSrc from '../src/templates/chat/simple-roll-chat.hbs?raw';
import { mockActionRollData, mockDamageRollData, mockRollData } from './mocks';
import { initializeStoryHandlebars } from './template-support';
import { renderSheet } from './test-helpers';

initializeStoryHandlebars();

const meta: Meta = {
    id: 'chat-roll-cards',
    title: 'Chat/General/Roll Cards',
};

export default meta;

type Story = StoryObj;

/** The global Spend-Fate re-roll variant, as ActionData.rerollOptions emits it. */
const fateRerollOption = { id: 'fate', kind: 'fate', label: 'Re-roll', modifier: 0, source: 'Fate', disabled: false, frequency: 'at-will' };

export const SimpleSuccess: Story = {
    name: 'Simple Roll / Success',
    render: () => renderSheet(simpleRollChatSrc, mockRollData()),
    // No re-roll options in the base mock → the re-roll/Fate controls stay hidden.
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

/**
 * A Dodge resolved against a burst (#414): the evasion test's card states what it
 * did to the attack, beside its sourced modifier breakdown and degrees.
 */
export const SimpleEvasionOutcome: Story = {
    name: 'Simple Roll / Evasion scored against the attack',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                rollData: { name: 'Dodge Test', type: 'Skill' },
                effectOutput: [{ name: 'Evasion', effect: 'Lucius Varn’s Dodge negates 3 of 4 hits' }],
            }),
        ),
    play: async ({ canvasElement }) => {
        const effect = canvasElement.querySelector('[data-roll-effect]');
        await expect(effect?.textContent).toContain('Evasion');
        await expect(effect?.textContent).toContain('negates 3 of 4 hits');
    },
};

/**
 * A successful Parry by a character with Counter Attack (#603): the card offers the
 * attack back at the opponent, carrying the parrying weapon and the talent's −20.
 */
export const SimpleParryCounterAttack: Story = {
    name: 'Simple Roll / Parry offers Counter Attack',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                rollData: { name: 'Parry Test', type: 'Skill' },
                effectOutput: [{ name: 'Evasion', effect: 'Lucius Varn’s Parry evades the attack' }],
                counterAttack: {
                    sourceName: 'Counter Attack',
                    attackModifier: -20,
                    limit: 'perRound',
                    actorUuid: 'Actor.lucius',
                    attackerUuid: 'Actor.heretic',
                    attackerName: 'Heretic',
                    weaponId: 'sword',
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        const button = canvasElement.querySelector<HTMLButtonElement>('.roll-control__counter-attack');
        await expect(button).not.toBeNull();
        await expect(button?.textContent).toContain('Heretic');
        await expect(button?.dataset['weaponId']).toBe('sword');
        await expect(button?.dataset['modifier']).toBe('-20');
        await expect(button?.dataset['limit']).toBe('perRound');
    },
};

/** A Parry with no Counter Attack hook offers nothing. */
export const SimpleParryWithoutCounterAttack: Story = {
    name: 'Simple Roll / Parry without Counter Attack',
    render: () => renderSheet(simpleRollChatSrc, mockRollData({ rollData: { name: 'Parry Test', type: 'Skill' } })),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('.roll-control__counter-attack')).toBeNull();
    },
};

export const SimpleSuccessWithFateControls: Story = {
    name: 'Simple Roll / Success + Fate (reroll & +DoS)',
    render: () => renderSheet(simpleRollChatSrc, mockRollData({ id: 'roll-fate-success', sourceFatePoints: 2, rerollOptions: [fateRerollOption] })),
    play: async ({ canvasElement }) => {
        // Success + a Fate re-roll option → both controls, wired to this roll's id.
        const reroll = canvasElement.querySelector('.roll-control__variant-reroll');
        const addDoS = canvasElement.querySelector('.roll-control__fate-add-dos');
        await expect(reroll).not.toBeNull();
        await expect(addDoS).not.toBeNull();
        await expect(reroll?.getAttribute('data-roll-id')).toBe('roll-fate-success');
        await expect(reroll?.getAttribute('data-variant-kind')).toBe('fate');
        await expect(addDoS?.getAttribute('data-roll-id')).toBe('roll-fate-success');
    },
};

export const SimpleFailureWithFateReroll: Story = {
    name: 'Simple Roll / Failure + Fate reroll',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                id: 'roll-fate-fail',
                sourceFatePoints: 3,
                rerollOptions: [fateRerollOption],
                rollData: { success: false, dos: 0, dof: 2, roll: { total: 78 } },
            }),
        ),
    play: async ({ canvasElement }) => {
        // Failure → reroll is offered; there is no Degree of Success to add.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).not.toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleFailureWithTalentReroll: Story = {
    name: 'Simple Roll / Failure + talent reroll (Keen Intuition) + Fate',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                id: 'roll-talent-fail',
                sourceFatePoints: 1,
                rerollOptions: [
                    { id: 'keen:at-will', kind: 'item', label: 'Keen Intuition', modifier: 0, source: 'Keen Intuition', disabled: false, frequency: 'at-will' },
                    fateRerollOption,
                ],
                rollData: { success: false, dos: 0, dof: 1, roll: { total: 55 } },
            }),
        ),
    play: async ({ canvasElement }) => {
        // A talent re-roll button renders SEPARATE from the global Fate one.
        const buttons = canvasElement.querySelectorAll('.roll-control__variant-reroll');
        await expect(buttons.length).toBe(2);
        await expect(buttons[0].getAttribute('data-variant-id')).toBe('keen:at-will');
        await expect(buttons[1].getAttribute('data-variant-kind')).toBe('fate');
    },
};

export const SimpleManualRollNoFateControls: Story = {
    name: 'Simple Roll / Manual entry suppresses re-roll controls',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({ id: 'roll-manual', sourceFatePoints: 3, rerollOptions: [fateRerollOption], rollData: { isManualRoll: true } }),
        ),
    play: async ({ canvasElement }) => {
        // A manually-entered physical roll can't be auto-rerolled → no buttons.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
        await expect(canvasElement.querySelector('.roll-control__fate-add-dos')).toBeNull();
    },
};

export const SimpleTargetOnly: Story = {
    name: 'Simple Roll / Target Only',
    render: () =>
        renderSheet(
            simpleRollChatSrc,
            mockRollData({
                sourceFatePoints: 3,
                rerollOptions: [fateRerollOption],
                rollData: {
                    isTargetOnly: true,
                    success: false,
                    activeModifiers: {
                        Aim: 10,
                    },
                },
            }),
        ),
    play: async ({ canvasElement }) => {
        // A target-only post has no resolved result yet → no re-roll controls even
        // when the actor has points to spend.
        await expect(canvasElement.querySelector('.roll-control__variant-reroll')).toBeNull();
    },
};

export const DamageWithAssignableHit: Story = {
    name: 'Damage Roll / Assignable',
    render: () => renderSheet(damageRollChatSrc, mockDamageRollData()),
};

/**
 * A natural 10 on the damage die: the hit's Righteous Fury entry carries the 1d5
 * critical-level roll and its looked-up effect. The card shows both; it never
 * printed them before (it read confirmation fields the data never had).
 */
export const DamageWithRighteousFury: Story = {
    name: 'Damage Roll / Righteous Fury',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                hits: [
                    {
                        location: 'Head',
                        damageRoll: { formula: '1d10+5', result: '10 + 5' },
                        modifiers: {},
                        totalDamage: 15,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [{ roll: { total: 4 }, effect: 'The target is knocked off their feet and Stunned for 1 round.' }],
                    },
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        const fury = canvasElement.querySelector('[data-righteous-fury]');
        await expect(fury).not.toBeNull();
        await expect(fury?.textContent).toContain('4');
        await expect(fury?.textContent).toContain('Stunned for 1 round');
        await expect(canvasElement.textContent).not.toContain('Not Confirmed');
    },
};

/**
 * A Warp Weapon hit against unwarded armour (#414): the effective damage ignores the
 * location's armour and cover, and the card says why; the assign button carries it on.
 */
export const DamageWarpWeaponIgnoresArmour: Story = {
    name: 'Damage Roll / Warp Weapon ignores armour',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                targetActor: { uuid: 'Actor.target', name: 'Cultist' },
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+4', result: '7 + 4' },
                        modifiers: {},
                        totalDamage: 11,
                        damageType: 'Energy',
                        totalPenetration: 0,
                        totalFatigue: 0,
                        effects: [],
                        hasEffective: true,
                        effectiveDamage: 8,
                        effectiveArmour: 0,
                        effectiveTb: 3,
                        armourIgnored: true,
                    },
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-armour-ignored]')?.textContent).toContain('Warp Weapon');
        await expect(canvasElement.querySelector<HTMLElement>('.roll-control__assign-damage')?.dataset['armourIgnored']).toBe('true');
    },
};

export const ActionSuccessWithControls: Story = {
    name: 'Action Roll / Success',
    render: () => renderSheet(actionRollChatSrc, mockActionRollData()),
};

export const ActionFailureWithoutDamage: Story = {
    name: 'Action Roll / Failure',
    render: () =>
        renderSheet(
            actionRollChatSrc,
            mockActionRollData({
                effectOutput: [],
                rollData: {
                    success: false,
                    dos: 0,
                    dof: 3,
                    roll: { total: 91 },
                    showDamage: false,
                    hitLocation: '',
                },
            }),
        ),
};
