import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import type { SystemId } from '../mocks/extended';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * A won grapple Damage Opponent on the damage card (#665; DH2): the
 * controller's unarmed hit, on the line's location, with its Strength Bonus as a
 * sourced row, the level of Fatigue it adds as its own row naming its source, and
 * the option stated as the hit's effect. A hit with no Fatigue shows no Fatigue row.
 */
initializeStoryHandlebars();

const meta: Meta = { title: 'Chat/Grapple Damage Card (#665)' };
export default meta;
type Story = StoryObj;

interface HitArgs {
    location: string;
    fatigue: number;
    effect: string;
}

/** The damage card a Damage Opponent posts, at the chat sidebar's width. */
function card(gameSystem: SystemId, hit: HitArgs): HTMLElement {
    const hits = [
        {
            location: hit.location,
            targetName: 'Cultist',
            damageRoll: { formula: '1d5-3', result: '2 - 3' },
            modifiers: { 'strength bonus': 4 },
            totalDamage: 3,
            damageType: 'impact',
            totalPenetration: 0,
            totalFatigue: hit.fatigue,
            fatigueSource: hit.fatigue > 0 ? localizeKey('WH40K.Grapple.DamageOpponent') : '',
            effects: hit.fatigue > 0 ? [{ name: localizeKey('WH40K.Grapple.DamageOpponent'), effect: hit.effect }] : [],
            righteousFury: [],
            hasEffective: true,
            effectiveDamage: 0,
            effectiveArmour: 0,
            effectiveTb: 3,
            dos: 0,
        },
    ];
    const el = renderSheet(
        damageRollChatSrc,
        mockDamageRollData({ weaponName: 'Damage Opponent: Unarmed', gameSystem, targetName: 'Cultist', hits, canReplaceDie: true }),
    );
    const frame = document.createElement('div');
    frame.style.width = '300px';
    frame.append(el);
    return frame;
}

const BODY_EFFECT = 'Won the grapple test: the unarmed hit lands on the Body, with 1 level of Fatigue.';

/** DH2: the hit on the Body, its Strength Bonus row, and +1 Fatigue from Damage Opponent. */
export const DamageOpponentHit: Story = {
    render: () => card('dh2', { location: 'body', fatigue: 1, effect: BODY_EFFECT }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('Damage Opponent: Unarmed');
        await expect(canvasElement.textContent).toContain('1d5-3');
        await expect(canvasElement.textContent).toContain('strength bonus');
        const fatigue = canvasElement.querySelector('[data-damage-fatigue]');
        await expect(fatigue?.textContent).toContain(localizeKey('WH40K.Chat.Damage.Fatigue'));
        await expect(fatigue?.querySelector('[data-damage-fatigue-value]')?.textContent.trim()).toBe('+1');
        await expect(fatigue?.querySelector('[data-damage-fatigue-source]')?.textContent).toBe('Damage Opponent');
        await expect(canvasElement.textContent).toContain(BODY_EFFECT);
        // The grapple test is not an attack roll: no DoS to swap for a damage die.
        await expect(canvasElement.querySelector('[data-action="replaceDamageDieWithDoS"]')).toBeNull();
        // The Fatigue rides to Assign Damage with the hit.
        await expect(canvasElement.querySelector<HTMLElement>('.roll-control__assign-damage')?.dataset['totalFatigue']).toBe('1');
    },
};

/** DH1's injure names no location: the hit lands where the test roll put it. */
export const DH1RolledLocation: Story = {
    render: () =>
        card('dh1', {
            location: 'leftArm',
            fatigue: 1,
            effect: 'Won the grapple test: the unarmed hit lands where the test roll puts it, with 1 level of Fatigue.',
        }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.textContent).toContain('where the test roll puts it');
        await expect(canvasElement.querySelector<HTMLElement>('.roll-control__assign-damage')?.dataset['location']).toBe('leftArm');
    },
};

/** An ordinary hit with no Fatigue shows no Fatigue row. */
export const NoFatigueRow: Story = {
    render: () => card('dh2', { location: 'body', fatigue: 0, effect: '' }),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-damage-fatigue]')).toBeNull();
    },
};

const LINES: SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw'];

/** The same hit under each line that prints Damage Opponent. */
export const PerSystem: Story = {
    render: () => {
        const root = document.createElement('div');
        for (const line of LINES) root.append(card(line, { location: 'body', fatigue: 1, effect: BODY_EFFECT }));
        return root;
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelectorAll('[data-damage-fatigue]').length).toBe(LINES.length);
    },
};
