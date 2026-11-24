/**
 * @file Areas as Foundry V14 Regions (#758).
 *
 * V14 merged the old MeasuredTemplate into the Region document. A Region can block sight
 * (its `restriction`) and run behaviours on the tokens inside, but configuring one by
 * hand is a long form. The system builds every area it places itself: a quick template
 * the user drops, an attack's Blast or Spray, a smokescreen. This module is the pure
 * half: the shape in scene units, the Region's create data in canvas pixels, the outline
 * a placement preview draws, and when a timed area expires. Nothing here touches Foundry.
 *
 * Bearings follow the Foundry screen convention: 0° points along +x and angles grow
 * clockwise (y grows downward).
 */

/** The shapes an area can take, sized in scene units (metres). */
export type AreaRegionShape =
    | { kind: 'circle'; radius: number }
    | { kind: 'cone'; length: number; angle: number }
    | { kind: 'line'; length: number; width: number }
    | { kind: 'rectangle'; width: number; height: number };

/** Each shape kind, for the quick-template form. */
export const AREA_SHAPE_KINDS = ['circle', 'cone', 'line', 'rectangle'] as const;
export type AreaShapeKind = (typeof AREA_SHAPE_KINDS)[number];

/** What placed an area: the quick-template tool, an attack, or a smokescreen. */
type AreaSource = 'quick' | 'attack' | 'smoke';

/** A point in canvas pixels. */
export interface PixelPoint {
    x: number;
    y: number;
}

/** Everything the system decides about an area before it becomes a Region. */
export interface AreaRegionSpec {
    name: string;
    shape: AreaRegionShape;
    /** Where the shape sits, in canvas pixels: a circle's centre, a cone's or line's apex, a rectangle's centre. */
    origin: PixelPoint;
    /** Bearing in degrees (0 = +x, clockwise) a cone, line or rectangle points along. */
    rotation: number;
    /** Whether the area blocks sight through it (a smokescreen). */
    blocksSight: boolean;
    /** The condition (status id) tokens inside gain while they stay inside, or '' for none. */
    condition: string;
    source: AreaSource;
    /** Fill colour, a CSS hex string. */
    color: string;
}

/** When a timed area expires: once its combat reaches `round`. */
export interface AreaExpiry {
    combatId: string;
    round: number;
}

/** The slice of a combat expiry reads. */
export interface CombatClock {
    id: string;
    round: number;
}

/** The flag an area Region carries, under the system's flag scope. */
export interface AreaRegionFlag {
    source: AreaSource;
    expiry: AreaExpiry | null;
}

/** The Region behaviour type the system registers to apply a condition to tokens inside. */
export const APPLY_CONDITION_BEHAVIOR = 'applyCondition';

/** The Region visibility every system area uses: shown to everyone, on every layer. */
const VISIBLE_TO_ALL = 2;

/** Foundry Region shape data, in canvas pixels: the fields each shape type reads. */
export type RegionShapeData =
    | { type: 'circle'; x: number; y: number; radius: number }
    | { type: 'cone'; x: number; y: number; radius: number; angle: number; rotation: number; curvature: 'round' }
    | { type: 'line'; x: number; y: number; length: number; width: number; rotation: number }
    | { type: 'rectangle'; x: number; y: number; width: number; height: number; anchorX: number; anchorY: number; rotation: number };

/** The Region create data the system builds for an area. */
export interface AreaRegionData {
    name: string;
    color: string;
    shapes: RegionShapeData[];
    restriction: { enabled: boolean; type: 'sight'; priority: number };
    /** The scene level the area sits on. Foundry refuses a sight-blocking Region that is not on exactly one level. */
    levels: string[];
    visibility: number;
    behaviors: Array<{ name: string; type: typeof APPLY_CONDITION_BEHAVIOR; system: { condition: string } }>;
    flags: Record<string, { area: AreaRegionFlag }>;
}

/** Foundry shape data for the area, in canvas pixels. */
export function regionShapeData(shape: AreaRegionShape, origin: PixelPoint, rotation: number, pixelsPerUnit: number): RegionShapeData {
    const { x, y } = origin;
    if (shape.kind === 'circle') return { type: 'circle', x, y, radius: shape.radius * pixelsPerUnit };
    if (shape.kind === 'cone') return { type: 'cone', x, y, radius: shape.length * pixelsPerUnit, angle: shape.angle, rotation, curvature: 'round' };
    if (shape.kind === 'line') return { type: 'line', x, y, length: shape.length * pixelsPerUnit, width: shape.width * pixelsPerUnit, rotation };
    return { type: 'rectangle', x, y, width: shape.width * pixelsPerUnit, height: shape.height * pixelsPerUnit, anchorX: 0.5, anchorY: 0.5, rotation };
}

/**
 * The Region create data for an area: its shape, a sight restriction when it blocks
 * sight, the apply-condition behaviour when it carries a condition, and the system flag
 * that marks it as the system's and records when it expires.
 */
export function areaRegionData(
    spec: AreaRegionSpec,
    pixelsPerUnit: number,
    expiry: AreaExpiry | null,
    flagScope: string,
    levelId: string | null,
): AreaRegionData {
    const flag: AreaRegionFlag = { source: spec.source, expiry };
    return {
        name: spec.name,
        color: spec.color,
        shapes: [regionShapeData(spec.shape, spec.origin, spec.rotation, pixelsPerUnit)],
        restriction: { enabled: spec.blocksSight, type: 'sight', priority: 0 },
        levels: levelId === null ? [] : [levelId],
        visibility: VISIBLE_TO_ALL,
        behaviors: spec.condition === '' ? [] : [{ name: spec.name, type: APPLY_CONDITION_BEHAVIOR, system: { condition: spec.condition } }],
        flags: { [flagScope]: { area: flag } },
    };
}

