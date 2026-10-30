/**
 * Storybook stories for the weapon chat card (`weapon-card-chat.hbs`): the weapon's
 * stats, qualities and its Attack / Damage / Reload actions.
 *
 * Stories cover:
 *   1. Damaging       — a damaging weapon offers Attack, Damage and Reload.
 *   2. NoDamage       — a weapon that deals no damage (#601) shows its dash and
 *                       offers no Damage button; Attack stays.
 *   3. AutoApplyDamage — with auto-apply-damage on (#248) the Damage button hides.
 *   4. PerSystem      — the no-damage card framed under each of the six FFG lines.
 *   5. ChatWidth      — at the chat sidebar's width no stat label or action button
 *                       wraps (labels broke mid-word as "DAMAG E" / "REL OAD", and
 *                       Attack stacked one letter per line beside Damage and Reload).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './weapon-card-chat.hbs?raw';

type SystemId = 'bc' | 'dh1' | 'dh2' | 'dw' | 'ow' | 'rt';

interface QualityRow {
    label: string;
    level: number | null;
    description: string;
}

interface WeaponCardItem {
    uuid: string;
    name: string;
    img: string;
    system: {
        craftsmanship: string;
        classLabel: string;
        typeLabel: string;
        craftsmanshipLabel: string;
        damageLabel: string;
        damage: { penetration: number };
        isRangedWeapon: boolean;
        hasRange: boolean;
        rangeLabel: string;
        rateOfFireLabel: string;
        usesAmmo: boolean;
        clip: { value: number };
        effectiveClipMax: number;
        reloadLabel: string;
        craftsmanshipModifiers: { toHit: number; damage: number };
        effectiveSpecial: Set<string>;
        qualitiesArray: QualityRow[];
        description: { value: string };
        /** The structured reference every DescriptionTemplate item carries. */
        source: { book: string; page: string; url: string };
    };
}

interface WeaponCardCtx {
    item: WeaponCardItem;
    hasActions: boolean;
    autoApplyDamage: boolean;
    noDamage: boolean;
    gameSystem?: SystemId;
}

function weapon(name: string, damageLabel: string, qualities: QualityRow[], ranged: { range: string; rof: string; clip: number } | null): WeaponCardItem {
    return {
        uuid: `Item.${name.replace(/\W/gu, '')}`,
        name,
        img: 'icons/svg/sword.svg',
        system: {
            craftsmanship: 'common',
            classLabel: ranged === null ? 'Thrown' : 'Pistol',
            typeLabel: ranged === null ? 'Primitive' : 'Flame',
            craftsmanshipLabel: 'Common',
            damageLabel,
            damage: { penetration: damageLabel === '—' ? 0 : 2 },
            isRangedWeapon: ranged !== null,
            hasRange: true,
            rangeLabel: ranged?.range ?? '10m',
            rateOfFireLabel: ranged?.rof ?? 'S/–/–',
            usesAmmo: ranged !== null,
            clip: { value: ranged?.clip ?? 0 },
            effectiveClipMax: ranged?.clip ?? 0,
            reloadLabel: '2 Full',
            craftsmanshipModifiers: { toHit: 0, damage: 0 },
            effectiveSpecial: new Set(qualities.map((q) => q.label.toLowerCase())),
            qualitiesArray: qualities,
            description: { value: '' },
            source: { book: 'DH2: Sample Book', page: '142', url: '' },
        },
    };
}

const HAND_FLAMER = weapon(
    'Hand Flamer',
    '1d10+4 E',
    [
        { label: 'Flame', level: null, description: 'Sets the target alight.' },
        { label: 'Spray', level: null, description: 'No attack roll; a cone.' },
    ],
    { range: '10m', rof: 'S/–/–', clip: 2 },
);
const BOLAS = weapon('Bolas', '—', [{ label: 'Snare', level: 1, description: 'Entangles the target.' }], null);

const meta = {
    title: 'Chat / Weapon Card',
    render: (args: WeaponCardCtx) => renderSheet(cardSrc, args),
} satisfies Meta<WeaponCardCtx>;
export default meta;

type Story = StoryObj<WeaponCardCtx>;

