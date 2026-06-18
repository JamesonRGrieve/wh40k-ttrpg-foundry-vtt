import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/cybernetics-install-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import type { CyberneticCraftsmanship, CyberneticInstallSite } from '../../rules/cybernetics.ts';
import { rollDifficulties } from '../../rules/difficulties.ts';

interface Args {
    deviceName: string;
    craftsmanship: CyberneticCraftsmanship;
    site: CyberneticInstallSite;
    baseDifficulty: number;
    surgeonSkillTotal: number;
    surgeonModifier: number;
}

const CRAFTSMANSHIP_OPTIONS = [
    { id: 'poor', labelKey: 'WH40K.Craftsmanship.Poor' },
    { id: 'common', labelKey: 'WH40K.Craftsmanship.Common' },
    { id: 'good', labelKey: 'WH40K.Craftsmanship.Good' },
    { id: 'best', labelKey: 'WH40K.Craftsmanship.Best' },
] as const;

const SITE_OPTIONS = [
    { id: 'external', labelKey: 'WH40K.Cybernetics.SiteExternal' },
    { id: 'limb', labelKey: 'WH40K.Cybernetics.SiteLimb' },
    { id: 'organ', labelKey: 'WH40K.Cybernetics.SiteOrgan' },
    { id: 'neural', labelKey: 'WH40K.Cybernetics.SiteNeural' },
] as const;

interface CyberneticsCtx {
    deviceName: string;
    difficulties: { value: number; label: string }[];
    craftsmanships: typeof CRAFTSMANSHIP_OPTIONS;
    sites: typeof SITE_OPTIONS;
    baseDifficulty: number;
    craftsmanship: CyberneticCraftsmanship;
    site: CyberneticInstallSite;
    surgeonSkillTotal: number;
    surgeonModifier: number;
}

function buildContext(args: Args): CyberneticsCtx {
    const difficulties = Object.entries(rollDifficulties()).map(([value, label]) => ({
        value: Number(value),
        label,
    }));
    return {
        deviceName: args.deviceName,
        difficulties,
        craftsmanships: CRAFTSMANSHIP_OPTIONS,
        sites: SITE_OPTIONS,
        baseDifficulty: args.baseDifficulty,
        craftsmanship: args.craftsmanship,
        site: args.site,
        surgeonSkillTotal: args.surgeonSkillTotal,
        surgeonModifier: args.surgeonModifier,
    };
}

const meta = {
    title: 'Dialogs/CyberneticsInstallDialog',
    render: (args) => renderSheet(templateSrc, { ...buildContext(args) }),
    args: {
        deviceName: 'Bionic Arm',
        craftsmanship: 'common' as CyberneticCraftsmanship,
        site: 'limb' as CyberneticInstallSite,
        baseDifficulty: 0,
        surgeonSkillTotal: 45,
        surgeonModifier: 0,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const CommonLimb: Story = {};

export const BestNeural: Story = {
    args: {
        deviceName: 'Cerebral Implant',
        craftsmanship: 'best',
        site: 'neural',
        baseDifficulty: -20,
        surgeonSkillTotal: 62,
        surgeonModifier: 10,
    },
};

export const PoorOrgan: Story = {
    args: {
        deviceName: 'Bionic Respiratory System',
        craftsmanship: 'poor',
        site: 'organ',
        baseDifficulty: -10,
        surgeonSkillTotal: 38,
        surgeonModifier: -10,
    },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        // Four craftsmanship buttons render.
        await expect(canvasElement.querySelectorAll('button[data-action="selectCraftsmanship"]').length).toBe(4);
        // Four install-site buttons render.
        await expect(canvasElement.querySelectorAll('button[data-action="selectSite"]').length).toBe(4);
        // Difficulty dropdown + numeric inputs render.
        await expect(canvasElement.querySelector('select[name="baseDifficulty"]')).toBeTruthy();
        await expect(canvasElement.querySelector('input[name="surgeonSkillTotal"]')).toBeTruthy();
        await expect(canvasElement.querySelector('input[name="surgeonModifier"]')).toBeTruthy();
        await expect(canvasElement.querySelector('input[name="toughnessBonus"]')).toBeTruthy();
        // Roll button is present.
        await expect(canvasElement.querySelector('button[data-action="rollInstall"]')).toBeTruthy();
        // Device name surfaces.
        await expect(view.getByText(/Bionic Arm/i)).toBeTruthy();
    },
};