/** When an area lasting `rounds` placed now expires; null without a combat or a duration. */
export function areaExpiry(rounds: number | null, combat: CombatClock | null): AreaExpiry | null {
    if (rounds === null || !Number.isFinite(rounds) || rounds <= 0 || combat === null) return null;
    return { combatId: combat.id, round: combat.round + Math.floor(rounds) };
}

/** Whether a timed area has run out in this combat. An area of another combat never expires here. */
export function areaExpired(expiry: AreaExpiry | null, combat: CombatClock): boolean {
    return expiry !== null && expiry.combatId === combat.id && combat.round >= expiry.round;
}

/** Steps a curve is drawn in for the placement preview. */
const ARC_STEPS = 32;

function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/** A point `distance` pixels from `origin` along `bearing` degrees. */
function along(origin: PixelPoint, bearing: number, distance: number): PixelPoint {
    const r = toRadians(bearing);
    return { x: origin.x + Math.cos(r) * distance, y: origin.y + Math.sin(r) * distance };
}

/**
 * The outline the placement preview draws, as a closed polygon in canvas pixels. A
 * circle and a cone's arc are approximated by {@link ARC_STEPS} segments.
 */
export function areaOutline(shape: AreaRegionShape, origin: PixelPoint, rotation: number, pixelsPerUnit: number): PixelPoint[] {
    if (shape.kind === 'circle') {
        const radius = shape.radius * pixelsPerUnit;
        return Array.from({ length: ARC_STEPS }, (_, i) => along(origin, (360 * i) / ARC_STEPS, radius));
    }
    if (shape.kind === 'cone') {
        const radius = shape.length * pixelsPerUnit;
        const start = rotation - shape.angle / 2;
        const arc = Array.from({ length: ARC_STEPS + 1 }, (_, i) => along(origin, start + (shape.angle * i) / ARC_STEPS, radius));
        return [origin, ...arc];
    }
    if (shape.kind === 'line') {
        const halfWidth = (shape.width * pixelsPerUnit) / 2;
        const end = along(origin, rotation, shape.length * pixelsPerUnit);
        return [
            along(origin, rotation - 90, halfWidth),
            along(end, rotation - 90, halfWidth),
            along(end, rotation + 90, halfWidth),
            along(origin, rotation + 90, halfWidth),
        ];
    }
    const hw = (shape.width * pixelsPerUnit) / 2;
    const hh = (shape.height * pixelsPerUnit) / 2;
    const r = toRadians(rotation);
    const corner = (dx: number, dy: number): PixelPoint => ({
        x: origin.x + dx * Math.cos(r) - dy * Math.sin(r),
        y: origin.y + dx * Math.sin(r) + dy * Math.cos(r),
    });
    return [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)];
}

/** Whether a shape is aimed (a cone or a line points somewhere); a circle or rectangle is only placed. */
export function shapeIsAimed(shape: AreaRegionShape): boolean {
    return shape.kind === 'cone' || shape.kind === 'line';
}

/** The bearing in degrees (0 = +x, clockwise) from `from` to `to`; 0 when they coincide. */
export function bearingBetween(from: PixelPoint, to: PixelPoint): number {
    if (from.x === to.x && from.y === to.y) return 0;
    const degrees = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
    return (degrees + 360) % 360;
}

/** The quick-template form's sizes for each shape, in metres: what the first and second fields mean. */
export const SHAPE_SIZE_FIELDS = {
    circle: { primary: 'diameter', secondary: null },
    cone: { primary: 'length', secondary: 'angle' },
    line: { primary: 'length', secondary: 'width' },
    rectangle: { primary: 'width', secondary: 'height' },
} as const satisfies Record<AreaShapeKind, { primary: string; secondary: string | null }>;

/** The sizes a new quick template of each shape opens with. */
export const DEFAULT_SHAPE_SIZES = {
    circle: { primary: 4, secondary: 0 },
    cone: { primary: 10, secondary: 30 },
    line: { primary: 10, secondary: 1 },
    rectangle: { primary: 4, secondary: 4 },
} as const satisfies Record<AreaShapeKind, { primary: number; secondary: number }>;

/**
 * The shape the quick-template form's inputs describe (a circle is entered as its
 * diameter, as a smokescreen is printed), or null when a size isn't a positive number.
 */
export function areaShapeFromInputs(kind: AreaShapeKind, primary: number, secondary: number): AreaRegionShape | null {
    if (!Number.isFinite(primary) || primary <= 0) return null;
    if (kind === 'circle') return { kind: 'circle', radius: primary / 2 };
    if (!Number.isFinite(secondary) || secondary <= 0) return null;
    if (kind === 'cone') return secondary >= 360 ? null : { kind: 'cone', length: primary, angle: secondary };
    if (kind === 'line') return { kind: 'line', length: primary, width: secondary };
    return { kind: 'rectangle', width: primary, height: secondary };
}

/** Whether a string names an area shape kind. */
export function isAreaShapeKind(value: string): value is AreaShapeKind {
    return (AREA_SHAPE_KINDS as readonly string[]).includes(value);
}
