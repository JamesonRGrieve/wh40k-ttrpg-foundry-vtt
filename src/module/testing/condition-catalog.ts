/**
 * Condition-catalog fixture for unit tests: pack index rows shaped like the
 * condition compendium documents (`type: condition`), including per-line
 * `modifiers` containers and the structured mechanics fields. The values mirror
 * the content author's book notes; they exist here only as TEST DATA for the
 * content-agnostic plumbing — the system reads the real values from the packs.
 */

import type { ConditionIndexRow } from '../rules/condition-registry.ts';

const RAW = { provenance: 'raw' };

/** One fixture condition row for a pack. */
function row(pack: string, id: string, name: string, img: string, system: NonNullable<ConditionIndexRow['system']>): ConditionIndexRow {
    return { _id: `${pack}-${id}`, uuid: `Compendium.wh40k-rpg.${pack}.Item.${id}`, name, img, type: 'condition', system: { identifier: id, ...system } };
}

/** The shared condition documents (authored once on the DH2 pack, referenced by the other lines). */
function sharedConditions(pack: string): ConditionIndexRow[] {
    return [
        row(pack, 'prone', 'Prone', 'icons/svg/falling.svg', {
            nature: 'harmful',
            modifiers: {
                dh2: { characteristics: { ws: -10 }, skills: {}, combat: { defense: -20 } },
                rt: { characteristics: { ws: -10 }, skills: { dodge: -20 }, combat: {} },
                dh1: { characteristics: { ws: -10, bs: -10 }, skills: { dodge: -20 }, combat: {} },
            },
            targeted: [
                { attack: 'melee', value: 10, exceptRange: '', label: '' },
                { attack: 'ranged', value: -10, exceptRange: 'pointBlank', label: '' },
            ],
            source: { dh2: RAW, rt: RAW, dh1: RAW },
        }),
        row(pack, 'stunned', 'Stunned', 'icons/svg/daze.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            targeted: [{ attack: 'any', value: 20, exceptRange: '', label: '' }],
            actionLimit: 'noActions',
        }),
        row(pack, 'blinded', 'Blinded', 'icons/svg/blind.svg', {
            nature: 'harmful',
            modifiers: {
                dh2: { characteristics: { ws: -30 }, skills: {}, combat: {} },
                dh1: { characteristics: { ws: -30 }, skills: { dodge: -30, parry: -30 }, combat: {} },
            },
            autoFail: ['ballisticSkill', 'Visual'],
            source: { dh2: RAW, dh1: RAW },
        }),
        row(pack, 'deafened', 'Deafened', 'icons/svg/deaf.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            autoFail: ['Auditory'],
        }),
        row(pack, 'fatigued', 'Fatigued', 'icons/svg/sleep.svg', {
            nature: 'harmful',
            modifiers: {
                dh2: { characteristics: {}, skills: {}, combat: {} },
                rt: { characteristics: { ws: -10, bs: -10, s: -10, t: -10, ag: -10, int: -10, per: -10, wp: -10, fel: -10 }, skills: {}, combat: {} },
            },
            source: { dh2: RAW, rt: RAW },
        }),
        row(pack, 'pinned', 'Pinned', 'icons/svg/net.svg', {
            nature: 'harmful',
            modifiers: { characteristics: { bs: -20 }, skills: {}, combat: {} },
            actionLimit: 'halfActionOnly',
        }),
        row(pack, 'helpless', 'Helpless', 'icons/svg/paralysis.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            helplessTarget: true,
        }),
        row(pack, 'on-fire', 'Fire', 'icons/svg/fire.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            tick: {
                interval: 'round',
                damage: '1d10',
                damageType: 'energy',
                ignoresArmour: true,
                fatigue: 1,
                test: { characteristic: 'willpower', difficulty: 0 },
                onFail: '',
            },
            removal: '<p>Drop Prone and pass a Hard (−20) Agility test.</p>',
        }),
        row(pack, 'blood-loss', 'Blood Loss', 'icons/svg/blood.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            tick: { interval: 'turn', damage: '', damageType: '', ignoresArmour: false, fatigue: 1, test: null, onFail: '' },
        }),
        row(pack, 'suffocating', 'Suffocating', 'icons/svg/degen.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            tick: {
                interval: 'round',
                damage: '',
                damageType: '',
                ignoresArmour: false,
                fatigue: 0,
                test: { characteristic: 'toughness', difficulty: 0 },
                onFail: 'unconscious',
            },
        }),
        row(pack, 'unconscious', 'Unconscious', 'icons/svg/unconscious.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            helplessTarget: true,
            actionLimit: 'noActions',
        }),
    ];
}

/** The conditions authored on the Rogue Trader pack and referenced by DW / OW / BC. */
function rogueTraderConditions(pack: string): ConditionIndexRow[] {
    return [
        row(pack, 'grappled', 'Grappled', 'icons/svg/combat.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            targeted: [{ attack: 'melee', value: 20, exceptRange: '', label: '' }],
            actionLimit: 'grappleOnly',
        }),
        row(pack, 'concealed', 'Concealed', 'icons/svg/mystery-man.svg', {
            nature: 'harmful',
            modifiers: { rt: { characteristics: {}, skills: { concealment: 10 }, combat: {} }, dh2: { characteristics: {}, skills: {}, combat: {} } },
            targeted: [{ attack: 'ranged', value: -20, exceptRange: '', label: '' }],
        }),
        row(pack, 'surprised-unaware', 'Surprised / Unaware', 'icons/svg/terror.svg', {
            nature: 'harmful',
            modifiers: { characteristics: {}, skills: {}, combat: {} },
            targeted: [{ attack: 'any', value: 30, exceptRange: '', label: '' }],
            actionLimit: 'loseTurn',
        }),
    ];
}

/**
 * Pack indices for a two-line world plus an Imperium Maledictum pack whose
 * `on-fire` document is named differently ("Ablaze"), to exercise the per-line
 * copy selection.
 */
export function conditionPackFixture(): Array<{ packName: string; rows: ConditionIndexRow[] }> {
    return [
        { packName: 'dh2-core-items-conditions', rows: sharedConditions('dh2-core-items-conditions') },
        { packName: 'rt-core-items-conditions', rows: [...sharedConditions('rt-core-items-conditions'), ...rogueTraderConditions('rt-core-items-conditions')] },
        {
            packName: 'im-core-items-conditions',
            rows: [
                row('im-core-items-conditions', 'on-fire', 'Ablaze', 'icons/svg/mystery-man.svg', {
                    nature: 'harmful',
                    modifiers: { characteristics: {}, skills: {}, combat: {} },
                }),
            ],
        },
    ];
}
