import { beforeEach, describe, expect, it } from 'vitest';
import {
    type AreaAvoidanceRule,
    type AreaTemplateSpec,
    areaAvoidanceComponents,
    areaHitResult,
    areaPlacement,
    areaShapeLabelKey,
    areaStatementPhrases,
    attackHasNoAttackRoll,
    avoidanceResult,
    bearingDegrees,
    collectInArea,
    isPointInArea,
    type PlacedArea,
    qualityIdForAttackSpecial,
    resolveAreaTemplate,
    scatterOffset,
    signedModifier,
} from './area-template.ts';
import { setWeaponQualityPayloadsForTesting } from './weapon-quality-payloads.ts';

// The shapes the packs author (src/packs-private RT canonical Spray / Blast / Smoke).
function seedQualities(): void {
    setWeaponQualityPayloadsForTesting({
        'spray': {
            type: 'template',
            noAttackRoll: true,
            template: {
                shape: 'cone',
                angle: 30,
                distanceSource: 'range',
                anchor: 'firer',
                resolution: 'avoid',
                avoidModifier: 0,
                avoidUntrainedBonus: 20,
                avoidUnbracedHeavyBonus: 30,
                hitLocation: 'body',
            },
        },
        'blast': { type: 'template', template: { shape: 'sphere', distanceSource: 'level', anchor: 'impact', resolution: 'hit' } },
        'blast-x': { type: 'template', template: { shape: 'sphere', distanceSource: 'level', anchor: 'impact', resolution: 'hit' } },
        'smoke': { type: 'template', template: { shape: 'concealment-cloud', distanceSource: 'level' } },
        'tearing': {},
    });
}

const SPRAY_RULE: AreaAvoidanceRule = { modifier: 0, untrainedBonus: 20, unbracedHeavyBonus: 30 };

describe('resolveAreaTemplate — the area comes from quality data (#599)', () => {
    beforeEach(seedQualities);

    it('Spray: a 30° cone from the firer out to the weapon range, avoided at +0, Body hits', () => {
        expect(resolveAreaTemplate([{ name: 'Tearing' }, { name: 'Spray', level: true }], 20)).toEqual({
            qualityId: 'spray',
            level: null,
            shape: 'cone',
            angle: 30,
            distance: 20,
            anchor: 'firer',
            resolution: 'avoid',
            avoid: SPRAY_RULE,
            hitLocation: 'body',
        });
    });

    it('Blast (3): a 3 m circle at the impact point that hits everyone inside', () => {
        const spec = resolveAreaTemplate([{ name: 'Blast', level: 3 }], 100);
        expect(spec).toMatchObject({ qualityId: 'blast', level: 3, shape: 'circle', angle: 0, distance: 3, anchor: 'impact', resolution: 'hit', avoid: null });
    });

    it('accepts a numeric level carried as a string', () => {
        expect(resolveAreaTemplate([{ name: 'Blast', level: '4' }], 0)?.distance).toBe(4);
    });

    it('no area when the size cannot be resolved: a dice-rated Blast, a zero-range Spray', () => {
        expect(resolveAreaTemplate([{ name: 'Blast', level: '10+1d10' }], 30)).toBeNull();
        expect(resolveAreaTemplate([{ name: 'Spray' }], 0)).toBeNull();
    });

    it('a template that targets nobody (Smoke) and a plain weapon make no area', () => {
        expect(resolveAreaTemplate([{ name: 'Smoke', level: 5 }], 30)).toBeNull();
        expect(resolveAreaTemplate([{ name: 'Tearing' }], 30)).toBeNull();
    });

    it('only Spray removes the attack roll', () => {
        expect(attackHasNoAttackRoll([{ name: 'Spray' }])).toBe(true);
        expect(attackHasNoAttackRoll([{ name: 'Blast', level: 3 }, { name: 'Tearing' }])).toBe(false);
    });

    it('maps attack-special names to quality ids', () => {
        expect(qualityIdForAttackSpecial('Twin-Linked')).toBe('twin-linked');
        expect(qualityIdForAttackSpecial('Razor Sharp')).toBe('razor-sharp');
    });
});

