import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import headerSrc from '../src/templates/actor/player/header-bc.hbs?raw';
import { mockActor, renderTemplate, type MockActor } from './mocks';

const template = Handlebars.compile(headerSrc);

interface Args {
    actor: MockActor;
    source: MockActor['system'];
    originPathComplete: boolean;
}

const meta: Meta<Args> = {
    title: 'Actor/Player Header (BC)',
    render: ({ actor, source, originPathComplete }) =>
        renderTemplate(template, { actor, source, originPathComplete }),
    args: (() => {
        const actor = mockActor({
            name: 'Sanctioned Acolyte Voss',
            type: 'player-bc',
            system: {
                bio: { playerName: 'Yuri' },
                originPath: {
                    homeWorld: 'Death World — Vyaniah',
                    background: 'Heretek',
                    role: 'Forsaken',
                    trialsAndTravails: 'Betrayed by their cult',
                    motivation: 'Vengeance against the Imperium',
                },
            },
        });
        return {
            actor,
            source: actor.system,
            originPathComplete: true,
        };
    })(),
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

export const OriginPathIncomplete: Story = {
    args: (() => {
        const actor = mockActor({
            name: 'Unnamed Initiate',
            system: {
                bio: { playerName: '' },
                originPath: {
                    homeWorld: '',
                    background: '',
                    role: '',
                    trialsAndTravails: '',
                    motivation: '',
                },
            },
        });
        return {
            actor,
            source: actor.system,
            originPathComplete: false,
        };
    })(),
};

export const BuffedAndDebuffed: Story = {
    args: (() => {
        const actor = mockActor({
            name: 'Heavily Modified Champion',
            characteristics: {
                weaponSkill: { modifier: 10 },
                ballisticSkill: { modifier: 5 },
                strength: { modifier: 20, advance: 15 },
                toughness: { modifier: -10 },
                agility: { modifier: -20 },
                fellowship: { modifier: -5 },
            },
            system: {
                originPath: {
                    homeWorld: 'Forge World — Caradryad',
                    background: 'Astra Militarum Veteran',
                    role: 'Slayer',
                    trialsAndTravails: 'Survived the Eye of Terror',
                    motivation: 'Glory in slaughter',
                },
            },
        });
        return {
            actor,
            source: actor.system,
            originPathComplete: true,
        };
    })(),
};
