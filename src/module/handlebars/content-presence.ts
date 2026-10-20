/**
 * Whether a sheet section has anything to show (#597). A read-only item sheet
 * hides an empty section rather than printing its heading over nothing.
 */

/** A modifier group as the item DataModel stores it: key → signed number. */
type ModifierGroup = Readonly<Record<string, number>>;

/** The item modifier groups the modifiers panel displays. */
export interface DisplayedModifiers {
    readonly characteristics?: ModifierGroup | undefined;
    readonly skills?: ModifierGroup | undefined;
    readonly combat?: ModifierGroup | undefined;
    readonly resources?: ModifierGroup | undefined;
    /** How many free-form "other" modifiers the item carries. */
    readonly otherCount?: number | undefined;
}

/** A non-breaking space, as a rich-text editor leaves it in an otherwise empty field. */
const NBSP = String.fromCharCode(0xa0);

/** Entities and characters a rich-text editor leaves in an otherwise empty field. */
const EMPTY_ENTITY_PATTERN = new RegExp(`&nbsp;|&#160;|${NBSP}`, 'g');

/**
 * Whether a rich-text (ProseMirror) value has visible text. An untouched editor
 * stores "" or an empty paragraph ("<p></p>", "<p><br></p>"), which is empty.
 */
export function htmlHasText(html: string): boolean {
    return (
        html
            .replace(/<[^>]*>/g, '')
            .replace(EMPTY_ENTITY_PATTERN, ' ')
            .trim() !== ''
    );
}

/** Whether a modifier group holds any non-zero modifier. */
export function hasNonZeroModifier(group: ModifierGroup | undefined): boolean {
    return group !== undefined && Object.values(group).some((value) => Number.isFinite(value) && value !== 0);
}

/** Whether the modifiers panel has any modifier to show. */
export function hasDisplayedModifiers(modifiers: DisplayedModifiers | undefined): boolean {
    if (modifiers === undefined) return false;
    return (
        hasNonZeroModifier(modifiers.characteristics) ||
        hasNonZeroModifier(modifiers.skills) ||
        hasNonZeroModifier(modifiers.combat) ||
        hasNonZeroModifier(modifiers.resources) ||
        (modifiers.otherCount ?? 0) > 0
    );
}

/* ------------------------------------------------------------------ */
/*  Template boundary: the Handlebars helpers' narrowing               */
/* ------------------------------------------------------------------ */

/** A value a template passes to a helper (Handlebars types none of them). */
// eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars.registerHelper arguments are untyped template values; each helper below narrows it before use
type TemplateValue = unknown;

interface TemplateObject {
    [key: string]: TemplateValue;
}

function asTemplateObject(value: TemplateValue): TemplateObject | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as TemplateObject) : undefined;
}

/** A template object's numeric entries, as a modifier group. */
function asModifierGroup(value: TemplateValue): ModifierGroup | undefined {
    const object = asTemplateObject(value);
    if (object === undefined) return undefined;
    return Object.fromEntries(Object.entries(object).filter((entry): entry is [string, number] => typeof entry[1] === 'number'));
}

/** `{{#if (hasText value)}}`: a rich-text value with visible text. */
export function hasTextHelper(value: TemplateValue): boolean {
    return typeof value === 'string' && htmlHasText(value);
}

/** `{{#if (hasNonZero group)}}`: a modifier group with a non-zero entry. */
export function hasNonZeroHelper(value: TemplateValue): boolean {
    return hasNonZeroModifier(asModifierGroup(value));
}

/** `{{#if (hasDisplayedModifiers item.system.modifiers)}}` is true when some modifier the modifiers panel shows. */
export function hasDisplayedModifiersHelper(value: TemplateValue): boolean {
    const object = asTemplateObject(value);
    if (object === undefined) return false;
    const other = object['other'];
    return hasDisplayedModifiers({
        characteristics: asModifierGroup(object['characteristics']),
        skills: asModifierGroup(object['skills']),
        combat: asModifierGroup(object['combat']),
        resources: asModifierGroup(object['resources']),
        otherCount: Array.isArray(other) ? other.length : 0,
    });
}
