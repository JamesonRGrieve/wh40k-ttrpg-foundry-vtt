/**
 * @file Canvas glue for area attacks (#599): place an attack's area and read back the
 * tokens inside it.
 *
 * Foundry V14 merged the old MeasuredTemplate into the Region document (#758), so an
 * attack's Blast or Spray is a Region the system builds (`area-regions.ts`). It sits where
 * the rules put it (on the firer, or at the impact point after any scatter); a GM can still
 * move it on the Regions layer before the attack resolves, and resolution reads the Region
 * as it is then. All geometry lives in the pure `rules/area-template.ts`; this module only
 * converts between canvas pixels and scene units and talks to Foundry.
 */

import { t } from '../i18n/t.ts';
import type { AreaRegionShape } from '../rules/area-region.ts';
import { type AreaPoint, type AreaTemplateSpec, type PlacedArea, areaPlacement, collectInArea } from '../rules/area-template.ts';
import type { ScatterVector } from '../rules/scatter.ts';
import { type AreaRegionRef, areaGeometry, createAreaRegion, pixelsPerUnit } from './area-regions.ts';

type CanvasToken = foundry.canvas.placeables.Token;

/** Where an attack's area lives, so the resolve step finds it again. */
export type AreaTemplateRef = AreaRegionRef;

/** Fill colour of an attack's area. */
const ATTACK_AREA_COLOR = '#b63e2e';

/** Fill colour of a smokescreen. */
const SMOKE_COLOR = '#8a8a8a';

/** The condition a smokescreen gives tokens inside when the GM's world option asks for it. */
const BLINDED_CONDITION = 'blinded';

/** What the area is beyond its geometry: an attack's plain area unless a smokescreen says otherwise. */
interface AreaDressing {
    name: string;
    blocksSight: boolean;
    condition: string;
    source: 'attack' | 'smoke';
    color: string;
    rounds: number | null;
}

/** An attack's own area: visible to all, blocking nothing, lasting until removed. */
function attackDressing(): AreaDressing {
    return { name: t('WH40K.AreaAttack.RegionName'), blocksSight: false, condition: '', source: 'attack', color: ATTACK_AREA_COLOR, rounds: null };
}

function toUnits(point: { x: number; y: number }, ppu: number): AreaPoint {
    return { x: point.x / ppu, y: point.y / ppu };
}

/** The first token of an actor on the active scene, if any. */
export function activeTokenOf(actor: { getActiveTokens: () => CanvasToken[] } | null | undefined): CanvasToken | null {
    return actor?.getActiveTokens()[0] ?? null;
}

/**
 * Create the attack's area on the active scene. Returns null (after a warning) when there
 * is no scene.
 *
 * @param spec     The area the attack's quality declares.
 * @param firer    The attacker's token.
 * @param target   The declared target's token, or null.
 * @param scatter  The scatter a missed impact template rolled, or null.
 */
export async function placeAreaTemplate(
    spec: AreaTemplateSpec,
    firer: CanvasToken,
    target: CanvasToken | null,
    scatter: ScatterVector | null,
): Promise<AreaTemplateRef | null> {
    return createArea({ shape: spec.shape, anchor: spec.anchor, distance: spec.distance, angle: spec.angle }, firer, target, scatter);
}

/**
 * Create a smokescreen of `radius` metres at the impact point (#758): on the target, or
 * where a missed shot scattered to. It blocks sight, lasts `rounds` rounds of the current
 * combat (null: until removed), and gives tokens inside Blinded when `blinds` (the GM's
 * world option; RAW smoke only blocks sight). Null (after a warning) without a scene.
 */
export async function placeSmokeCloud(
    radius: number,
    rounds: number | null,
    blinds: boolean,
    firer: CanvasToken,
    target: CanvasToken | null,
    scatter: ScatterVector | null,
): Promise<AreaTemplateRef | null> {
    return createArea({ shape: 'circle', anchor: 'impact', distance: radius, angle: 0 }, firer, target, scatter, {
        name: t('WH40K.Area.Smoke.RegionName'),
        blocksSight: true,
        condition: blinds ? BLINDED_CONDITION : '',
        source: 'smoke',
        color: SMOKE_COLOR,
        rounds,
    });
}

/**
 * Create a grenade rider's circle of `radius` metres on the active scene (#623), on the
 * target's token (or on the thrower's), so the GM can move it before resolving. Null
 * (after a warning) when there is no scene.
 */
export async function placeRiderTemplate(radius: number, thrower: CanvasToken, target: CanvasToken | null): Promise<AreaTemplateRef | null> {
    return createArea({ shape: 'circle', anchor: 'impact', distance: radius, angle: 0 }, thrower, target, null);
}

/** The area a placement creates: its shape, what it is anchored on, its size and (for a cone) its opening. */
interface AreaPlacementInput {
    shape: AreaTemplateSpec['shape'];
    anchor: AreaTemplateSpec['anchor'];
    distance: number;
    angle: number;
}

async function createArea(
    placement: AreaPlacementInput,
    firer: CanvasToken,
    target: CanvasToken | null,
    scatter: ScatterVector | null,
    dressing: AreaDressing = attackDressing(),
): Promise<AreaTemplateRef | null> {
    const ppu = pixelsPerUnit();
    if (canvas.scene === null || ppu === null) {
        ui.notifications.warn(t('WH40K.AreaAttack.NoCanvas'));
        return null;
    }
    const { origin, direction } = areaPlacement({
        anchor: placement.anchor,
        firer: toUnits(firer.center, ppu),
        firerRotation: firer.document.rotation,
        target: target === null ? null : toUnits(target.center, ppu),
        scatter,
    });
    const shape: AreaRegionShape =
        placement.shape === 'cone' ? { kind: 'cone', length: placement.distance, angle: placement.angle } : { kind: 'circle', radius: placement.distance };
    return createAreaRegion(
        {
            name: dressing.name,
            shape,
            origin: { x: origin.x * ppu, y: origin.y * ppu },
            rotation: direction,
            blocksSight: dressing.blocksSight,
            condition: dressing.condition,
            source: dressing.source,
            color: dressing.color,
        },
        dressing.rounds,
    );
}

/**
 * The tokens whose centre lies inside the attack's area as it is now (after any move),
 * excluding the firer. Null when the area or scene is gone.
 */
export function tokensInAreaTemplate(ref: AreaTemplateRef, exclude: ReadonlySet<string>): CanvasToken[] | null {
    const ppu = pixelsPerUnit();
    const geometry = areaGeometry(ref.sceneId, ref.regionId);
    if (ppu === null || geometry === null) return null;
    const area: PlacedArea = {
        shape: geometry.shape,
        origin: toUnits(geometry.origin, ppu),
        distance: geometry.reach / ppu,
        direction: geometry.direction,
        angle: geometry.angle,
    };
    const candidates = (canvas.tokens?.placeables ?? []).map((token) => ({ id: token.id, center: toUnits(token.center, ppu), token }));
    return collectInArea(area, candidates, exclude).map((c) => c.token);
}
