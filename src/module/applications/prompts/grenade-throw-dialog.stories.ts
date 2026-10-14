import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/grenade-throw-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { resolveThrow } from '../../rules/combat-actions.ts';
import { WITHIN_GRENADES, listWithinGrenades } from '../../rules/within-grenades.ts';

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

interface GrenadeCardCtx {
    id: string;
    label: string;
    blastRadius: number;
    damage: string;
    specialQualities: readonly string[];
    saveLabel: string;
    failEffect: string;
    accentClass: string;
    isSelected: boolean;
}

interface GrenadeThrowCtx {
    grenades: GrenadeCardCtx[];
    selectedId: string;
    selectedGrenade: GrenadeCardCtx | null;
}

function buildContext(args: Args): GrenadeThrowCtx {
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
    render: (args) => renderSheet(templateSrc, { ...buildContext(args) }),
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
        await expect(view.getByRole('button', { name: /Throw/i })).toBeTruthy();
    },
};

/**
 * Throwing a save-rider grenade from the sheet opens the dialog on THAT grenade
 * (#619): the selection is what `resolveThrow` reads off the thrown weapon's own
 * class, type and identifier (a Photon Flash Grenade as the DH2 pack authors it).
 */
export const ThrownPhotonFlashOpensOnIt: Story = {
    render: () => {
        const resolution = resolveThrow({ class: 'thrown', type: 'grenade', identifier: 'photon-flash-grenade', special: new Set(['blast-6']) });
        const selectedId = resolution.path === 'grenade-dialog' ? resolution.grenade.id : '';
        return renderSheet(templateSrc, { ...buildContext({ selectedId }) });
    },
    play: async ({ canvasElement }) => {
        const checked = Array.from(canvasElement.querySelectorAll('[data-grenade-id][aria-checked="true"]')).map((el) => el.getAttribute('data-grenade-id'));
        await expect(checked).toEqual(['photonFlash']);
        await expect(canvasElement.textContent).toContain('Blinded');
    },
};
