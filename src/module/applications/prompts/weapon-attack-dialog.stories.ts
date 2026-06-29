import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/weapon-roll-prompt.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';

/**
 * WeaponAttackDialog renders `weapon-roll-prompt.hbs`. The template has two
 * branches driven by `weaponSelect`: a multi-weapon picker (akimbo / multiple
 * readied weapons) and the per-weapon attack configuration (attack type,
 * modifiers, range bracket). These stories cover both branches plus the
 * ranged-only range/melta sub-panel.
 */

interface AttackArgs {
    weaponSelect: boolean;
    weapons?: Array<{ id: string; name: string; img: string; isSelected: boolean; items?: Array<{ name: string }> }>;
    weapon?: {
        name: string;
        img: string;
        usesAmmo: boolean;
        isRanged: boolean;
        items?: Array<{ name: string; isAttackSpecial: boolean }>;
    };
    sourceActor?: { name: string };
    baseChar?: string;
    baseTarget?: number;
    displayTarget?: number;
    ammoText?: string;
    fireRate?: number;
    actions?: Record<string, string>;
    difficulties?: Record<string, string>;
    aims?: Record<string, string>;
    canAim?: boolean;
    distance?: number;
    rangeName?: string;
    rangeBonus?: number;
    isMeltaRange?: boolean;
    isCalledShot?: boolean;
    locations?: Record<string, string>;
    isLasWeapon?: boolean;
    lasModes?: string[];
    modifiers?: { difficulty: number; aim: number; modifier: number; attack?: number };
}

const DIFFICULTIES = { '30': 'Easy (+30)', '10': 'Routine (+10)', '0': 'Standard (+0)', '-10': 'Hard (-10)', '-30': 'Punishing (-30)' };
const ACTIONS = { standard: 'Standard Attack', semi: 'Semi-Auto Burst', full: 'Full Auto Burst' };
const AIMS = { '0': 'No Aim', '10': 'Aim (Half) +10', '20': 'Aim (Full) +20' };

const BOLTER: AttackArgs['weapon'] = {
    name: 'Godwyn-Pattern Bolter',
    img: 'icons/weapons/guns/gun-rifle-fantasy.webp',
    usesAmmo: true,
    isRanged: true,
    items: [{ name: 'Tearing', isAttackSpecial: true }],
};

const meta = {
    title: 'Prompts/WeaponAttackDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        weaponSelect: false,
        weapon: BOLTER,
        sourceActor: { name: 'Interrogator Vane' },
        baseChar: 'BS',
        baseTarget: 48,
        // Live aggregate shown at the top: base BS 48 + Short Range +10 = 58 (#382).
        displayTarget: 58,
        ammoText: 'Bolt Shells (24)',
        fireRate: 3,
        actions: ACTIONS,
        difficulties: DIFFICULTIES,
        aims: AIMS,
        canAim: true,
        distance: 20,
        rangeName: 'Short Range',
        rangeBonus: 10,
        isMeltaRange: false,
        modifiers: { difficulty: 0, aim: 0, modifier: 0 },
    },
} satisfies Meta<AttackArgs>;
export default meta;

type Story = StoryObj<AttackArgs>;

/** A configured ranged attack: header, target number, attack-type + modifier panels. */
export const RangedAttack: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Godwyn-Pattern Bolter')).toBeTruthy();
        // Top target is the aggregate (base 48 + Short Range +10), not the bare characteristic.
        await expect(view.getByText('58')).toBeTruthy();
        await expect(view.getByText(/Short Range/)).toBeTruthy();
        assertField(canvasElement, 'distance', 20);
    },
};

/** Melta within short range surfaces the double-penetration callout. */
export const MeltaShortRange: Story = {
    args: {
        weapon: { name: 'Inferno Pistol', img: 'icons/weapons/guns/gun-pistol-flintlock.webp', usesAmmo: true, isRanged: true },
        baseChar: 'BS',
        baseTarget: 42,
        // base BS 42 + Point Blank +30 = 72 (#382).
        displayTarget: 72,
        ammoText: 'Melta Charge (3)',
        distance: 4,
        rangeName: 'Point Blank',
        rangeBonus: 30,
        isMeltaRange: true,
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Double penetration at this range/)).toBeTruthy();
    },
};

/** The multi-weapon picker branch (akimbo / multiple readied weapons). */
export const WeaponSelect: Story = {
    args: {
        weaponSelect: true,
        weapons: [
            { id: 'w-bolt', name: 'Bolt Pistol', img: 'icons/weapons/guns/gun-pistol-flintlock.webp', isSelected: true },
            { id: 'w-sword', name: 'Chainsword', img: 'icons/weapons/swords/sword-guard-purple.webp', isSelected: false, items: [{ name: 'Tearing' }] },
        ],
    },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Bolt Pistol')).toBeTruthy();
        await expect(view.getByText('Chainsword')).toBeTruthy();
    },
};
