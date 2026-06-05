/**
 * @file enrichers.mjs - Custom text enrichers for WH40K RPG
 * Provides inline content enrichment for characteristics, skills, modifiers, etc.
 */

import type { WH40KActorSystemData, WH40KCharacteristic, WH40KSkill, WH40KSkillEntry } from './types/global.d.ts';
import { formatSigned } from './utils/format.ts';

type EnrichmentOptions = foundry.applications.ux.TextEditor.EnrichmentOptions;

/** Typed accessor for regex match groups (`match.groups['key']` returns `string` per TS,
 *  but in practice named groups can be undefined when the alternation didn't match). */
function getGroup(groups: { [key: string]: string }, key: string): string | undefined {
    return Object.hasOwn(groups, key) ? groups[key] : undefined;
}

interface EnricherActorLike {
    documentName?: string;
    uuid?: string;
    system: WH40KActorSystemData;
}

/** Parsed enricher invocation: the raw `config` body and optional `{label}` override. */
interface ParsedEnricher {
    config: string;
    label: string | undefined;
}

/**
 * Shared enricher prologue: validate the match and pull the `config` body and
 * optional `{label}`. Returns an error `<span>` (which the caller returns as-is)
 * when the match is malformed.
 */
function parseEnricherMatch(match: RegExpMatchArray): ParsedEnricher | HTMLElement {
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig; match.groups['config'] may be undefined
    if (config === undefined) return createErrorElement(match[0], 'Missing config group');
    return { config, label };
}

/**
 * Resolve the actor an enricher renders against from `options.relativeTo`.
 * Returns an error `<span>` when there is no actor context.
 */
function resolveEnricherActor(match: RegExpMatchArray, options?: EnrichmentOptions): EnricherActorLike | HTMLElement {
    const actor = options?.relativeTo as EnricherActorLike | undefined;
    if (actor?.documentName !== 'Actor') {
        return createErrorElement(match[0], 'No actor context');
    }
    return actor;
}

/** Options for {@link makeEnricherSpan}. Attribute insertion order is load-bearing for the serialized DOM. */
interface EnricherSpanOptions {
    type: string;
    /** Extra class appended after the base classes (e.g. `positive` / `negative`). */
    extraClass?: string;
    config: string;
    /** `string | undefined` because the source actor's `uuid` is itself optional. */
    actorUuid?: string | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: the tooltip JSON payload has no fixed schema across enricher types
    tooltip?: Record<string, unknown>;
    /** Font-Awesome icon class, e.g. `fa-dice-d20`. */
    icon: string;
    label: string;
    title?: string;
}

/**
 * Build an enriched `<span>`. Attributes are inserted in the order
 * `class → data-enricher-type → data-enricher-config → data-actor-uuid →
 * data-tooltip → title` so the serialized markup is identical to the
 * per-enricher hand-built spans this replaces.
 */
function makeEnricherSpan(opts: EnricherSpanOptions): HTMLElement {
    const span = document.createElement('span');
    span.className =
        opts.extraClass === undefined ? `wh40k-enricher wh40k-enricher-${opts.type}` : `wh40k-enricher wh40k-enricher-${opts.type} ${opts.extraClass}`;
    span.dataset['enricherType'] = opts.type;
    span.dataset['enricherConfig'] = opts.config;
    if (opts.actorUuid !== undefined) span.dataset['actorUuid'] = opts.actorUuid;
    if (opts.tooltip !== undefined) span.dataset['tooltip'] = JSON.stringify(opts.tooltip);
    if (opts.title !== undefined) span.title = opts.title;
    span.innerHTML = `<i class="fas ${opts.icon}"></i> ${opts.label}`;
    return span;
}

/**
 * Register custom text enrichers for WH40K RPG system.
 */