describe('area geometry — tokens inside a placed template', () => {
    const cone: PlacedArea = { shape: 'cone', origin: { x: 0, y: 0 }, distance: 20, direction: 0, angle: 30 };
    const at = (deg: number, dist: number): { x: number; y: number } => ({
        x: dist * Math.cos((deg * Math.PI) / 180),
        y: dist * Math.sin((deg * Math.PI) / 180),
    });

    it('a cone holds points within half its angle of the axis and within its length', () => {
        expect(isPointInArea(cone, at(0, 10))).toBe(true);
        expect(isPointInArea(cone, at(14, 19))).toBe(true);
        expect(isPointInArea(cone, at(-14, 5))).toBe(true);
        expect(isPointInArea(cone, at(16, 10))).toBe(false);
        expect(isPointInArea(cone, at(0, 21))).toBe(false);
        expect(isPointInArea(cone, at(180, 5))).toBe(false);
    });

    it('a point exactly on the cone edge counts', () => {
        expect(isPointInArea(cone, at(15, 20))).toBe(true);
    });

    it('a cone pointing across 0° wraps correctly', () => {
        const wrap: PlacedArea = { ...cone, direction: 355 };
        expect(isPointInArea(wrap, at(5, 10))).toBe(true);
        expect(isPointInArea(wrap, at(345, 10))).toBe(true);
        expect(isPointInArea(wrap, at(15, 10))).toBe(false);
    });

    it('the cone apex (the firer) is never inside', () => {
        expect(isPointInArea(cone, { x: 0, y: 0 })).toBe(false);
    });

    it('a circle holds everything within its radius, centre included', () => {
        const circle: PlacedArea = { shape: 'circle', origin: { x: 10, y: 10 }, distance: 3, direction: 0, angle: 0 };
        expect(isPointInArea(circle, { x: 10, y: 10 })).toBe(true);
        expect(isPointInArea(circle, { x: 13, y: 10 })).toBe(true);
        expect(isPointInArea(circle, { x: 12.2, y: 12.2 })).toBe(false);
    });

    it('collects the candidates inside, never the excluded firer', () => {
        const candidates = [
            { id: 'firer', center: { x: 0, y: 0 } },
            { id: 'a', center: at(5, 8) },
            { id: 'b', center: at(40, 8) },
            { id: 'c', center: at(0, 2) },
        ];
        const circle: PlacedArea = { shape: 'circle', origin: { x: 0, y: 0 }, distance: 10, direction: 0, angle: 0 };
        expect(collectInArea(cone, candidates, new Set(['firer'])).map((c) => c.id)).toEqual(['a', 'c']);
        expect(collectInArea(circle, candidates, new Set(['firer'])).map((c) => c.id)).toEqual(['a', 'b', 'c']);
    });
});

describe('areaPlacement — where the template goes', () => {
    const firer = { x: 0, y: 0 };

    it('a cone sits on the firer and points at the target', () => {
        expect(areaPlacement({ anchor: 'firer', firer, firerRotation: 0, target: { x: 0, y: 10 }, scatter: null })).toEqual({ origin: firer, direction: 90 });
    });

    it('with no target a cone follows the token facing (rotation 0 faces down the screen)', () => {
        expect(areaPlacement({ anchor: 'firer', firer, firerRotation: 0, target: null, scatter: null }).direction).toBe(90);
        expect(areaPlacement({ anchor: 'firer', firer, firerRotation: 90, target: null, scatter: null }).direction).toBe(180);
    });

    it('an impact template sits on the target', () => {
        expect(areaPlacement({ anchor: 'impact', firer, firerRotation: 0, target: { x: 10, y: 0 }, scatter: null }).origin).toEqual({ x: 10, y: 0 });
    });

    it('a missed impact template scatters from the target relative to the line of fire', () => {
        // Line of fire is +x; direction 7 is "forward", so 4 m further along +x.
        const { origin } = areaPlacement({ anchor: 'impact', firer, firerRotation: 0, target: { x: 10, y: 0 }, scatter: { direction: 7, metres: 4 } });
        expect(origin.x).toBeCloseTo(14);
        expect(origin.y).toBeCloseTo(0);
    });
});

describe('scatterOffset — the scatter diagram is relative to the line of fire', () => {
    it.each([
        [1, -3, 0],
        [4, 0, 3],
        [7, 3, 0],
        [10, 0, -3],
    ] as const)('direction %i lands at (%d, %d) for a shot fired along +x', (direction, x, y) => {
        const offset = scatterOffset(direction, 3, 0);
        expect(offset.x).toBeCloseTo(x);
        expect(offset.y).toBeCloseTo(y);
    });

    it('follows the bearing', () => {
        expect(bearingDegrees({ x: 0, y: 0 }, { x: 0, y: -5 })).toBe(270);
        const offset = scatterOffset(7, 2, 90);
        expect(offset.x).toBeCloseTo(0);
        expect(offset.y).toBeCloseTo(2);
    });
});

