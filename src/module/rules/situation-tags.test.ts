import { describe, expect, it } from 'vitest';
import {
    type ActorStateSource,
    collectActorStates,
    collectTargetTags,
    normalizeTag,
    rangeBandOf,
    TARGET_TAG_AXES,
    type TargetTagSource,
} from './situation-tags.ts';

/* -------------------------------------------------------------------------- */
/*  normalizeTag — one spelling for authored and derived values                */
/* -------------------------------------------------------------------------- */

describe('normalizeTag', () => {
    it('lower-cases and hyphenates word boundaries', () => {
        expect(normalizeTag('Point Blank')).toBe('point-blank');
        expect(normalizeTag('Chaos Space Marines')).toBe('chaos-space-marines');
    });

    it('splits camelCase so a schema key and a printed label agree', () => {
        expect(normalizeTag('pointBlank')).toBe('point-blank');
        expect(normalizeTag('vehicleTrait')).toBe('vehicle-trait');
    });

    it('collapses punctuation runs and trims the edges', () => {
        expect(normalizeTag('  Word-Bearers!!  ')).toBe('word-bearers');
        expect(normalizeTag('Adeptus  Astartes')).toBe('adeptus-astartes');
    });

    it('is idempotent — a slug normalises to itself', () => {
        expect(normalizeTag('point-blank')).toBe('point-blank');
        expect(normalizeTag(normalizeTag('From Beyond'))).toBe('from-beyond');
    });

    it('yields an empty string for a value with nothing taggable in it', () => {
        expect(normalizeTag('')).toBe('');
        expect(normalizeTag('---')).toBe('');
    });
});

/* -------------------------------------------------------------------------- */
/*  collectTargetTags — what a target contributes, per axis                    */
/* -------------------------------------------------------------------------- */

describe('collectTargetTags', () => {
    /** A Khornate daemon NPC of the Blood Pact, carrying the Daemonic trait. */
    function daemonNpc(): TargetTagSource {
        return {
            type: 'dh2-npc',
            system: {
                nature: 'daemon',
                tier: 'elite',
                faction: 'Blood Pact',
                subfaction: 'Chosen of Khorne',
                allegiance: 'Chaos',
                chaosAlignment: 'khorne',
            },
            items: [
                { type: 'trait', name: 'Daemonic' },
                { type: 'trait', name: 'From Beyond' },
                { type: 'weapon', name: 'Hellblade' },
            ],
        };
    }

    it('derives type tags from the actor role, nature, tier and trait items', () => {
        expect(collectTargetTags(daemonNpc()).byAxis.vsType).toEqual(['npc', 'daemon', 'elite', 'daemonic', 'from-beyond']);
    });

    it('derives faction tags from the faction and subfaction slots', () => {
        expect(collectTargetTags(daemonNpc()).byAxis.vsFaction).toEqual(['blood-pact', 'chosen-of-khorne']);
    });

    it('derives alignment tags from the chaos alignment and the allegiance slot', () => {
        expect(collectTargetTags(daemonNpc()).byAxis.vsAlignment).toEqual(['khorne', 'chaos']);
    });

    it('flattens every axis into `all`, de-duplicated and order-stable', () => {
        const tags = collectTargetTags(daemonNpc());
        expect(tags.all).toEqual([...tags.byAxis.vsType, ...tags.byAxis.vsFaction, ...tags.byAxis.vsAlignment]);
        expect(new Set(tags.all).size).toBe(tags.all.length);
    });

    it('drops the game-line prefix from the actor type — a rulebook is not a creature kind', () => {
        expect(collectTargetTags({ type: 'rt-voidcraft' }).byAxis.vsType).toEqual(['voidcraft']);
        expect(collectTargetTags({ type: 'loot' }).byAxis.vsType).toEqual(['loot']);
    });

    it('contributes nothing for the `none` nature — an ordinary humanoid is not a creature type', () => {
        expect(collectTargetTags({ type: 'dh2-npc', system: { nature: 'none' } }).byAxis.vsType).toEqual(['npc']);
    });

    it('takes the IM species slot as a type tag', () => {
        expect(collectTargetTags({ type: 'im-npc', system: { species: 'Ogryn' } }).byAxis.vsType).toEqual(['npc', 'ogryn']);
    });

    it('reads only trait-shaped items — carried gear never describes what a target IS', () => {
        const target: TargetTagSource = {
            items: [
                { type: 'weapon', name: 'Daemon Weapon' },
                { type: 'talent', name: 'Daemonic Presence' },
                { type: 'vehicleTrait', name: 'Open-Topped' },
            ],
        };
        expect(collectTargetTags(target).byAxis.vsType).toEqual(['open-topped']);
    });

    it('never emits the target NAME as a tag — name matching is the pattern this replaces', () => {
        const named: TargetTagSource = { type: 'dh2-npc', system: { nature: 'none' }, items: [] };
        const tags = collectTargetTags({ ...named });
        expect(tags.all).not.toContain('bloodletter');
        expect(tags.all).toEqual(['npc']);
    });

    it('yields every axis empty for a missing target, rather than an undefined tag set', () => {
        for (const target of [null, undefined]) {
            const tags = collectTargetTags(target);
            expect(tags.all).toEqual([]);
            for (const axis of TARGET_TAG_AXES) expect(tags.byAxis[axis]).toEqual([]);
        }
    });

    it('skips blank slots instead of emitting empty tags', () => {
        const tags = collectTargetTags({ type: '', system: { faction: '', subfaction: '   ', chaosAlignment: null } });
        expect(tags.all).toEqual([]);
    });

    it('de-duplicates within an axis when two slots slug the same', () => {
        const tags = collectTargetTags({ system: { faction: 'Blood Pact', subfaction: 'blood pact' } });
        expect(tags.byAxis.vsFaction).toEqual(['blood-pact']);
    });
});