export function registerCustomEnrichers(): void {
    // Every enricher shares the `[[/<keyword> <config>]]{<label>}` grammar and
    // differs only by keyword, so build the four from one descriptor + template.
    //   - characteristic: [[/characteristic ws]], [[/characteristic weaponSkill]]
    //   - skill:          [[/skill dodge]], [[/skill commonLore:imperium]]
    //   - modifier:       [[/modifier strength +10]]
    //   - armor:          [[/armor head]], [[/armor all]]
    // (`@Quality` / `@Property` / `@Condition` name-based enrichers were removed
    // in favour of Foundry's native `@UUID[Compendium.…]` syntax.)
    const enricherDescriptors: ReadonlyArray<{ keyword: string; enricher: (match: RegExpMatchArray, options?: EnrichmentOptions) => Promise<HTMLElement> }> = [
        { keyword: 'characteristic', enricher: enrichCharacteristic },
        { keyword: 'skill', enricher: enrichSkill },
        { keyword: 'modifier', enricher: enrichModifier },
        { keyword: 'armor', enricher: enrichArmor },
    ];
    CONFIG.TextEditor.enrichers.push(
        ...enricherDescriptors.map(({ keyword, enricher }) => ({
            pattern: new RegExp(`\\[\\[\\/${keyword} (?<config>[^\\]]+)]](?:{(?<label>[^}]+)})?`, 'gi'),
            enricher,
        })),
    );

    // Register click handlers for interactive elements
    document.body.addEventListener('click', (event) => {
        void handleEnricherClick(event);
    });
}

/* -------------------------------------------- */

/**
 * Enrich a characteristic reference with tooltip and click-to-roll.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function enrichCharacteristic(match: RegExpMatchArray, options?: EnrichmentOptions): Promise<HTMLElement> {
    const parsed = parseEnricherMatch(match);
    if (parsed instanceof HTMLElement) return parsed;
    const config = parsed.config.trim().toLowerCase();

    // Map short codes to full names
    const charMap: Record<string, string> = {
        ws: 'weaponSkill',
        bs: 'ballisticSkill',
        s: 'strength',
        t: 'toughness',
        ag: 'agility',
        int: 'intelligence',
        per: 'perception',
        wp: 'willpower',
        fel: 'fellowship',
    };

    const charKey = charMap[config] ?? config;

    const actor = resolveEnricherActor(match, options);
    if (actor instanceof HTMLElement) return actor;

    const actorSystem = actor.system;
    const charData: WH40KCharacteristic | undefined = charKey in actorSystem.characteristics ? actorSystem.characteristics[charKey] : undefined;
    if (charData === undefined) {
        return createErrorElement(match[0], `Unknown characteristic: ${config}`);
    }

    return makeEnricherSpan({
        type: 'characteristic',
        config: charKey,
        actorUuid: actor.uuid,
        tooltip: {
            label: charData.label,
            total: charData.total,
            bonus: charData.bonus,
            base: charData.base,
            advance: charData.advance,
            modifier: charData.modifier,
            unnatural: charData.unnatural,
        },
        icon: 'fa-dice-d20',
        label: parsed.label ?? `${charData.label} (${charData.total})`,
        title: `Click to roll ${charData.label}`,
    });
}

/* -------------------------------------------- */

