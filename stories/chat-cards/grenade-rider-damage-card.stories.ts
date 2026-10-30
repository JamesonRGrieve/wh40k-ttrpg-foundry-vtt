import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { buildDamageCardRider, type GrenadeItemView, type GrenadeLabels } from '../../src/module/applications/prompts/grenade-throw-view.ts';
import type { GrenadeRiderData } from '../../src/module/rules/grenade-rider.ts';
import { riderFixture } from '../../src/module/testing/grenade-rider-fixture.ts';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { formatKey, localizeKey } from '../mocks/lang-localize';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * A rider grenade that deals damage (#622): it throws, scatters and rolls its damage
 * like any weapon, and its rider then applies to everyone the blast struck. The damage
 * card states the rider after the hits, naming each creature struck once. The rider is
 * the Rad Grenade's as DH2 prints it.
 */
initializeStoryHandlebars();

const LABELS: GrenadeLabels = {
    localize: (key, params) =>
        params === undefined ? localizeKey(key) : formatKey(key, Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)]))),
    characteristic: (key) => (key === 'toughness' ? 'Toughness' : key),
    lang: 'en',
};

const RAD_RIDER: GrenadeRiderData = riderFixture({
    test: { characteristic: 'toughness', modifier: -20 },
    effect: 'Anyone hit, hurt or not, tests Toughness at −20 or loses 2d10 Toughness.',
});

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
            rollId: 'roll-rad',
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
        await expect(rider.querySelector('[data-grenade-effect]')?.textContent).toContain('loses 2d10 Toughness');
        // Resolve Rider (#623) rolls each creature struck from this card's stored roll.
        const resolve = view.getByRole('button', { name: /Resolve Rider/i });
        await expect(resolve.classList.contains('roll-control__resolve-rider')).toBe(true);
        await expect(resolve.dataset['rollId']).toBe('roll-rad');
    },
};

/** The chat sidebar's card width. */
const CHAT_CARD_WIDTH_PX = 300;

const TEARS: GrenadeItemView = {
    id: 'tears',
    name: 'Tears of the Emperor',
    system: {
        rider: riderFixture({
            duration: { kind: 'encounter', base: 0, formula: '' },
            effect: 'A psyker hit rolls for Perils of the Warp.',
        }),
        effectiveSpecial: new Set(['blast-2', 'sanctified']),
        fullDamageFormula: '1d10',
        damageTypeAbbr: 'X',
        qualitiesArray: [],
    },
};

/**
 * At the chat sidebar's width a long value ("Until the end of the encounter") wraps
 * beside its label, never into it: the row labels stay on one line. Tears of the Emperor
 * has no test and no condition, so it offers nothing to resolve.
 */
export const TearsRowLabelsOnOneLine: Story = {
    render: () => {
        const frame = document.createElement('div');
        frame.style.width = `${CHAT_CARD_WIDTH_PX}px`;
        frame.append(
            renderSheet(
                damageRollChatSrc,
                mockDamageRollData({
                    weaponName: 'Tears of the Emperor',
                    gameSystem: 'dh2',
                    rollId: 'roll-tears',
                    hits: [hit('Heretic', 5)],
                    damageRider: buildDamageCardRider(TEARS, ['Heretic'], LABELS),
                }),
            ),
        );
        return frame;
    },
    play: async ({ canvasElement }) => {
        const labels = Array.from(canvasElement.querySelectorAll<HTMLElement>('[data-grenade-row-label]'));
        await expect(labels.map((label) => label.textContent.trim())).toEqual(['Area', 'Test', 'Duration']);
        // Count each label's line boxes: a wrapped "Duration" would lay out on two.
        const lineCounts = labels.map((label) => {
            const range = document.createRange();
            range.selectNodeContents(label);
            return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
        });
        await expect(lineCounts).toEqual([1, 1, 1]);
        // The long duration wraps in its own column instead.
        const duration = labels.at(-1)?.nextElementSibling;
        await expect(duration?.textContent.trim()).toBe('Until the end of the encounter');
        await expect(canvasElement.querySelector('.roll-control__resolve-rider')).toBeNull();
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
