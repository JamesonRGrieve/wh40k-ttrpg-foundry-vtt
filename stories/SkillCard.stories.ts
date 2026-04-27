import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import skillCardSrc from '../src/templates/chat/skill-card.hbs?raw';

const template = Handlebars.compile(skillCardSrc);

interface SkillCardArgs {
    name: string;
    img: string;
    skillType: string;
    skillTypeLabel: string;
    characteristicLabel: string;
    characteristicAbbr: string;
    isBasic: boolean;
    descriptor: string;
    uses: string;
    specialRules: string;
    useTime: string;
    aptitudes: string[];
    specializations: string[];
}

const render = (args: SkillCardArgs) => {
    const html = template({
        skill: {
            name: args.name,
            img: args.img,
            system: {
                skillType: args.skillType,
                skillTypeLabel: args.skillTypeLabel,
                characteristicLabel: args.characteristicLabel,
                characteristicAbbr: args.characteristicAbbr,
                isBasic: args.isBasic,
                descriptor: args.descriptor,
                uses: args.uses,
                specialRules: args.specialRules,
                useTime: args.useTime,
                aptitudes: args.aptitudes,
                hasSpecializations: args.specializations.length > 0,
                specializations: args.specializations,
            },
        },
    });
    const wrap = document.createElement('div');
    wrap.className = 'wh40k-wrapper';
    wrap.innerHTML = html;
    return wrap;
};

const meta: Meta<SkillCardArgs> = {
    title: 'Chat/Skill Card',
    render,
    args: {
        name: 'Awareness',
        img: 'icons/skills/awareness.webp',
        skillType: 'basic',
        skillTypeLabel: 'Basic Skill',
        characteristicLabel: 'Perception',
        characteristicAbbr: 'Per',
        isBasic: true,
        descriptor: 'You notice things that other people miss.',
        uses: '<p>Used to spot ambushes, hidden objects, and subtle cues.</p>',
        specialRules: '',
        useTime: 'Free Action',
        aptitudes: ['Perception', 'Fieldcraft'],
        specializations: [],
    },
};

export default meta;
type Story = StoryObj<SkillCardArgs>;

export const Basic: Story = {};

export const WithSpecializations: Story = {
    args: {
        name: 'Common Lore',
        img: 'icons/skills/common-lore.webp',
        skillType: 'advanced',
        skillTypeLabel: 'Advanced Skill',
        characteristicLabel: 'Intelligence',
        characteristicAbbr: 'Int',
        isBasic: false,
        descriptor: 'General knowledge of a subject.',
        uses: '<p>Recall facts about the chosen specialization.</p>',
        specialRules: '<p>Each specialization is purchased separately.</p>',
        useTime: 'Free Action',
        aptitudes: ['Knowledge', 'General'],
        specializations: ['Imperium', 'Imperial Creed', 'Tech', 'War'],
    },
};

export const ResearchSkill: Story = {
    args: {
        name: 'Forbidden Lore',
        img: 'icons/skills/forbidden-lore.webp',
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
        specializations: ['Heresy', 'Mutants', 'The Warp', 'Xenos'],
    },
};
