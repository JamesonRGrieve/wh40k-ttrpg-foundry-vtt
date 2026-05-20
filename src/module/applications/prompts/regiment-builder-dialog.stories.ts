import type { Meta, StoryObj } from '@storybook/html-vite';
import templateSrc from '../../../../src/templates/prompt/regiment-builder-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface OptionRow {
    id: string;
    label: string;
    cost: number;
    selected: boolean;
}

interface CategoryRow {
    id: 'homeWorld' | 'commandingOfficer' | 'regimentType' | 'trainingDoctrine' | 'specialEquipmentDoctrine' | 'favouredWeapons';
    labelKey: string;
    spent: number;
    options: OptionRow[];
}

interface Args {
    budget: { spent: number; total: number; valid: boolean; over: boolean };
    categories: CategoryRow[];
}

const EMPTY_CATEGORIES: CategoryRow[] = [
    { id: 'homeWorld', labelKey: 'WH40K.OW.Regiment.Category.HomeWorld', spent: 0, options: [] },
    { id: 'commandingOfficer', labelKey: 'WH40K.OW.Regiment.Category.CommandingOfficer', spent: 0, options: [] },
    { id: 'regimentType', labelKey: 'WH40K.OW.Regiment.Category.RegimentType', spent: 0, options: [] },
    { id: 'trainingDoctrine', labelKey: 'WH40K.OW.Regiment.Category.TrainingDoctrine', spent: 0, options: [] },
    { id: 'specialEquipmentDoctrine', labelKey: 'WH40K.OW.Regiment.Category.SpecialEquipmentDoctrine', spent: 0, options: [] },
    { id: 'favouredWeapons', labelKey: 'WH40K.OW.Regiment.Category.FavouredWeapons', spent: 0, options: [] },
];

const SAMPLE_CATEGORIES: CategoryRow[] = [
    {
        id: 'homeWorld',
        labelKey: 'WH40K.OW.Regiment.Category.HomeWorld',
        spent: 3,
        options: [
            { id: 'opt:hw:death-world', label: 'Death World', cost: 3, selected: true },
            { id: 'opt:hw:feral-world', label: 'Feral World', cost: 3, selected: false },
            { id: 'opt:hw:imperial-world', label: 'Imperial World', cost: 1, selected: false },
        ],
    },
    {
        id: 'commandingOfficer',
        labelKey: 'WH40K.OW.Regiment.Category.CommandingOfficer',
        spent: 2,
        options: [
            { id: 'opt:co:billet-officer', label: 'Billet Officer', cost: 1, selected: false },
            { id: 'opt:co:phlegmatic', label: 'Phlegmatic CO', cost: 2, selected: true },
            { id: 'opt:co:maverick', label: 'Maverick CO', cost: 3, selected: false },
        ],
    },
    {
        id: 'regimentType',
        labelKey: 'WH40K.OW.Regiment.Category.RegimentType',
        spent: 2,
        options: [
            { id: 'opt:rt:line-infantry', label: 'Line Infantry', cost: 2, selected: true },
            { id: 'opt:rt:armoured', label: 'Armoured', cost: 4, selected: false },
            { id: 'opt:rt:drop', label: 'Drop Troops', cost: 4, selected: false },
        ],
    },
    {
        id: 'trainingDoctrine',
        labelKey: 'WH40K.OW.Regiment.Category.TrainingDoctrine',
        spent: 2,
        options: [
            { id: 'opt:td:close-order', label: 'Close-Order Drill', cost: 1, selected: true },
            { id: 'opt:td:guerrilla', label: 'Guerrilla', cost: 1, selected: true },
            { id: 'opt:td:hardened', label: 'Hardened Fighters', cost: 2, selected: false },
        ],
    },
    {
        id: 'specialEquipmentDoctrine',
        labelKey: 'WH40K.OW.Regiment.Category.SpecialEquipmentDoctrine',
        spent: 2,
        options: [
            { id: 'opt:sed:medikits', label: 'Bonus Medikits', cost: 1, selected: true },
            { id: 'opt:sed:demolitions', label: 'Demolitions Kit', cost: 1, selected: true },
            { id: 'opt:sed:exo-armour', label: 'Exo-armour', cost: 3, selected: false },
        ],
    },
    {
        id: 'favouredWeapons',
        labelKey: 'WH40K.OW.Regiment.Category.FavouredWeapons',
        spent: 1,
        options: [
            { id: 'opt:fw:lasgun', label: 'Lasgun (Ranged)', cost: 0, selected: true },
            { id: 'opt:fw:chainsword', label: 'Chainsword (Close)', cost: 1, selected: true },
            { id: 'opt:fw:plasma-gun', label: 'Plasma Gun (Ranged)', cost: 2, selected: false },
        ],
    },
];

const meta = {
    title: 'Prompts/RegimentBuilderDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        budget: { spent: 0, total: 12, valid: false, over: false },
        categories: EMPTY_CATEGORIES,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Empty catalog — stub state seen by callers who didn't pre-load compendium options. */
export const EmptyCatalog: Story = {
    args: {
        budget: { spent: 0, total: 12, valid: false, over: false },
        categories: EMPTY_CATEGORIES,
    },
};

/** Mid-build — 10 / 12 spent, two doctrines selected. */
export const PartialBuild: Story = {
    args: {
        budget: { spent: 10, total: 12, valid: false, over: false },
        categories: SAMPLE_CATEGORIES,
    },
};

/** Valid 12-point regiment — Commit button enabled. */
export const ValidRegiment: Story = {
    args: {
        budget: { spent: 12, total: 12, valid: true, over: false },
        categories: SAMPLE_CATEGORIES.map((c) => ({ ...c })),
    },
};
