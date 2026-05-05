import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderTemplate } from '../../../../stories/mocks';
import type { SystemId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();

interface Args {
    variant: 'sidebar' | 'horizontal';
    gameSystem: SystemId | '';
    body: string;
    cardClass?: string;
    innerClass?: string;
}

const callerSrc = `{{#> systems/wh40k-rpg/templates/actor/partial/header-base variant=variant gameSystem=gameSystem cardClass=cardClass innerClass=innerClass}}{{{body}}}{{/systems/wh40k-rpg/templates/actor/partial/header-base}}`;
const callerTemplate = Handlebars.compile(callerSrc);

const meta = {
    title: 'Actor/Partials/HeaderBase',
    render: (args) => renderTemplate(callerTemplate, args as unknown as Record<string, unknown>),
    args: {
        variant: 'sidebar',
        gameSystem: 'dh2',
        body: '<div class="wh40k-hdr-name tw-text-lg tw-font-bold">Acolyte Vex</div><div class="tw-text-sm tw-text-muted">Hive World · Imperial Guard</div>',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const SidebarDH2: Story = {
    name: 'Sidebar · DH2 (player header)',
};

export const SidebarIM: Story = {
    name: 'Sidebar · IM (player header)',
    args: { gameSystem: 'im' },
    play: async ({ canvasElement }) => {
        // The wrapper carries data-wh40k-system so per-system Tailwind variants
        // (im:tw-border-crimson-light, etc.) fire on inner content.
        const wrapper = canvasElement.querySelector('[data-wh40k-system="im"]');
        expect(wrapper).toBeTruthy();
    },
};

export const HorizontalVehicle: Story = {
    name: 'Horizontal · Vehicle',
    args: {
        variant: 'horizontal',
        gameSystem: 'dh2',
        body: '<div class="tw-flex tw-items-center tw-gap-3 tw-flex-1"><img src="icons/vehicles/chimera.webp" class="tw-w-16 tw-h-16" /><div><div class="tw-font-bold">Chimera APC</div><div class="tw-text-xs tw-text-muted">Imperial Guard transport</div></div></div>',
    },
};

export const HorizontalStarship: Story = {
    name: 'Horizontal · Starship · RT',
    args: {
        variant: 'horizontal',
        gameSystem: 'rt',
        body: '<div class="tw-flex tw-items-center tw-gap-3 tw-flex-1"><img src="icons/vehicles/voidship.webp" class="tw-w-16 tw-h-16" /><div><div class="tw-font-bold">Sword of Terra</div><div class="tw-text-xs tw-text-muted">Frigate · Hull 30/30</div></div></div>',
    },
    play: async ({ canvasElement }) => {
        const wrapper = canvasElement.querySelector('[data-wh40k-system="rt"]');
        expect(wrapper).toBeTruthy();
        // Horizontal variant doesn't wrap content in the inner column flex.
        const innerCol = canvasElement.querySelector('.tw-flex-col.tw-items-center');
        expect(innerCol).toBeNull();
    },
};

export const HorizontalNPC: Story = {
    name: 'Horizontal · NPC template',
    args: {
        variant: 'horizontal',
        gameSystem: 'dh2',
        body: '<div class="tw-flex tw-items-center tw-gap-2 tw-flex-1"><div class="tw-font-bold">Hive Ganger</div><div class="tw-text-xs">Threat: Minor</div></div>',
    },
};