const button = (root: HTMLElement, action: string): HTMLElement | null => root.querySelector<HTMLElement>(`[data-action="${action}"]`);

export const Damaging: Story = {
    args: { item: HAND_FLAMER, hasActions: true, autoApplyDamage: false, noDamage: false },
    play: async ({ canvasElement }) => {
        await expect(button(canvasElement, 'attack')).not.toBeNull();
        await expect(button(canvasElement, 'rollDamage')).not.toBeNull();
        await expect(button(canvasElement, 'reload')).not.toBeNull();
        await expect(canvasElement.textContent).toContain('1d10+4 E');
        // The footer names the book, not the structured source object.
        await expect(canvasElement.textContent).toContain('DH2: Sample Book, p.142');
        await expect(canvasElement.textContent).not.toContain('[object Object]');
    },
};

export const NoDamage: Story = {
    args: { item: BOLAS, hasActions: true, autoApplyDamage: false, noDamage: true },
    play: async ({ canvasElement }) => {
        // The qualities still apply through Attack; there is nothing to roll for damage.
        await expect(button(canvasElement, 'attack')).not.toBeNull();
        await expect(button(canvasElement, 'rollDamage')).toBeNull();
        await expect(canvasElement.textContent).toContain('—');
        await expect(canvasElement.textContent).toContain('Snare');
        // #699: the Bolas is Thrown, a ranged attack: its card shows its range.
        await expect(canvasElement.textContent).toContain('10m');
    },
};

export const AutoApplyDamage: Story = {
    args: { item: HAND_FLAMER, hasActions: true, autoApplyDamage: true, noDamage: false },
    play: async ({ canvasElement }) => {
        await expect(button(canvasElement, 'attack')).not.toBeNull();
        await expect(button(canvasElement, 'rollDamage')).toBeNull();
    },
};

const SYSTEMS: readonly SystemId[] = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt'];

export const PerSystem: Story = {
    render: () => {
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(3, 320px)';
        grid.style.gap = '12px';
        for (const gameSystem of SYSTEMS) {
            const frame = document.createElement('div');
            frame.dataset['wh40kSystem'] = gameSystem;
            frame.appendChild(renderSheet(cardSrc, { item: BOLAS, hasActions: true, autoApplyDamage: false, noDamage: true, gameSystem }));
            grid.appendChild(frame);
        }
        return grid;
    },
    play: async ({ canvasElement }) => {
        // Every line's frame renders the card, and none offers a Damage button.
        const wrong = SYSTEMS.filter((gameSystem) => {
            const frame = canvasElement.querySelector<HTMLElement>(`[data-wh40k-system="${gameSystem}"]`);
            return frame === null || button(frame, 'attack') === null || button(frame, 'rollDamage') !== null;
        });
        await expect(wrong).toEqual([]);
    },
};

/** The chat log's message width in Foundry's sidebar: the narrowest the card is drawn. */
const CHAT_MESSAGE_WIDTH_PX = 270;

/** How many lines `el`'s own text occupies (distinct line tops; a button's icon sits at another top). */
function lineCount(el: HTMLElement): number {
    const tops = new Set<number>();
    for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) if (rect.width > 0) tops.add(Math.round(rect.top));
    }
    return tops.size;
}

export const ChatWidth: Story = {
    render: () => {
        const frame = document.createElement('div');
        frame.style.width = `${CHAT_MESSAGE_WIDTH_PX}px`;
        frame.appendChild(renderSheet(cardSrc, { item: HAND_FLAMER, hasActions: true, autoApplyDamage: false, noDamage: false }));
        return frame;
    },
    play: async ({ canvasElement }) => {
        const labels = Array.from(canvasElement.querySelectorAll<HTMLElement>('span.tw-uppercase'));
        const buttons = Array.from(canvasElement.querySelectorAll<HTMLElement>('button[data-action]'));
        await expect(labels.length).toBeGreaterThan(0);
        await expect(buttons.map((b) => b.dataset['action'])).toEqual(['attack', 'rollDamage', 'reload']);
        const wrapped = [...labels, ...buttons].filter((el) => lineCount(el) > 1).map((el) => el.textContent.trim());
        await expect(wrapped).toEqual([]);
    },
};
