/**
 * Templates print a structured field through its display form, never the record
 * itself (#229). A record printed with `{{…}}` renders "[object Object]"; bound to
 * an input's `value`, it also shows that string and a save writes a scalar over
 * the record.
 *
 * Each case names a field whose schema is a record, and the template that printed
 * it raw: the ritual card's activation duration, the ammo sheet's per-line cost,
 * the psychic power sheet's damage profile, and two description records.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const CASES: ReadonlyArray<{ template: string; raw: string; display: string }> = [
    { template: 'src/templates/chat/ritual-roll-chat.hbs', raw: '{{item.system.duration}}', display: '{{item.system.durationLabel}}' },
    { template: 'src/templates/item/item-ammo-sheet.hbs', raw: 'value="{{item.system.cost}}"', display: 'name="system.cost.dh2.homebrew.throneGelt"' },
    { template: 'src/templates/item/item-psychic-power-sheet.hbs', raw: 'value="{{item.system.damage}}"', display: 'name="system.damage.formula"' },
    {
        template: 'src/templates/chat/force-field-roll-chat.hbs',
        raw: '{{forceField.system.description}}',
        display: '{{{forceField.system.description.value}}}',
    },
    { template: 'src/templates/actor/craft/tab-components.hbs', raw: '{{{this.system.description}}}', display: '{{{this.system.description.value}}}' },
];

describe('structured fields print their display form (#229)', () => {
    it.each(CASES)('$template', ({ template, raw, display }) => {
        const source = readRepoFile(template);
        expect(source).not.toContain(raw);
        expect(source).toContain(display);
    });
});
