import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import bcSrc from '../src/templates/actor/player/header-bc.hbs?raw';
import dhSrc from '../src/templates/actor/player/header-dh.hbs?raw';
import dh1Src from '../src/templates/actor/player/header-dh1.hbs?raw';
import dwSrc from '../src/templates/actor/player/header-dw.hbs?raw';
import owSrc from '../src/templates/actor/player/header-ow.hbs?raw';
import rtSrc from '../src/templates/actor/player/header-rt.hbs?raw';
import { mockActor, renderTemplate, type MockActor } from './mocks';

interface PlayerHeaderArgs {
    actor: MockActor;
    system: MockActor['system'];
    source: MockActor['system'];
    originPathComplete: boolean;
    originPathSteps: unknown[];
    isNPC: boolean;
}

function buildArgs(overrides?: Parameters<typeof mockActor>[0]): PlayerHeaderArgs {
    const actor = mockActor(overrides);
    return {
        actor,
        system: actor.system,
        source: actor.system,
        originPathComplete: true,
        originPathSteps: [],
        isNPC: false,
    };
}

function renderWith(src: string) {
    const tpl = Handlebars.compile(src);
    return (args: PlayerHeaderArgs) => renderTemplate(tpl, args);
}

const meta: Meta<PlayerHeaderArgs> = {
    title: 'Actor/Player Header',
    args: buildArgs({
        name: 'Sanctioned Acolyte Voss',
        system: {
            bio: { playerName: 'Yuri' },
            originPath: {
                homeWorld: 'Hive World — Solomon',
                background: 'Imperial Guard',
                role: 'Warrior',
                trialsAndTravails: 'Survived a Tyranid splinter fleet',
                motivation: 'Duty to the Emperor',
                career: 'Guardsman',
                divination: 'Trust in your fellow man, and put your faith in the Emperor.',
            },
        },
    }),
};

export default meta;
type Story = StoryObj<PlayerHeaderArgs>;

export const BlackCrusade: Story = { name: 'Black Crusade', render: renderWith(bcSrc) };
export const DarkHeresy2e: Story = { name: 'Dark Heresy 2e', render: renderWith(dhSrc) };
export const DarkHeresy1e: Story = { name: 'Dark Heresy 1e', render: renderWith(dh1Src) };
export const Deathwatch: Story = { name: 'Deathwatch', render: renderWith(dwSrc) };
export const OnlyWar: Story = { name: 'Only War', render: renderWith(owSrc) };
export const RogueTrader: Story = { name: 'Rogue Trader', render: renderWith(rtSrc) };
