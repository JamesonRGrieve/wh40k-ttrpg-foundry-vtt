/**
 * Function-chosen pack icons (#625).
 *
 * The pack documents that used the removed, unlicensed `_vendored-ui` icon packs
 * were repointed to game-icons.net art (CC BY 3.0), hotlinked from the jsDelivr
 * CDN exactly as `src/icons/ATTRIBUTION.md` documents. The choice is made from
 * the document's own structured data — its type, a weapon's `type`/`class`, an
 * armour's `type`, a talent's first aptitude, a psychic power's discipline, a
 * condition's name — through the reviewed table in `pack-icon-map.json`, never
 * at random. A document that matches nothing specific gets its type's neutral
 * default rather than a misleading icon.
 *
 * Exports the table and the resolver so the authoring tooling and the unit tests
 * share one source of truth.
 */

import { createRequire } from 'node:module';

/** @type {import('./pack-icon-map.d.mts').PackIconTable} */
export const ICON_TABLE = createRequire(import.meta.url)('./pack-icon-map.json');

/**
 * The CDN hotlink for a role in the table.
 * @param {string} role
 * @returns {string}
 */
export function iconUrl(role) {
    const path = ICON_TABLE.icons[role];
    if (path === undefined) throw new Error(`pack-icon-map: unknown icon role "${role}"`);
    return `${ICON_TABLE.cdn}/${path}.svg`;
}

/** True when `img` is one of this table's game-icons hotlinks. */
export function isGameIconUrl(img) {
    return typeof img === 'string' && img.startsWith(`${ICON_TABLE.cdn}/`) && img.endsWith('.svg');
}

/**
 * A field authored plainly or as a per-line / per-book variant container resolves
 * to its first concrete value — the icon only needs the field's kind, which the
 * homologated lines share.
 * @param {unknown} value
 * @returns {unknown}
 */
function firstConcrete(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
    const books = /** @type {Record<string, unknown>} */ (value)['__books'];
    const source = books !== null && typeof books === 'object' ? books : value;
    for (const [key, v] of Object.entries(source)) {
        if (key.startsWith('__')) continue;
        return firstConcrete(v);
    }
    return undefined;
}

/** @param {unknown} value @returns {string} */
function lowerString(value) {
    const v = firstConcrete(value);
    return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

/**
 * The first role whose pattern matches `text` (case-insensitive), else null.
 * @param {ReadonlyArray<{pattern: string, role: string}>} rules
 * @param {string} text
 * @returns {string | null}
 */
function firstPatternRole(rules, text) {
    if (text === '') return null;
    for (const { pattern, role } of rules) {
        if (new RegExp(pattern, 'i').test(text)) return role;
    }
    return null;
}

/** @param {Record<string, unknown>} system @param {string} name @returns {string} */
function weaponRole(system, name) {
    const { rules } = ICON_TABLE;
    const natural = firstPatternRole(rules.weaponNaturalName, name);
    if (natural !== null) return natural;
    const type = lowerString(system['type']);
    const cls = lowerString(system['class']);
    const byType = rules.weaponType[type];
    if (byType !== undefined) return byType;
    if (type === 'explosive') return cls === 'thrown' ? rules.weaponExplosive.thrown : rules.weaponExplosive.otherwise;
    const byName = firstPatternRole(rules.weaponName, name);
    if (byName !== null) return byName;
    return rules.weaponClass[cls] ?? rules.itemTypeDefault['weapon'];
}

/**
 * A talent's icon follows its first aptitude (the characteristic or theme it
 * trains); a talent from a line without aptitudes falls back to its category.
 * @param {Record<string, unknown>} system
 * @returns {string | null}
 */
function talentRole(system) {
    const { rules } = ICON_TABLE;
    const aptitudes = firstConcrete(system['aptitudes']);
    const first = Array.isArray(aptitudes) ? aptitudes[0] : aptitudes;
    const byAptitude = firstPatternRole(rules.talentAptitude, typeof first === 'string' ? first.trim() : '');
    return byAptitude ?? rules.talentCategory[lowerString(system['category'])] ?? null;
}

/**
 * The icon role for one pack document (an Item, Actor or JournalEntry `_source`
 * body, or an embedded item carrying at least `name` + `type`).
 * @param {{ name?: unknown, type?: unknown, system?: unknown }} doc
 * @returns {string}
 */
export function iconRoleFor(doc) {
    const { rules } = ICON_TABLE;
    const type = typeof doc.type === 'string' ? doc.type : '';
    const name = typeof doc.name === 'string' ? doc.name : '';
    const system =
        doc.system !== null && typeof doc.system === 'object' && !Array.isArray(doc.system) ? /** @type {Record<string, unknown>} */ (doc.system) : {};

    if (type === '') return rules.untypedDefault;
    if (type === 'condition') {
        const role = rules.conditionName[name];
        if (role === undefined) throw new Error(`pack-icon-map: no icon chosen for condition "${name}" — add it to rules.conditionName`);
        return role;
    }
    for (const [suffix, role] of Object.entries(rules.actorTypeSuffixDefault)) {
        if (type === suffix || type.endsWith(`-${suffix}`)) return role;
    }
    switch (type) {
        case 'weapon':
            return weaponRole(system, name);
        case 'armour':
            return rules.armourType[lowerString(system['type'])] ?? rules.itemTypeDefault['armour'];
        case 'talent':
            return talentRole(system) ?? rules.itemTypeDefault['talent'];
        case 'psychicPower':
            return firstPatternRole(rules.psychicDiscipline, lowerString(system['discipline'])) ?? rules.itemTypeDefault['psychicPower'];
        case 'shipComponent': {
            const kind = firstConcrete(system['componentType']);
            return (typeof kind === 'string' ? rules.shipComponentType[kind] : undefined) ?? rules.itemTypeDefault['shipComponent'];
        }
        default:
            break;
    }
    const role = rules.itemTypeDefault[type];
    if (role === undefined) throw new Error(`pack-icon-map: no icon rule for document type "${type}" (${name})`);
    return role;
}

/**
 * The game-icons hotlink for one pack document.
 * @param {{ name?: unknown, type?: unknown, system?: unknown }} doc
 * @returns {string}
 */
export function iconUrlFor(doc) {
    return iconUrl(iconRoleFor(doc));
}
