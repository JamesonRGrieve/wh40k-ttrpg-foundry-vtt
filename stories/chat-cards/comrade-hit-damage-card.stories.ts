import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Only War (#152): a successful hit roll on doubles against a PC
 * whose Comrade is in Cohesion strikes the Comrade instead — one hit of the attack.
 * The damage card states it above the hits that still land on the PC.
 */
initializeStoryHandlebars();

const meta: Meta = { title: 'Chat/Comrade Hit on the Damage Card (#152)' };
export default meta;
type Story = StoryObj;

function card(comradeHit: { actorUuid: string; comradeName: string } | null): HTMLElement {
    const frame = document.createElement('div');
    frame.style.width = '300px';
    frame.append(renderSheet(damageRollChatSrc, mockDamageRollData({ weaponName: 'Lasgun', gameSystem: 'ow', targetName: 'Trooper Halden', comradeHit })));
    return frame;
}

export const StrikesComrade: Story = {
    name: 'Doubles — one hit strikes the Comrade instead',
    render: () => card({ actorUuid: 'Actor.halden', comradeName: 'Comrade Jaeger' }),
    play: async ({ canvasElement }) => {
        const row = canvasElement.querySelector('[data-damage-comrade-hit]');
        await expect(row?.textContent).toContain('Comrade Jaeger');
        await expect(row?.textContent).toContain(localizeKey('WH40K.OW.Comrade.Hit.StrikesComrade').split('{comrade}')[0] ?? '');
    },
};

export const NoComradeHit: Story = {
    name: 'No doubles — no Comrade row',
    render: () => card(null),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-damage-comrade-hit]')).toBeNull();
    },
};
