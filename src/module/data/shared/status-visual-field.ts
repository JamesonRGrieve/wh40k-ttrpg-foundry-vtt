import { STATUS_INTENSITY_CEILING, STATUS_SOUND_EVENTS, STATUS_VISUAL_FILTERS, STATUS_VISUAL_PRESETS } from '../../rules/status-visual.ts';
import { cueAssetListField } from './attack-cue-field.ts';

/**
 * The `visual` schema field of a condition: how the condition shows on the token that
 * bears it (#595). Content, authored in the compendium `_source` (Direction #7);
 * `rules/status-visual.ts` reads it and `canvas/status-visual-layer.ts` draws it. Every
 * field defaults to "nothing", so a condition without one shows no visual.
 */
export function statusVisualField(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField(
        {
            preset: new fields.StringField({ required: false, blank: true, initial: '', choices: ['', ...STATUS_VISUAL_PRESETS] }),
            tint: new fields.StringField({ required: false, blank: true, initial: '' }),
            filter: new fields.StringField({ required: false, blank: true, initial: '', choices: ['', ...STATUS_VISUAL_FILTERS] }),
            overlay: new fields.StringField({ required: false, blank: true, initial: '' }),
            intensity: new fields.SchemaField(
                {
                    perStack: new fields.NumberField({ required: false, initial: 0, min: 0 }),
                    max: new fields.NumberField({ required: false, initial: 1, min: 1, max: STATUS_INTENSITY_CEILING }),
                },
                { required: false },
            ),
            sounds: cueAssetListField(STATUS_SOUND_EVENTS),
        },
        { required: false },
    );
}
