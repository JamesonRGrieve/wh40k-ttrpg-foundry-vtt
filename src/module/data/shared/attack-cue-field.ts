import { CUE_EVENTS, CUE_PRESETS, type CueEvent, type CuePreset } from '../../rules/attack-cue.ts';

/**
 * The authored attack-cue profile (#594) on a weapon or psychic power: how its attack
 * looks and sounds on the canvas. Content, authored in the compendium `_source`
 * (Direction #7); `rules/attack-cue.ts` maps the resolved outcome onto it.
 *
 * - `preset`     — a procedural look the system draws itself; '' takes the attack
 *                  kind's default (a tracer, a blade swing, a warp bolt).
 * - `tint`       — `#rrggbb` colour override for the preset, or ''.
 * - `animations` — animation files per cue event, played through Sequencer when it is
 *                  active. Without one (or without Sequencer) the preset is drawn.
 * - `sounds`     — sound files per cue event. Several for one event are picked from
 *                  at random. An event with none plays silently.
 */
export interface AttackCueData {
    preset: CuePreset | '';
    tint: string;
    animations: { event: CueEvent; src: string }[];
    sounds: { event: CueEvent; src: string }[];
}

function assetList(): foundry.data.fields.DataField.Any {
    const fields = foundry.data.fields;
    return new fields.ArrayField(
        new fields.SchemaField({
            event: new fields.StringField({ required: true, blank: false, choices: [...CUE_EVENTS] }),
            src: new fields.StringField({ required: true, blank: false }),
        }),
        { required: false, initial: [] },
    );
}

/**
 * Move the pre-#594 flat `sounds` list (fire sounds, #579) into `cue.sounds` as
 * `fire` entries, in place. Idempotent: a source without `sounds` is untouched, and
 * an authored `cue.sounds` keeps its entries ahead of the moved ones.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `_migrateData` source payload, before schema validation
export function migrateLegacyAttackSounds(source: Record<string, unknown>): void {
    if (!('sounds' in source)) return;
    const legacy = source['sounds'];
    delete source['sounds'];
    if (!Array.isArray(legacy)) return;
    const moved = legacy.filter((src): src is string => typeof src === 'string' && src.trim() !== '').map((src) => ({ event: 'fire', src }));
    if (moved.length === 0) return;
    const cue = typeof source['cue'] === 'object' && source['cue'] !== null ? source['cue'] : {};
    const existing = 'sounds' in cue && Array.isArray(cue.sounds) ? cue.sounds : [];
    source['cue'] = { ...cue, sounds: [...existing, ...moved] };
}

/** The `cue` schema field, shared by every item type that can attack. */
export function attackCueField(): foundry.data.fields.SchemaField.Any {
    const fields = foundry.data.fields;
    return new fields.SchemaField(
        {
            preset: new fields.StringField({ required: false, blank: true, initial: '', choices: ['', ...CUE_PRESETS] }),
            tint: new fields.StringField({ required: false, blank: true, initial: '' }),
            animations: assetList(),
            sounds: assetList(),
        },
        { required: false },
    );
}
