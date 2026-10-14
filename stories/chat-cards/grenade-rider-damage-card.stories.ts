import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { buildDamageCardRider, type GrenadeItemView, type GrenadeLabels } from '../../src/module/applications/prompts/grenade-throw-view.ts';
import type { GrenadeRiderData } from '../../src/module/rules/grenade-rider.ts';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { formatKey, localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * A rider grenade that deals damage (#622): it throws, scatters and rolls its damage
 * like any weapon, and its rider then applies to everyone the blast struck. The damage
 * card states the rider after the hits, naming each creature struck once. The rider is
 * the Rad Grenade's as DH2 Enemies Within p.44 prints it.
 */
initializeStoryHandlebars();

const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? localizeKey(key) : formatKey(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]))),
    characteristic: (key) => (key === 'toughness' ? 'Toughness' : key),
};

const RAD_RIDER: GrenadeRiderData = {
    test: { characteristic: 'toughness', modifier: -20 },
    area: { size: '', measure: 'radius' },
    duration: { kind: '', base: 0, formula: '' },
    effectRollShift: { perDegree: 0, max: 0 },
    effect: 'When a character is struck by an attack from this weapon (whether or not he suffers damage), he must immediately make a Hard (–20) Toughness test or suffer 2d10 Toughness damage.',
};

const RAD: GrenadeItemView = {
    id: 'rad',
    name: 'Rad Grenade',
    system: {
        rider: RAD_RIDER,
        effectiveSpecial: new Set(['blast-2']),
        fullDamageFormula: '1d10',
        damageTypeAbbr: 'E',
        qualitiesArray: [{ label: 'Blast', level: 2 }],
    },
};

/** One area hit on its own creature, as the damage card renders it. */
function hit(targetName: string, total: number): object {
    return {
        location: 'body',
        targetName,
        targetUuid: `Actor.${targetName}`,
        damageRoll: { formula: '1d10', result: String(total) },
        modifiers: {},
        totalDamage: total,
        damageType: 'Energy',
        totalPenetration: 0,
        totalFatigue: 0,
        effects: [],
        righteousFury: [],
    };
}

function card(withRider: boolean): HTMLElement {
    const struck = ['Heretic', 'Accomplice'];
    return renderSheet(
        damageRollChatSrc,
        mockDamageRollData({
            weaponName: 'Rad Grenade',
            gameSystem: 'dh2',
            hits: struck.map((name, index) => hit(name, 4 + index)),
            damageRider: withRider ? buildDamageCardRider(RAD, struck, LABELS) : null,
        }),
    );
}

const meta: Meta = { title: 'Chat/Grenade Rider on the Damage Card (#622)' };
export default meta;

type Story = StoryObj;

/** The Rad Grenade's damage card: two hits, then its rider for both creatures struck. */
export const RadGrenadeRiderFollowsDamage: Story = {
    render: () => card(true),
    play: async ({ canvasElement }) => {
        const rider = canvasElement.querySelector<HTMLElement>('[data-damage-rider]');
        if (rider === null) throw new Error('no rider on the damage card');
        // After the damage: the rider block follows every hit.
        const hits = Array.from(canvasElement.querySelectorAll('[data-hit-target]'));
        await expect(hits.length).toBe(2);
        const lastHit = hits.at(-1);
        await expect(lastHit !== undefined && (lastHit.compareDocumentPosition(rider) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
        const view = within(rider);
        await expect(view.getByText('Rider — after the damage')).toBeTruthy();
        await expect(rider.querySelector('[data-damage-rider-struck]')?.textContent).toContain('Heretic, Accomplice');
        await expect(rider.querySelector('[data-grenade-test]')?.textContent).toBe('Toughness -20');
        await expect(view.getByText('2 m radius')).toBeTruthy();
        await expect(rider.querySelector('[data-grenade-effect]')?.textContent).toContain('2d10 Toughness damage');
    },
};

/** A damage grenade with no rider (a Frag Grenade) shows no rider block. */
export const NoRiderNoBlock: Story = {
    render: () => card(false),
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-damage-rider]')).toBeNull();
        await expect(canvasElement.querySelectorAll('[data-hit-target]').length).toBe(2);
    },
};
