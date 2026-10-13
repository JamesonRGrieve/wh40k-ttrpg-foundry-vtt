import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import damageRollChatSrc from '../../src/templates/chat/damage-roll-chat.hbs?raw';
import { mockDamageRollData } from '../mocks';
import { initializeStoryHandlebars } from '../template-support';
import { renderSheet } from '../test-helpers';

/**
 * Damage-card provenance for damage resolved at attack time (#608): the card names
 * the range band the distance picked, the table result drawn, or the weapon whose
 * damage was borrowed, and the row is hoverable through the rich `modifier` tooltip.
 * Labels are the en.json strings `describeDamageProvenance` produces in play.
 */
initializeStoryHandlebars();

const meta: Meta = {
    title: 'Chat/Damage Profile Provenance (#608)',
};

export default meta;

type Story = StoryObj;

const GAME_SYSTEMS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'] as const;

/** The hit fields the damage card reads. */
interface StoryHit {
    location: string;
    damageRoll?: { formula: string; result: string } | undefined;
    modifiers: Record<string, number>;
    totalDamage: number;
    damageType: string;
    totalPenetration: number;
    totalFatigue: number;
    effects: { name: string; effect: string }[];
    righteousFury: never[];
    profile: { provenance: { kind: string } } | null;
    profileLabel: string;
    profileTooltip: string;
}

/** A hit whose damage came from a resolved profile. */
function profileHit(kind: string, label: string, overrides: Partial<StoryHit> = {}): StoryHit {
    return {
        location: 'body',
        damageRoll: { formula: '6d10+12', result: '4 + 7 + 2 + 9 + 5 + 6 + 12' },
        modifiers: {},
        totalDamage: 45,
        damageType: 'energy',
        totalPenetration: 14,
        totalFatigue: 0,
        effects: [],
        righteousFury: [],
        profile: { provenance: { kind } },
        profileLabel: label,
        profileTooltip: JSON.stringify({ title: label, sources: [{ name: 'Penetration', value: 14 }] }),
        ...overrides,
    };
}

/** The card for a set of hits, as the damage path renders it. */
function card(hits: StoryHit[], gameSystem = 'dh1'): HTMLElement {
    return renderSheet(damageRollChatSrc, mockDamageRollData({ weaponName: 'Conversion Beamer', gameSystem, hits }));
}

/** The provenance row of the first hit. */
function profileRow(canvasElement: HTMLElement): HTMLElement | null {
    return canvasElement.querySelector<HTMLElement>('[data-damage-profile]');
}

const BAND_LABEL = 'Range band 3 of 3: beyond 50 m (target at 60 m)';

export const RangeBand: Story = {
    name: 'Range band — the band the distance picked',
    render: () => card([profileHit('band', BAND_LABEL, { effects: [{ name: 'Blast', effect: 'Everyone within 2m of the location is hit!' }] })]),
    play: async ({ canvasElement }) => {
        const row = profileRow(canvasElement);
        await expect(row).toBeTruthy();
        await expect(row?.getAttribute('data-damage-profile')).toBe('band');
        await expect(row?.textContent).toContain('Damage profile');
        await expect(row?.textContent).toContain(BAND_LABEL);
        await expect(row?.getAttribute('data-wh40k-tooltip')).toBe('modifier');
        await expect(JSON.parse(row?.getAttribute('data-wh40k-tooltip-data') ?? '{}')).toEqual({
            title: BAND_LABEL,
            sources: [{ name: 'Penetration', value: 14 }],
        });
    },
};

export const OutOfBand: Story = {
    name: 'Range band — beyond every band, no damage',
    render: () =>
        card([
            profileHit('out-of-band', 'No range band reaches 500 m: no damage', {
                damageRoll: undefined,
                totalDamage: 0,
                totalPenetration: 0,
            }),
        ]),
    play: async ({ canvasElement }) => {
        await expect(profileRow(canvasElement)?.getAttribute('data-damage-profile')).toBe('out-of-band');
        await expect(profileRow(canvasElement)?.textContent).toContain('No range band reaches 500 m');
    },
};

export const TableDraw: Story = {
    name: 'Table — the drawn result and its effect',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                weaponName: 'Callophean Psy-Engine',
                gameSystem: 'dh1',
                hits: [
                    profileHit('table', 'Callophean Psy-Engine Discharge: rolled 55', {
                        damageRoll: { formula: '3d10+10', result: '3 + 8 + 6 + 10' },
                        totalDamage: 27,
                        totalPenetration: 0,
                        effects: [
                            {
                                name: 'Callophean Psy-Engine Discharge',
                                effect: 'One target suffers 3d10+10 Energy damage as warp-lightning arcs from the director wand.',
                            },
                        ],
                    }),
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(profileRow(canvasElement)?.getAttribute('data-damage-profile')).toBe('table');
        await expect(profileRow(canvasElement)?.textContent).toContain('rolled 55');
        await expect(canvasElement.textContent).toContain('warp-lightning arcs from the director wand');
    },
};

export const BorrowedFromWielder: Story = {
    name: 'Borrowed — the wielder’s melee weapon',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                weaponName: 'Magna-Grapple',
                gameSystem: 'dw',
                hits: [
                    profileHit('wielder-melee', "Wielder's melee weapon: Dreadnought Close Combat Weapon", {
                        damageRoll: { formula: '2d10', result: '6 + 9' },
                        modifiers: { 'strength bonus': 10 },
                        totalDamage: 25,
                        damageType: 'impact',
                    }),
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(profileRow(canvasElement)?.getAttribute('data-damage-profile')).toBe('wielder-melee');
        await expect(profileRow(canvasElement)?.textContent).toContain('Dreadnought Close Combat Weapon');
        await expect(canvasElement.textContent).toContain('strength bonus');
    },
};

export const BorrowedFromMount: Story = {
    name: 'Borrowed — the mounted weapon pair',
    render: () =>
        renderSheet(
            damageRollChatSrc,
            mockDamageRollData({
                weaponName: 'Hadd-Pattern Tarantula Sentry Gun',
                gameSystem: 'dh1',
                hits: [
                    profileHit('mount', 'Mounted weapon: Hadd Tarantula Heavy Bolters', {
                        damageRoll: { formula: '2d10', result: '7 + 8' },
                        totalDamage: 15,
                        damageType: 'explosive',
                    }),
                ],
            }),
        ),
    play: async ({ canvasElement }) => {
        await expect(profileRow(canvasElement)?.textContent).toContain('Hadd Tarantula Heavy Bolters');
    },
};

export const FixedProfileHasNoRow: Story = {
    name: 'Fixed profile — no provenance row',
    render: () => card([profileHit('band', '', { profile: null })]),
    play: async ({ canvasElement }) => {
        await expect(profileRow(canvasElement)).toBeNull();
    },
};

/** The same band card under every game line, so a line-specific chrome regression shows. */
export const AllSystems: Story = {
    name: 'Range band — all six game lines',
    render: () => {
        const root = document.createElement('div');
        for (const gameSystem of GAME_SYSTEMS) root.appendChild(card([profileHit('band', BAND_LABEL)], gameSystem));
        return root;
    },
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-damage-profile="band"]');
        await expect(rows.length).toBe(GAME_SYSTEMS.length);
    },
};
