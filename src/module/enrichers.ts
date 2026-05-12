/**
 * @file enrichers.mjs - Custom text enrichers for WH40K RPG
 * Provides inline content enrichment for characteristics, skills, modifiers, etc.
 */

import type { WH40KActorSystemData, WH40KCharacteristic, WH40KSkill, WH40KSkillEntry } from './types/global.d.ts';

type EnrichmentOptions = foundry.applications.ux.TextEditor.EnrichmentOptions;

/** Typed accessor for regex match groups (`match.groups['key']` returns `string` per TS,
 *  but in practice named groups can be undefined when the alternation didn't match). */
function getGroup(groups: { [key: string]: string }, key: string): string | undefined {
    return Object.prototype.hasOwnProperty.call(groups, key) ? groups[key] : undefined;
}

interface EnricherActorLike {
    documentName?: string;
    uuid?: string;
    system: WH40KActorSystemData;
}

/**
 * Register custom text enrichers for WH40K RPG system.
 */
export function registerCustomEnrichers(): void {
    // Register enricher patterns
    CONFIG.TextEditor.enrichers.push(
        {
            // [[/characteristic ws]], [[/characteristic weaponSkill]]
            pattern: /\[\[\/characteristic (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichCharacteristic,
        },
        {
            // [[/skill dodge]], [[/skill commonLore:imperium]]
            pattern: /\[\[\/skill (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichSkill,
        },
        {
            // [[/modifier strength +10]]
            pattern: /\[\[\/modifier (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichModifier,
        },
        {
            // [[/armor head]], [[/armor all]]
            pattern: /\[\[\/armor (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichArmor,
        },
        {
            // @Quality[tearing]
            pattern: /@Quality\[(?<config>[^\]]+)\](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichQuality,
        },
        {
            // @Property[sealed]
            pattern: /@Property\[(?<config>[^\]]+)\](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichProperty,
        },
        {
            // @Condition[stunned]
            pattern: /@Condition\[(?<config>[^\]]+)\](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichCondition,
        },
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
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

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

    // Get actor from relativeTo
    const actor = options?.relativeTo as EnricherActorLike | undefined;
    if (actor?.documentName !== 'Actor') {
        return createErrorElement(match[0], 'No actor context');
    }

    const actorSystem = actor.system;
    const charData: WH40KCharacteristic | undefined = charKey in actorSystem.characteristics ? actorSystem.characteristics[charKey] : undefined;
    if (charData === undefined) {
        return createErrorElement(match[0], `Unknown characteristic: ${config}`);
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-characteristic';
    span.dataset.enricherType = 'characteristic';
    span.dataset.enricherConfig = charKey;
    span.dataset.actorUuid = actor.uuid;

    // Build tooltip data
    const tooltipData = {
        label: charData.label,
        total: charData.total,
        bonus: charData.bonus,
        base: charData.base,
        advance: charData.advance,
        modifier: charData.modifier,
        unnatural: charData.unnatural,
    };
    span.dataset.tooltip = JSON.stringify(tooltipData);

    // Create label
    const displayLabel = label ?? `${charData.label} (${charData.total})`;
    span.innerHTML = `<i class="fas fa-dice-d20"></i> ${displayLabel}`;

    span.title = `Click to roll ${charData.label}`;

    return span;
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
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

    // Parse skill and specialization
    const [skillKey, specialization] = config.split(':').map((s: string) => s.trim()) as [string, string | undefined];

    // Get actor from relativeTo
    const actor = options?.relativeTo as EnricherActorLike | undefined;
    if (actor?.documentName !== 'Actor') {
        return createErrorElement(match[0], 'No actor context');
    }

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

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-skill';
    span.dataset.enricherType = 'skill';
    span.dataset.enricherConfig = specialization !== undefined && specialization.length > 0 ? `${skillKey}:${specialization}` : skillKey;
    span.dataset.actorUuid = actor.uuid;

    // Build tooltip data
    const tooltipData = {
        label: specialization !== undefined && specialization.length > 0 ? `${skillData.label} (${(targetData as WH40KSkillEntry).name})` : skillData.label,
        current: targetData.current,
        characteristic: skillData.characteristic,
        trained: targetData.trained,
        plus10: targetData.plus10,
        plus20: targetData.plus20,
        bonus: targetData.bonus,
    };
    span.dataset.tooltip = JSON.stringify(tooltipData);

    // Create label
    const displayLabel = label ?? `${tooltipData.label} (${targetData.current}%)`;
    span.innerHTML = `<i class="fas fa-dice-d100"></i> ${displayLabel}`;

    span.title = `Click to roll ${tooltipData.label}`;

    return span;
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
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const config = match.groups['config'];
    const label = getGroup(match.groups, 'label');
    const parts = config.trim().split(/\s+/);

    if (parts.length < 2) {
        return createErrorElement(match[0], 'Invalid modifier format');
    }

    const [stat, value] = parts;
    const numValue = parseInt(value, 10);

    if (Number.isNaN(numValue)) {
        return createErrorElement(match[0], 'Invalid modifier value');
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = `wh40k-enricher wh40k-enricher-modifier ${numValue >= 0 ? 'positive' : 'negative'}`;
    span.dataset.enricherType = 'modifier';
    span.dataset.enricherConfig = config;

    const displayLabel = label ?? `${stat} ${numValue >= 0 ? '+' : ''}${numValue}`;
    const icon = numValue >= 0 ? 'arrow-up' : 'arrow-down';
    span.innerHTML = `<i class="fas fa-${icon}"></i> ${displayLabel}`;

    return span;
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
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

    // Get actor from relativeTo
    const actor = options?.relativeTo as EnricherActorLike | undefined;
    if (actor?.documentName !== 'Actor') {
        return createErrorElement(match[0], 'No actor context');
    }

    const actorSystem = actor.system;
    const armorData = actorSystem.armour;
    if (armorData === undefined) {
        return createErrorElement(match[0], 'No armor data');
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-armor';
    span.dataset.enricherType = 'armor';
    span.dataset.enricherConfig = config;
    span.dataset.actorUuid = actor.uuid;

    let displayValue: string;
    // Tooltip is a heterogeneous bag of per-location or single-location summaries serialised to JSON for display.
    // eslint-disable-next-line no-restricted-syntax -- boundary: tooltip JSON payload has no fixed schema
    let tooltipData: Record<string, unknown>;

    if (config === 'all') {
        // Show all armor locations
        const locations = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
        const values = locations.map((loc) => armorData[loc].total);
        displayValue = `${Math.min(...values)}-${Math.max(...values)} AP`;

        tooltipData = {};
        locations.forEach((loc) => {
            const locData = armorData[loc];
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

    span.dataset.tooltip = JSON.stringify(tooltipData);

    const displayLabel = label ?? displayValue;
    span.innerHTML = `<i class="fas fa-shield-alt"></i> ${displayLabel}`;

    return span;
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

    switch (type) {
        case 'characteristic':
            if (actorUuid !== undefined && actorUuid.length > 0 && config !== undefined) {
                const actor = (await fromUuid(actorUuid)) as RollCapableActor | null;
                if (actor !== null && typeof actor.rollCharacteristic === 'function') {
                    await actor.rollCharacteristic(config);
                }
            }
            break;

        case 'skill':
            if (actorUuid !== undefined && actorUuid.length > 0 && config !== undefined) {
                const actor = (await fromUuid(actorUuid)) as RollCapableActor | null;
                if (actor !== null && typeof actor.rollSkill === 'function') {
                    const [skillKey, specialization] = config.split(':');
                    await actor.rollSkill(skillKey, specialization);
                }
            }
            break;

        case 'quality':
        case 'property':
        case 'condition':
            await handleItemEnricherClick(itemUuid, event);
            break;

        // Modifiers and armor are display-only (no click action)
        case 'modifier':
        case 'armor':
        case undefined:
        default:
            break;
    }
}

/* -------------------------------------------- */

/**
 * Enrich a weapon quality reference.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
async function enrichQuality(match: RegExpMatchArray, _options?: EnrichmentOptions): Promise<HTMLElement> {
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

    // Try to find the quality in compendiums
    const qualityPack = game.packs.get('wh40k-rpg.wh40k-items-weapon-qualities');
    let quality: { name: string; uuid: string } | null = null;

    if (qualityPack !== undefined) {
        const index = await qualityPack.getIndex();
        const entry = index.find(
            (e: { name?: string; _id: string }) => (e.name ?? '').toLowerCase() === config || (e.name ?? '').toLowerCase().includes(config),
        );
        if (entry !== undefined) {
            quality = (await qualityPack.getDocument(entry._id)) as { name: string; uuid: string } | null;
        }
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-quality';
    span.dataset.enricherType = 'quality';
    span.dataset.enricherConfig = config;

    if (quality !== null) {
        span.dataset.itemUuid = quality.uuid;
        span.title = `${quality.name}\nClick to open | Shift+Click to chat | Ctrl+Click for sheet`;
    } else {
        span.title = config;
    }

    const displayLabel = label !== undefined && label.length > 0 ? label : quality?.name ?? config;
    span.innerHTML = `<i class="fa-solid fa-star"></i> ${displayLabel}`;

    return span;
}

/**
 * Enrich an armour property reference.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
async function enrichProperty(match: RegExpMatchArray, _options?: EnrichmentOptions): Promise<HTMLElement> {
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

    // Try to find the property in compendiums
    const propertyPack = game.packs.get('wh40k-rpg.rt-items-armour-properties');
    let property: { name: string; uuid: string } | null = null;

    if (propertyPack !== undefined) {
        const index = await propertyPack.getIndex();
        const entry = index.find(
            (e: { name?: string; _id: string }) => (e.name ?? '').toLowerCase() === config || (e.name ?? '').toLowerCase().includes(config),
        );
        if (entry !== undefined) {
            property = (await propertyPack.getDocument(entry._id)) as { name: string; uuid: string } | null;
        }
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-property';
    span.dataset.enricherType = 'property';
    span.dataset.enricherConfig = config;

    if (property !== null) {
        span.dataset.itemUuid = property.uuid;
        span.title = `${property.name}\nClick to open | Shift+Click to chat | Ctrl+Click for sheet`;
    } else {
        span.title = config;
    }

    const displayLabel = label !== undefined && label.length > 0 ? label : property?.name ?? config;
    span.innerHTML = `<i class="fa-solid fa-shield"></i> ${displayLabel}`;

    return span;
}

/**
 * Enrich a condition reference.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
async function enrichCondition(match: RegExpMatchArray, _options?: EnrichmentOptions): Promise<HTMLElement> {
    if (match.groups === undefined) return createErrorElement(match[0], 'No match groups');
    const label = getGroup(match.groups, 'label');
    const config = match.groups['config'].trim().toLowerCase();

    // Try to find the condition in compendiums
    const conditionPack = game.packs.get('wh40k-rpg.dh2-core-stats-conditions');
    let condition: { name: string; uuid: string } | null = null;

    if (conditionPack !== undefined) {
        const index = await conditionPack.getIndex();
        const entry = index.find(
            (e: { name?: string; _id: string }) => (e.name ?? '').toLowerCase() === config || (e.name ?? '').toLowerCase().includes(config),
        );
        if (entry !== undefined) {
            condition = (await conditionPack.getDocument(entry._id)) as { name: string; uuid: string } | null;
        }
    }

    // Create enriched element
    const span = document.createElement('span');
    span.className = 'wh40k-enricher wh40k-enricher-condition';
    span.dataset.enricherType = 'condition';
    span.dataset.enricherConfig = config;

    if (condition !== null) {
        span.dataset.itemUuid = condition.uuid;
        span.title = `${condition.name}\nClick to open | Shift+Click to chat | Ctrl+Click for sheet`;
    } else {
        span.title = config;
    }

    const displayLabel = label !== undefined && label.length > 0 ? label : condition?.name ?? config;
    span.innerHTML = `<i class="fa-solid fa-exclamation-triangle"></i> ${displayLabel}`;

    return span;
}
