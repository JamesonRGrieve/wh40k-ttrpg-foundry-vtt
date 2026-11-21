/**
 * @file The quick-template form's state and view-model (#758), shared by the dialog and
 * its story. Pure: the conditions to offer are passed in.
 */
import {
    AREA_SHAPE_KINDS,
    type AreaRegionShape,
    type AreaShapeKind,
    areaShapeFromInputs,
    DEFAULT_SHAPE_SIZES,
    isAreaShapeKind,
    SHAPE_SIZE_FIELDS,
} from '../../rules/area-region.ts';

/** One submitted form value. */
export type FormValue = string | number | boolean | null | undefined;

/** What the user has entered. */
export interface QuickTemplateState {
    kind: AreaShapeKind;
    primary: number;
    secondary: number;
    blocksSight: boolean;
    /** Condition status id, or '' for none. */
    condition: string;
    /** Rounds the area lasts in combat, or null until it is removed. */
    duration: number | null;
    name: string;
}

/** A condition the form offers. */
export interface ConditionOption {
    id: string;
    label: string;
}

/** The form's opening state: a 4 m circle that blocks sight, as a smoke grenade's cloud. */
export function initialQuickTemplateState(): QuickTemplateState {
    return { kind: 'circle', ...DEFAULT_SHAPE_SIZES.circle, blocksSight: true, condition: '', duration: null, name: '' };
}

/** The state after the user picks another shape: that shape's default sizes. */
export function withShapeKind(state: QuickTemplateState, kind: AreaShapeKind): QuickTemplateState {
    return kind === state.kind ? state : { ...state, kind, ...DEFAULT_SHAPE_SIZES[kind] };
}

/** Langpack keys for each size field. */
const SIZE_LABEL_KEYS = {
    diameter: 'WH40K.Area.QuickTemplate.Diameter',
    length: 'WH40K.Area.QuickTemplate.Length',
    angle: 'WH40K.Area.QuickTemplate.Angle',
    width: 'WH40K.Area.QuickTemplate.Width',
    height: 'WH40K.Area.QuickTemplate.Height',
} as const;

const SHAPE_LABEL_KEYS = {
    circle: 'WH40K.Area.Shape.Circle',
    cone: 'WH40K.Area.Shape.Cone',
    line: 'WH40K.Area.Shape.Line',
    rectangle: 'WH40K.Area.Shape.Rectangle',
} as const satisfies Record<AreaShapeKind, string>;

/** The form's render context. */
export interface QuickTemplateContext {
    shapes: Array<{ value: AreaShapeKind; labelKey: string; selected: boolean }>;
    primaryLabelKey: string;
    secondaryLabelKey: string | null;
    primary: number;
    secondary: number;
    blocksSight: boolean;
    conditions: Array<{ value: string; label: string; selected: boolean }>;
    duration: number | '';
    name: string;
    canPlace: boolean;
}

/** The shape the state describes, or null while a size is invalid. */
export function quickTemplateShape(state: QuickTemplateState): AreaRegionShape | null {
    return areaShapeFromInputs(state.kind, state.primary, state.secondary);
}

export function buildQuickTemplateContext(state: QuickTemplateState, conditions: readonly ConditionOption[]): QuickTemplateContext {
    const fields = SHAPE_SIZE_FIELDS[state.kind];
    return {
        shapes: AREA_SHAPE_KINDS.map((value) => ({ value, labelKey: SHAPE_LABEL_KEYS[value], selected: value === state.kind })),
        primaryLabelKey: SIZE_LABEL_KEYS[fields.primary],
        secondaryLabelKey: fields.secondary === null ? null : SIZE_LABEL_KEYS[fields.secondary],
        primary: state.primary,
        secondary: state.secondary,
        blocksSight: state.blocksSight,
        conditions: conditions.map((c) => ({ value: c.id, label: c.label, selected: c.id === state.condition })),
        duration: state.duration ?? '',
        name: state.name,
        canPlace: quickTemplateShape(state) !== null,
    };
}

/**
 * Read the submitted form into the state. Numbers that don't parse keep the earlier
 * value; an empty or non-positive duration means "until removed".
 */
export function readQuickTemplateForm(state: QuickTemplateState, data: Readonly<Record<string, FormValue>>): QuickTemplateState {
    const kindValue = data['kind'];
    const kind = typeof kindValue === 'string' && isAreaShapeKind(kindValue) ? kindValue : state.kind;
    if (kind !== state.kind) return withShapeKind(state, kind);
    const number = (value: FormValue, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    const durationRaw = data['duration'];
    const duration = typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0 ? Math.floor(durationRaw) : null;
    return {
        kind,
        primary: number(data['primary'], state.primary),
        secondary: number(data['secondary'], state.secondary),
        blocksSight: data['blocksSight'] === true,
        condition: typeof data['condition'] === 'string' ? data['condition'] : '',
        duration,
        name: typeof data['name'] === 'string' ? data['name'].trim() : state.name,
    };
}
