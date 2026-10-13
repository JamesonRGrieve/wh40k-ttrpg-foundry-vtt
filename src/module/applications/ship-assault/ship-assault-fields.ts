/**
 * Dialog fields and dice helpers shared by the RT ship assault flows.
 */

import type { SituationalModifier } from '../../rules/ship-assault.ts';
import type { AssaultField, AssaultFieldGroup, AssaultFormValues, ShipAssaultContext } from './ship-assault-flow.ts';

/**
 * The value + label pair for a GM-entered situational modifier — component
 * bonuses (Reinforcements, Tenebro-Maze, a Ram Ship's +20), talents and GM
 * fiat. The label is what the card names the row by.
 */
export function situationalFields(ctx: Pick<ShipAssaultContext, 'localize'>, prefix: string): AssaultField[] {
    return [
        { name: `${prefix}Value`, kind: 'number', label: ctx.localize('WH40K.Voidcraft.Assault.Field.SituationalValue'), value: 0 },
        {
            name: `${prefix}Label`,
            kind: 'text',
            label: ctx.localize('WH40K.Voidcraft.Assault.Field.SituationalLabel'),
            value: ctx.localize('WH40K.Voidcraft.Assault.Field.SituationalDefault'),
        },
    ];
}

/** Read a situational modifier written by {@link situationalFields}. */
export function readSituational(form: AssaultFormValues, prefix: string): SituationalModifier {
    return { value: form.number(`${prefix}Value`, 0), label: form.text(`${prefix}Label`, '') };
}

/** The helmsman's Pilot (Space Craft) skill plus a situational modifier. */
export function helmsmanGroup(ctx: ShipAssaultContext): AssaultFieldGroup {
    return {
        legend: ctx.localize('WH40K.Voidcraft.Assault.HelmsmanLegend', { ship: ctx.attacker.name }),
        fields: [
            {
                name: 'pilotSkill',
                kind: 'number',
                label: ctx.localize('WH40K.Voidcraft.Assault.Field.PilotSkill'),
                value: ctx.attacker.system.crew.crewRating,
                min: 0,
            },
            ...situationalFields(ctx, 'situational'),
        ],
    };
}

/** Read typed values out of a rendered dialog form. */
export function readAssaultForm(root: ParentNode): AssaultFormValues {
    const input = (name: string): HTMLInputElement | HTMLSelectElement | null =>
        root.querySelector<HTMLInputElement>(`input[name="${name}"]:not([type="radio"])`) ??
        root.querySelector<HTMLInputElement>(`input[type="radio"][name="${name}"]:checked`) ??
        root.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
    return {
        number: (name, fallback) => {
            const el = input(name);
            if (el === null || el.value.trim() === '') return fallback;
            const value = Number(el.value);
            return Number.isFinite(value) ? value : fallback;
        },
        text: (name, fallback) => {
            const el = input(name);
            return el === null ? fallback : el.value.trim();
        },
        checked: (name) => root.querySelector<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)?.checked === true,
    };
}

/** Every individual die result of an evaluated roll, in order. */
export function dieResults(roll: { readonly dice: readonly { readonly results: readonly { readonly result: number }[] }[] }): number[] {
    return roll.dice.flatMap((term) => term.results.map((result) => result.result));
}