/**
 * Enrich a skill reference with tooltip and click-to-roll.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function enrichSkill(match: RegExpMatchArray, options?: EnrichmentOptions): Promise<HTMLElement> {
    const parsed = parseEnricherMatch(match);
    if (parsed instanceof HTMLElement) return parsed;
    const config = parsed.config.trim().toLowerCase();

    // Parse skill and specialization
    const [skillKey, specialization] = config.split(':').map((s: string) => s.trim()) as [string, string | undefined];

    const actor = resolveEnricherActor(match, options);
    if (actor instanceof HTMLElement) return actor;

    const actorSystem = actor.system;
    const skillData: WH40KSkill | undefined = skillKey in actorSystem.skills ? actorSystem.skills[skillKey] : undefined;
    if (skillData === undefined) {
        return createErrorElement(match[0], `Unknown skill: ${skillKey}`);
    }

    // Handle specialist skills
    let targetData: WH40KSkill | WH40KSkillEntry = skillData;
    if (specialization !== undefined && specialization.length > 0 && skillData.entries !== undefined) {
        const entry = skillData.entries.find((e: { name?: string }) => e.name?.toLowerCase() === specialization);
        if (entry === undefined) {
            return createErrorElement(match[0], `Unknown specialization: ${specialization}`);
        }
        targetData = entry;
    }

    const hasSpec = specialization !== undefined && specialization.length > 0;
    const tooltipLabel = hasSpec ? `${skillData.label} (${(targetData as WH40KSkillEntry).name})` : skillData.label;
    return makeEnricherSpan({
        type: 'skill',
        config: hasSpec ? `${skillKey}:${specialization}` : skillKey,
        actorUuid: actor.uuid,
        tooltip: {
            label: tooltipLabel,
            current: targetData.current,
            characteristic: skillData.characteristic,
            trained: targetData.trained,
            plus10: targetData.plus10,
            plus20: targetData.plus20,
            bonus: targetData.bonus,
        },
        icon: 'fa-dice-d100',
        label: parsed.label ?? `${tooltipLabel} (${targetData.current}%)`,
        title: `Click to roll ${tooltipLabel}`,
    });
}

/* -------------------------------------------- */

/**
 * Enrich a modifier reference with tooltip.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function enrichModifier(match: RegExpMatchArray, _options?: EnrichmentOptions): Promise<HTMLElement> {
    const parsed = parseEnricherMatch(match);
    if (parsed instanceof HTMLElement) return parsed;
    const parts = parsed.config.trim().split(/\s+/);

    if (parts.length < 2) {
        return createErrorElement(match[0], 'Invalid modifier format');
    }

    const [stat, value] = parts as [string, string];
    const numValue = parseInt(value, 10);

    if (Number.isNaN(numValue)) {
        return createErrorElement(match[0], 'Invalid modifier value');
    }

    return makeEnricherSpan({
        type: 'modifier',
        extraClass: numValue >= 0 ? 'positive' : 'negative',
        config: parsed.config,
        icon: numValue >= 0 ? 'fa-arrow-up' : 'fa-arrow-down',
        label: parsed.label ?? `${stat} ${formatSigned(numValue)}`,
    });
}

/* -------------------------------------------- */

/**
 * Enrich an armor reference with tooltip.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function enrichArmor(match: RegExpMatchArray, options?: EnrichmentOptions): Promise<HTMLElement> {
    const parsed = parseEnricherMatch(match);
    if (parsed instanceof HTMLElement) return parsed;
    const config = parsed.config.trim().toLowerCase();

    const actor = resolveEnricherActor(match, options);
    if (actor instanceof HTMLElement) return actor;

    const actorSystem = actor.system;
    const armorData = actorSystem.armour;
    if (armorData === undefined) {
        return createErrorElement(match[0], 'No armor data');
    }

    let displayValue: string;
    // Tooltip is a heterogeneous bag of per-location or single-location summaries serialised to JSON for display.
    // eslint-disable-next-line no-restricted-syntax -- boundary: tooltip JSON payload has no fixed schema
    let tooltipData: Record<string, unknown>;

    if (config === 'all') {
        // Show all armor locations
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig; armorData[loc] may be undefined
        const values = locations.map((loc) => armorData[loc]?.total ?? 0);
        displayValue = `${Math.min(...values)}-${Math.max(...values)} AP`;

        tooltipData = {};
        locations.forEach((loc) => {
            const locData = armorData[loc];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard for strict tsconfig; armorData[loc] may be undefined
            if (locData === undefined) return;
            tooltipData[loc] = {
                total: locData.total,
                toughnessBonus: locData.toughnessBonus,
                value: locData.value,
            };
        });
    } else {
        // Single location
        const locData = armorData[config];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime: arbitrary user config may not match any indexed location key
        if (locData === undefined) {
            return createErrorElement(match[0], `Unknown armor location: ${config}`);
        }

        displayValue = `${locData.total} AP`;
        tooltipData = {
            location: config,
            total: locData.total,
            toughnessBonus: locData.toughnessBonus,
            traitBonus: locData.traitBonus,
            value: locData.value,
        };
    }

    return makeEnricherSpan({
        type: 'armor',
        config,
        actorUuid: actor.uuid,
        tooltip: tooltipData,
        icon: 'fa-shield-alt',
        label: parsed.label ?? displayValue,
    });
}

/* -------------------------------------------- */