/* -------------------------------------------------------------------------- */
/*  collectActorStates — the `whileState` input                                */
/* -------------------------------------------------------------------------- */

describe('collectActorStates', () => {
    it('takes the actor’s Foundry status ids', () => {
        expect(collectActorStates({ statuses: ['prone', 'stunned'] })).toEqual(['prone', 'stunned']);
    });

    it('takes the names of active effects, slugged', () => {
        const actor: ActorStateSource = { effects: [{ name: 'On Fire' }, { name: 'Frenzy' }] };
        expect(collectActorStates(actor)).toEqual(['on-fire', 'frenzy']);
    });

    it('ignores disabled effects', () => {
        const actor: ActorStateSource = { effects: [{ name: 'Frenzy', disabled: true }, { name: 'Fatigued' }] };
        expect(collectActorStates(actor)).toEqual(['fatigued']);
    });

    it('de-duplicates a status and the effect that carries it', () => {
        expect(collectActorStates({ statuses: ['prone'], effects: [{ name: 'Prone' }] })).toEqual(['prone']);
    });

    it('returns an empty list (never undefined) for an actor under no conditions', () => {
        expect(collectActorStates({})).toEqual([]);
        expect(collectActorStates(null)).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/*  rangeBandOf — the `rangeBand` / `atRangeBand` input                        */
/* -------------------------------------------------------------------------- */

describe('rangeBandOf', () => {
    it('slugs the calculator’s bracket keys into the authored band vocabulary', () => {
        expect(rangeBandOf('pointBlank')).toBe('point-blank');
        expect(rangeBandOf('short')).toBe('short');
        expect(rangeBandOf('extreme')).toBe('extreme');
        expect(rangeBandOf('melee')).toBe('melee');
    });

    it('returns undefined when no bracket was computed, so "absent" stays distinct from "did not match"', () => {
        expect(rangeBandOf(undefined)).toBeUndefined();
        expect(rangeBandOf(null)).toBeUndefined();
        expect(rangeBandOf('')).toBeUndefined();
    });
});
