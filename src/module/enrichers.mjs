/**
 * @file enrichers.mjs - Custom text enrichers for Rogue Trader
 * Provides inline content enrichment for characteristics, skills, modifiers, etc.
 */

import { RogueTraderAcolyte } from "./documents/acolyte.mjs";

/**
 * Register custom text enrichers for Rogue Trader system.
 */
export function registerCustomEnrichers() {
    // Register enricher patterns
    CONFIG.TextEditor.enrichers.push(
        {
            // [[/characteristic ws]], [[/characteristic weaponSkill]]
            pattern: /\[\[\/characteristic (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichCharacteristic
        },
        {
            // [[/skill dodge]], [[/skill commonLore:imperium]]
            pattern: /\[\[\/skill (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichSkill
        },
        {
            // [[/modifier strength +10]]
            pattern: /\[\[\/modifier (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichModifier
        },
        {
            // [[/armor head]], [[/armor all]]
            pattern: /\[\[\/armor (?<config>[^\]]+)]](?:{(?<label>[^}]+)})?/gi,
            enricher: enrichArmor
        }
    );

    // Register click handlers for interactive elements
    document.body.addEventListener("click", handleEnricherClick);
}

/* -------------------------------------------- */

/**
 * Enrich a characteristic reference with tooltip and click-to-roll.
 * @param {RegExpMatchArray} match       The regular expression match result.
 * @param {EnrichmentOptions} options    Options provided to customize text enrichment.
 * @returns {Promise<HTMLElement|null>}  An HTML element to insert in place of the matched text.
 */
async function enrichCharacteristic(match, options) {
    let { config, label } = match.groups;
    config = config.trim().toLowerCase();

    // Map short codes to full names
    const charMap = {
        ws: "weaponSkill",
        bs: "ballisticSkill",
        s: "strength",
        t: "toughness",
        ag: "agility",
        int: "intelligence",
        per: "perception",
        wp: "willpower",
        fel: "fellowship"
    };

    const charKey = charMap[config] || config;
    
    // Get actor from relativeTo
    const actor = options.relativeTo;
    if (!actor || actor.documentName !== "Actor") {
        return createErrorElement(match[0], "No actor context");
    }

    const charData = actor.system.characteristics?.[charKey];
    if (!charData) {
        return createErrorElement(match[0], `Unknown characteristic: ${config}`);
    }

    // Create enriched element
    const span = document.createElement("span");
    span.className = "rt-enricher rt-enricher-characteristic";
    span.dataset.enricherType = "characteristic";
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
        unnatural: charData.unnatural
    };
    span.dataset.tooltip = JSON.stringify(tooltipData);

    // Create label
    const displayLabel = label || `${charData.label} (${charData.total})`;
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
async function enrichSkill(match, options) {
    let { config, label } = match.groups;
    config = config.trim().toLowerCase();

    // Parse skill and specialization
    const [skillKey, specialization] = config.split(":").map(s => s.trim());

    // Get actor from relativeTo
    const actor = options.relativeTo;
    if (!actor || actor.documentName !== "Actor") {
        return createErrorElement(match[0], "No actor context");
    }

    const skillData = actor.system.skills?.[skillKey];
    if (!skillData) {
        return createErrorElement(match[0], `Unknown skill: ${skillKey}`);
    }

    // Handle specialist skills
    let targetData = skillData;
    if (specialization && skillData.entries) {
        const entry = skillData.entries.find(e => 
            e.name?.toLowerCase() === specialization
        );
        if (!entry) {
            return createErrorElement(match[0], `Unknown specialization: ${specialization}`);
        }
        targetData = entry;
    }

    // Create enriched element
    const span = document.createElement("span");
    span.className = "rt-enricher rt-enricher-skill";
    span.dataset.enricherType = "skill";
    span.dataset.enricherConfig = specialization ? `${skillKey}:${specialization}` : skillKey;
    span.dataset.actorUuid = actor.uuid;

    // Build tooltip data
    const tooltipData = {
        label: specialization ? `${skillData.label} (${targetData.name})` : skillData.label,
        current: targetData.current,
        characteristic: skillData.characteristic,
        trained: targetData.trained,
        plus10: targetData.plus10,
        plus20: targetData.plus20,
        bonus: targetData.bonus
    };
    span.dataset.tooltip = JSON.stringify(tooltipData);

    // Create label
    const displayLabel = label || `${tooltipData.label} (${targetData.current}%)`;
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
async function enrichModifier(match, options) {
    let { config, label } = match.groups;
    const parts = config.trim().split(/\s+/);
    
    if (parts.length < 2) {
        return createErrorElement(match[0], "Invalid modifier format");
    }

    const [stat, value] = parts;
    const numValue = parseInt(value);

    if (isNaN(numValue)) {
        return createErrorElement(match[0], "Invalid modifier value");
    }

    // Create enriched element
    const span = document.createElement("span");
    span.className = `rt-enricher rt-enricher-modifier ${numValue >= 0 ? "positive" : "negative"}`;
    span.dataset.enricherType = "modifier";
    span.dataset.enricherConfig = config;

    const displayLabel = label || `${stat} ${numValue >= 0 ? "+" : ""}${numValue}`;
    const icon = numValue >= 0 ? "arrow-up" : "arrow-down";
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
async function enrichArmor(match, options) {
    let { config, label } = match.groups;
    config = config.trim().toLowerCase();

    // Get actor from relativeTo
    const actor = options.relativeTo;
    if (!actor || actor.documentName !== "Actor") {
        return createErrorElement(match[0], "No actor context");
    }

    const armorData = actor.system.armour;
    if (!armorData) {
        return createErrorElement(match[0], "No armor data");
    }

    // Create enriched element
    const span = document.createElement("span");
    span.className = "rt-enricher rt-enricher-armor";
    span.dataset.enricherType = "armor";
    span.dataset.enricherConfig = config;
    span.dataset.actorUuid = actor.uuid;

    let displayValue, tooltipData;

    if (config === "all") {
        // Show all armor locations
        const locations = ["head", "body", "leftArm", "rightArm", "leftLeg", "rightLeg"];
        const values = locations.map(loc => armorData[loc]?.total || 0);
        displayValue = `${Math.min(...values)}-${Math.max(...values)} AP`;
        
        tooltipData = {};
        locations.forEach(loc => {
            const locData = armorData[loc];
            tooltipData[loc] = {
                total: locData?.total || 0,
                toughnessBonus: locData?.toughnessBonus || 0,
                value: locData?.value || 0
            };
        });
    } else {
        // Single location
        const locData = armorData[config];
        if (!locData) {
            return createErrorElement(match[0], `Unknown armor location: ${config}`);
        }
        
        displayValue = `${locData.total} AP`;
        tooltipData = {
            location: config,
            total: locData.total,
            toughnessBonus: locData.toughnessBonus,
            traitBonus: locData.traitBonus,
            value: locData.value
        };
    }

    span.dataset.tooltip = JSON.stringify(tooltipData);

    const displayLabel = label || displayValue;
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
function createErrorElement(original, error) {
    const span = document.createElement("span");
    span.className = "rt-enricher rt-enricher-error";
    span.title = error;
    span.textContent = original;
    return span;
}

/* -------------------------------------------- */

/**
 * Handle clicks on enriched elements.
 * @param {MouseEvent} event  The click event.
 */
async function handleEnricherClick(event) {
    const enricher = event.target.closest(".rt-enricher");
    if (!enricher) return;

    const type = enricher.dataset.enricherType;
    const config = enricher.dataset.enricherConfig;
    const actorUuid = enricher.dataset.actorUuid;

    if (!actorUuid) return;

    const actor = await fromUuid(actorUuid);
    if (!actor) return;

    event.preventDefault();
    event.stopPropagation();

    switch (type) {
        case "characteristic":
            if (actor.rollCharacteristic) {
                await actor.rollCharacteristic(config);
            }
            break;

        case "skill":
            if (actor.rollSkill) {
                const [skillKey, specialization] = config.split(":");
                await actor.rollSkill(skillKey, specialization);
            }
            break;

        // Modifiers and armor are display-only (no click action)
        case "modifier":
        case "armor":
        default:
            break;
    }
}