describe('areaAvoidanceComponents — modifiers with provenance', () => {
    it('a trained, braced wielder: just the +0 difficulty', () => {
        expect(areaAvoidanceComponents(SPRAY_RULE, { trained: true, heavyUnbraced: false })).toEqual([
            { label: 'WH40K.AreaAttack.Avoid.Difficulty', value: 0, source: 'difficulty' },
        ]);
    });

    it('an untrained wielder gives the targets +20', () => {
        expect(areaAvoidanceComponents(SPRAY_RULE, { trained: false, heavyUnbraced: false })[1]).toEqual({
            label: 'WH40K.AreaAttack.Avoid.Untrained',
            value: 20,
            source: 'weapon-training',
        });
    });

    it('a Heavy weapon fired unbraced raises it to +30, not +50', () => {
        for (const trained of [true, false]) {
            const components = areaAvoidanceComponents(SPRAY_RULE, { trained, heavyUnbraced: true });
            expect(components.map((c) => c.value)).toEqual([0, 30]);
            expect(components[1]?.source).toBe('heavy-unbraced');
        }
    });

    it('a line without the wielder bonuses (BC / OW Spray) adds nothing', () => {
        const rule: AreaAvoidanceRule = { modifier: 0, untrainedBonus: 0, unbracedHeavyBonus: 0 };
        expect(areaAvoidanceComponents(rule, { trained: false, heavyUnbraced: true })).toHaveLength(1);
    });
});

describe('avoidanceResult — scoring one creature', () => {
    const base = { tokenId: 't1', actorUuid: 'Actor.a', name: 'Cultist', skill: 'agility' as const, base: 35 };

    it('target is base + modifiers; rolling over it is a hit', () => {
        const components = areaAvoidanceComponents(SPRAY_RULE, { trained: false, heavyUnbraced: false });
        expect(avoidanceResult({ ...base, components, roll: 55 })).toMatchObject({ hit: false, test: { target: 55, roll: 55, base: 35 } });
        expect(avoidanceResult({ ...base, components, roll: 56 })).toMatchObject({ hit: true, test: { target: 55 } });
    });

    it('an unmodified 01 always avoids and 100 always hits', () => {
        const components = areaAvoidanceComponents(SPRAY_RULE, { trained: true, heavyUnbraced: false });
        expect(avoidanceResult({ ...base, base: 0, components, roll: 1 }).hit).toBe(false);
        expect(avoidanceResult({ ...base, base: 99, components, roll: 100 }).hit).toBe(true);
    });

    it('a hit area hits without a test', () => {
        expect(areaHitResult('t2', 'Actor.b', 'Servitor')).toEqual({ tokenId: 't2', actorUuid: 'Actor.b', name: 'Servitor', hit: true, test: null });
    });
});

describe('areaStatementPhrases — the card states the mechanic (#600)', () => {
    const spray: AreaTemplateSpec = {
        qualityId: 'spray',
        level: null,
        shape: 'cone',
        angle: 30,
        distance: 20,
        anchor: 'firer',
        resolution: 'avoid',
        avoid: SPRAY_RULE,
        hitLocation: 'body',
    };
    const labels = { quality: 'Spray', area: 'cone', test: 'Agility' };

    it('Spray: no attack roll, then who tests what at which modifier', () => {
        expect(areaStatementPhrases(spray, true, labels)).toEqual([
            { key: 'WH40K.AreaAttack.Summary.NoAttackRoll', params: { quality: 'Spray' } },
            { key: 'WH40K.AreaAttack.Summary.Avoid', params: { area: 'cone', test: 'Agility', modifier: '+0' } },
        ]);
    });

    it('Blast: the quality, then everyone inside is hit', () => {
        const blast: AreaTemplateSpec = {
            ...spray,
            qualityId: 'blast',
            level: 3,
            shape: 'circle',
            distance: 3,
            anchor: 'impact',
            resolution: 'hit',
            avoid: null,
        };
        expect(areaStatementPhrases(blast, false, { ...labels, quality: 'Blast (3)', area: 'blast' })).toEqual([
            { key: 'WH40K.AreaAttack.Summary.Quality', params: { quality: 'Blast (3)' } },
            { key: 'WH40K.AreaAttack.Summary.Hit', params: { area: 'blast', distance: 3 } },
        ]);
    });

    it('labels shapes and signs modifiers', () => {
        expect(areaShapeLabelKey('cone')).toBe('WH40K.AreaAttack.Area.Cone');
        expect(areaShapeLabelKey('circle')).toBe('WH40K.AreaAttack.Area.Circle');
        expect(signedModifier(0)).toBe('+0');
        expect(signedModifier(-10)).toBe('-10');
    });
});
