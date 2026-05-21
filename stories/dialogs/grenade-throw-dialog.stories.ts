import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { WITHIN_GRENADES, listWithinGrenades } from '../../src/module/rules/within-grenades.ts';
import templateSrc from '../../src/templates/prompt/grenade-throw-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

interface Args {
    selectedId: string;
}

const CHARACTERISTIC_LABEL: Record<string, string> = {
    toughness: 'Toughness',
    agility: 'Agility',
    willpower: 'Willpower',
};

function formatDifficulty(mod: number): string {
    if (mod === 0) return 'Ordinary (+0)';
    if (mod > 0) return `+${mod}`;
    return String(mod);
}

const NAME_OVERRIDES: Record<string, string> = {
    photonFlash: 'Photon Flash Grenade',
    psychotroke: 'Psychotroke Grenade',
    tearsOfTheEmperor: 'Tears of the Emperor',
    smoke: 'Smoke Grenade',
};

function buildContext(args: Args): Record<string, unknown> {
    const grenades = listWithinGrenades().map((g) => ({
        id: g.id,
        label: NAME_OVERRIDES[g.id] ?? g.id,
        blastRadius: g.blastRadius,
        damage: g.damage,
        specialQualities: g.specialQualities,
        saveLabel: `${CHARACTERISTIC_LABEL[g.save.characteristic] ?? g.save.characteristic} ${formatDifficulty(g.save.difficulty)}`,
        failEffect: g.failEffect,
        accentClass: g.accentClass,
        isSelected: g.id === args.selectedId,
    }));
    return {
        grenades,
        selectedId: args.selectedId,
        selectedGrenade: grenades.find((g) => g.isSelected) ?? null,
    };
}

const meta = {
    title: 'Dialogs/GrenadeThrowDialog',
    render: (args) => renderSheet(templateSrc, buildContext(args)),
    args: {
        selectedId: 'psychotroke',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Psychotroke: Story = {};

export const PhotonFlash: Story = {
    args: { selectedId: 'photonFlash' },
};

export const TearsOfTheEmperor: Story = {
    args: { selectedId: 'tearsOfTheEmperor' },
};

export const Smoke: Story = {
    args: { selectedId: 'smoke' },
};

export const RenderSmoke: Story = {
    args: { selectedId: 'smoke' },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Picker exposes all four grenades.
        await Promise.all(
            Object.keys(WITHIN_GRENADES).map(async (id) => {
                await expect(canvasElement.querySelector(`[data-grenade-id="${id}"]`)).toBeTruthy();
            }),
        );
        // Throw button is present.
        await expect(view.getByText(/Throw/i)).toBeTruthy();
    },
};
