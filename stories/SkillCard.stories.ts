import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import skillCardSrc from '../src/templates/chat/skill-card.hbs?raw';
import { mockSkill, renderTemplate, type MockSkill } from './mocks';

const template = Handlebars.compile(skillCardSrc);

const meta: Meta<MockSkill> = {
    title: 'Chat/Skill Card',
    render: (skill) => renderTemplate(template, { skill }),
    args: mockSkill(),
};

export default meta;
type Story = StoryObj<MockSkill>;

export const Basic: Story = {};

export const WithSpecializations: Story = {
    args: mockSkill({
        name: 'Common Lore',
        img: 'icons/skills/common-lore.webp',
        system: {
            skillType: 'advanced',
            skillTypeLabel: 'Advanced Skill',
            characteristicLabel: 'Intelligence',
            characteristicAbbr: 'Int',
            isBasic: false,
            descriptor: 'General knowledge of a subject.',
            uses: '<p>Recall facts about the chosen specialization.</p>',
            specialRules: '<p>Each specialization is purchased separately.</p>',
            aptitudes: ['Knowledge', 'General'],
            hasSpecializations: true,
            specializations: ['Imperium', 'Imperial Creed', 'Tech', 'War'],
        },
    }),
};

export const ResearchSkill: Story = {
    args: mockSkill({
        name: 'Forbidden Lore',
        img: 'icons/skills/forbidden-lore.webp',
        system: {
            skillType: 'advanced',
            skillTypeLabel: 'Advanced Skill',
            characteristicLabel: 'Intelligence',
            characteristicAbbr: 'Int',
            isBasic: false,
            descriptor: 'Knowledge of subjects forbidden to ordinary citizens.',
            uses: '<p>Recall facts about the chosen forbidden specialization.</p>',
            specialRules: '<p>Investigation may corrupt unwary acolytes.</p>',
            useTime: '1 Free Action',
            aptitudes: ['Knowledge', 'General'],
            hasSpecializations: true,
            specializations: ['Heresy', 'Mutants', 'The Warp', 'Xenos'],
        },
    }),
};