/**
 * Create an error element for failed enrichment.
 * @param {string} original  Original matched text.
 * @param {string} error     Error message.
 * @returns {HTMLElement}    Error span element.
 */
function createErrorElement(original: string, error: string): HTMLElement {
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-error';
    span.title = error;
    span.textContent = original;
    return span;
}

/* -------------------------------------------- */

/**
 * Handle clicks on enriched elements.
 * @param {MouseEvent} event  The click event.
 */
interface RollCapableActor {
    rollCharacteristic?: (c: string) => Promise<void>;
    rollSkill?: (s: string, sp: string) => Promise<void>;
}
interface ItemLike {
    toMessage?: () => void;
    sheet?: { render: (force: boolean) => void };
}

async function handleItemEnricherClick(itemUuid: string | undefined, event: MouseEvent): Promise<void> {
    if (itemUuid === undefined || itemUuid.length === 0) return;
    const item = (await fromUuid(itemUuid)) as ItemLike | null;
    if (item === null) return;
    if (event.shiftKey) {
        item.toMessage?.();
    } else if (event.ctrlKey || event.metaKey) {
        item.sheet?.render(true);
    } else {
        // TODO: Integrate with ItemPreviewCard when available
        item.sheet?.render(true);
    }
}

async function handleEnricherClick(event: MouseEvent): Promise<void> {
    const enricher = (event.target as HTMLElement).closest<HTMLElement>('.wh40k-enricher');
    if (enricher === null) return;

    const type = enricher.dataset['enricherType'];
    const config = enricher.dataset['enricherConfig'];
    const actorUuid = enricher.dataset['actorUuid'];
    const itemUuid = enricher.dataset['itemUuid'];

    event.preventDefault();
    event.stopPropagation();

    if (type === 'characteristic') {
        if (actorUuid !== undefined && actorUuid.length > 0 && config !== undefined) {
            const actor = (await fromUuid(actorUuid)) as RollCapableActor | null;
            if (actor !== null && typeof actor.rollCharacteristic === 'function') {
                await actor.rollCharacteristic(config);
            }
        }
        return;
    }
    if (type === 'skill') {
        if (actorUuid !== undefined && actorUuid.length > 0 && config !== undefined) {
            const actor = (await fromUuid(actorUuid)) as RollCapableActor | null;
            if (actor !== null && typeof actor.rollSkill === 'function') {
                const [skillKey, specialization] = config.split(':') as [string, string | undefined];
                await actor.rollSkill(skillKey, specialization ?? '');
            }
        }
        return;
    }
    if (type === 'quality' || type === 'property' || type === 'condition') {
        await handleItemEnricherClick(itemUuid, event);
    }
    // 'modifier' / 'armor' / undefined / unknown — display-only (no click action).
}

/* -------------------------------------------- */
// `enrichQuality`, `enrichProperty`, `enrichCondition` were removed when
// the system standardized on Foundry's native `@UUID[Compendium…]` syntax
// for compendium-document references in description text. Foundry's
// native enricher resolves the linked document's current name on render
// and provides click-through, hover preview, and broken-link styling out
// of the box. See `src/module/utils/uuid-name-cache.ts` for the
// structured-field analog (`{{uuid-name}}` Handlebars helper).
