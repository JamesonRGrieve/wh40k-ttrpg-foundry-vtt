/**
 * The schema-row layouts of the actor sheets (#735, #736): the stored fields
 * each sheet's own templates lack, edited through the shared rows
 * (`templates/item/partial/schema-sections.hbs`). A path an actor's schema does
 * not have is skipped, so one NPC layout serves every line, the Imperium
 * Maledictum NPC's own fields included.
 */
import type { SchemaSheetLayout } from '../item/schema-sheet-layout.ts';

export const NPC_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'npc',
    labelPrefix: 'WH40K.ActorFields.Npc',
    sections: [
        { key: 'personality', icon: 'fa-theater-masks', paths: ['personality.demeanor', 'personality.goals', 'personality.fears', 'personality.quirks'] },
        {
            key: 'imperiumMaledictum',
            icon: 'fa-skull',
            paths: [
                'species',
                'encounter',
                'resolve.value',
                'resolve.max',
                'criticalWounds.value',
                'criticalWounds.max',
                'possessions',
                'attacks[].name',
                'attacks[].skill',
                'attacks[].damage',
                'attacks[].range',
                'attacks[].traits',
            ],
        },
        {
            key: 'customStats',
            icon: 'fa-sliders-h',
            paths: [
                'customStats.enabled',
                'customStats.characteristics{characteristics}',
                'customStats.skills{trainedSkills}',
                'customStats.combat.initiative',
                'customStats.combat.dodge',
                'customStats.combat.parry',
                'customStats.wounds',
                'customStats.movement',
            ],
            choiceLabels: { 'customStats.characteristics': 'WH40K.Characteristic' },
        },
        { key: 'npc', icon: 'fa-user-secret', paths: ['isReinforcement', 'primaryUse', 'movementManual', 'template', 'specialAbilities'] },
    ],
};

export const CRAFT_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'terracraft',
    labelPrefix: 'WH40K.ActorFields.Craft',
    sections: [{ key: 'craft', icon: 'fa-truck', paths: ['vehicleClass', 'traitsText'], choiceLabels: { vehicleClass: 'WH40K.VehicleClass' } }],
};

export const VOIDCRAFT_EXTRA_LAYOUT: SchemaSheetLayout = {
    type: 'voidcraft',
    labelPrefix: 'WH40K.ActorFields.Voidcraft',
    sections: [
        { key: 'hull', icon: 'fa-rocket', paths: ['mass', 'acceleration', 'complement', 'traitsText'] },
        { key: 'components', icon: 'fa-cogs', paths: ['components[].slot', 'components[].itemUuid', 'components[].sp'] },
    ],
};
