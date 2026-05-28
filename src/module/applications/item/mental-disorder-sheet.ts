/**
 * @file MentalDisorderSheet — sheet for mentalDisorder content items.
 *
 * Uses the shared `item-content-block-sheet.hbs` template and the freeform-gated
 * base so editing is read-only unless the Freeform Character Editing setting is
 * on. See issue #221.
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import FreeformGatedItemSheet from './freeform-gated-item-sheet.ts';

interface MentalDisorderSystem {
    severity?: string;
    trigger?: string;
    effect?: string;
    treatment?: string;
}

/** Severity choices, mirrored from {@link MentalDisorderData.defineSchema}. */
const SEVERITY_CHOICES = ['minor', 'severe', 'acute'] as const;

/** Sheet for mental-disorder items. */
const MentalDisorderSheet = defineSimpleItemSheet({
    className: 'MentalDisorderSheet',
    baseClass: FreeformGatedItemSheet,
    classes: ['wh40k-rpg', 'sheet', 'item', 'mentalDisorder'],
    template: 'systems/wh40k-rpg/templates/item/item-content-block-sheet.hbs',
    width: 560,
    height: 640,
    prepareContext: (sheet, context) => {
        const system = sheet.item.system as MentalDisorderSystem;
        const severity = system.severity ?? 'minor';
        context['contentFields'] = [
            { name: 'system.trigger', labelKey: 'WH40K.MentalDisorder.Trigger', value: system.trigger ?? '' },
            { name: 'system.effect', labelKey: 'WH40K.MentalDisorder.Effect', value: system.effect ?? '' },
            { name: 'system.treatment', labelKey: 'WH40K.MentalDisorder.Treatment', value: system.treatment ?? '' },
        ];
        context['contentScalars'] = [
            {
                kind: 'select',
                name: 'system.severity',
                labelKey: 'WH40K.MentalDisorder.Severity',
                value: severity,
                options: SEVERITY_CHOICES.map((s) => ({ value: s, labelKey: `WH40K.MentalDisorder.${s.capitalize()}`, selected: s === severity })),
            },
        ];
    },
});

export default MentalDisorderSheet;
