/**
 * @file StatBlockParser - Import NPC data from various formats
 * Phase 6: Advanced GM Tools
 *
 * Provides:
 * - Parse JSON stat blocks
 * - Parse structured text (common stat block layouts)
 * - Parse freeform text with pattern matching
 * - Preview and validate before import
 * - Comprehensive validation with detailed feedback
 */

import ThreatCalculator from './threat-calculator.mjs';
import { SkillKeyHelper } from '../../helpers/skill-key-helper.mjs';
import StatBlockValidator from '../../utils/stat-block-validator.mjs';
import TextPatternExtractor from '../../utils/text-pattern-extractor.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Dialog for parsing and importing NPC stat blocks.
 * @extends {ApplicationV2}
 */
export default class StatBlockParser extends HandlebarsApplicationMixin(ApplicationV2) {
    /* -------------------------------------------- */
    /*  Static Configuration                        */
    /* -------------------------------------------- */

    /** @override */
    static DEFAULT_OPTIONS = {
        id: 'stat-block-parser-{id}',
        classes: ['rogue-trader', 'stat-block-parser'],
        tag: 'form',
        window: {
            title: 'RT.NPC.Import.Title',
            icon: 'fa-solid fa-file-import',
            minimizable: false,
            resizable: true,
            contentClasses: ['standard-form'],
        },
        position: {
            width: 800,
            height: 700,
        },
        form: {
            handler: StatBlockParser._onSubmit,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        actions: {
            parse: StatBlockParser._onParse,
            cancel: StatBlockParser._onCancel,
            clearInput: StatBlockParser._onClearInput,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/rogue-trader/templates/dialogs/stat-block-parser.hbs',
        },
    };

    /* -------------------------------------------- */
    /*  Static Patterns                             */
    /* -------------------------------------------- */

    /**
     * Common patterns for parsing stat blocks.
     * @type {Object}
     */
    static PATTERNS = {
        // Characteristic patterns
        characteristic: /\b(WS|BS|S|T|Ag|Int|Per|WP|Fel|Inf)\s*[:=]?\s*(\d{1,3})/gi,
        characteristicLong:
            /\b(Weapon Skill|Ballistic Skill|Strength|Toughness|Agility|Intelligence|Perception|Willpower|Fellowship|Influence)\s*[:=]?\s*(\d{1,3})/gi,

        // Wounds
        wounds: /\bWounds\s*[:=]?\s*(\d+)/i,

        // Movement
        movement: /\bMovement\s*[:=]?\s*(\d+)(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?(?:\s*\/\s*(\d+))?/i,
        movementNamed: /\b(Half|Full|Charge|Run)\s*[:=]?\s*(\d+)/gi,

        // Armour
        armourAll: /\bAll\s*(\d+)/i,
        armour: /\b(?:Armou?r|AP)\s*[:=]?\s*(\d+)/i,
        armourByLocation: /\b(Head|Body|Arms?|Legs?)\s*[:=]?\s*(\d+)/gi,

        // Skills
        skillList: /Skills?\s*[:=]?\s*(.+?)(?=\n\n|\nTalents?|\nTraits?|\nWeapons?|\nArmou?r|\nGear|\nAdditional|\nThreat|$)/is,

        // Talents
        talentList: /Talents?\s*[:=]?\s*(.+?)(?=\n\n|\nTraits?|\nWeapons?|\nArmou?r|\nGear|\nAdditional|\nThreat|$)/is,

        // Traits
        traitList: /Traits?\s*[:=]?\s*(.+?)(?=\n\n|\nWeapons?|\nArmou?r|\nGear|\nAdditional|\nThreat|$)/is,

        // Weapons
        weaponList: /Weapons?\s*[:=]?\s*(.+?)(?=\n\n|\nArmou?r|\nGear|\nAdditional|\nThreat|$)/is,

        // Threat/Type
        threat: /\bThreat\s*(?:Level|Rating)?\s*[:=]?\s*(\d+)/i,
        threatLabel: /\bThreat\s*Rating\s*[:=]?\s*([A-Za-z\s]+)/i,
        npcType: /\b(Troop|Elite|Master|Horde|Swarm|Creature|Daemon|Xenos)\b/i,

        // Name extraction
        name: /^([A-Z][A-Za-z\s'-]+)(?:\n|$)/m,
    };

    static SECTION_HEADERS = [
        'skills',
        'talents',
        'traits',
        'weapons',
        'armour',
        'armor',
        'wounds',
        'movement',
        'gear',
        'additional',
        'notes',
        'description',
        'threat',
        'threat rating',
    ];

    /**
     * Characteristic short to key mapping.
     * @type {Object}
     */
    static CHAR_MAP = {
        'WS': 'weaponSkill',
        'BS': 'ballisticSkill',
        'S': 'strength',
        'T': 'toughness',
        'Ag': 'agility',
        'Int': 'intelligence',
        'Per': 'perception',
        'WP': 'willpower',
        'Fel': 'fellowship',
        'Inf': 'influence',
        'Weapon Skill': 'weaponSkill',
        'Ballistic Skill': 'ballisticSkill',
        'Strength': 'strength',
        'Toughness': 'toughness',
        'Agility': 'agility',
        'Intelligence': 'intelligence',
        'Perception': 'perception',
        'Willpower': 'willpower',
        'Fellowship': 'fellowship',
        'Influence': 'influence',
    };

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Raw input text.
     * @type {string}
     */
    #rawInput = '';

    /**
     * Target actor to update instead of creating new.
     * @type {Actor|null}
     */
    #targetActor = null;

    /**
     * Parsed data preview.
     * @type {Object|null}
     */
    #parsedData = null;

    /**
     * Parse errors.
     * @type {Array<string>}
     */
    #errors = [];

    /**
     * Parse warnings.
     * @type {Array<string>}
     */
    #warnings = [];

    /**
     * Parse info messages.
     * @type {Array<string>}
     */
    #info = [];

    /**
     * Promise resolver.
     * @type {Function|null}
     */
    #resolve = null;

    /**
     * Whether submission occurred.
     * @type {boolean}
     */
    #submitted = false;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const parsedData = this.#parsedData;
        const previewSkills = parsedData?.system?.trainedSkills ? Object.values(parsedData.system.trainedSkills) : [];
        const previewTalents = parsedData?.items?.filter((item) => item.type === 'talent') ?? [];
        const previewTraits = parsedData?.items?.filter((item) => item.type === 'trait') ?? [];
        const previewWeapons = parsedData?.system?.weapons?.simple ?? [];

        return {
            ...context,
            rawInput: this.#rawInput,
            parsedData: this.#parsedData,
            previewSkills,
            previewTalents,
            previewTraits,
            previewWeapons,
            hasPreviewSkills: previewSkills.length > 0,
            hasPreviewTalents: previewTalents.length > 0,
            hasPreviewTraits: previewTraits.length > 0,
            hasPreviewWeapons: previewWeapons.length > 0,
            errors: this.#errors,
            warnings: this.#warnings,
            info: this.#info,
            hasParsed: this.#parsedData !== null,
            hasErrors: this.#errors.length > 0,
            hasWarnings: this.#warnings.length > 0,
            hasInfo: this.#info.length > 0,
            canImport: this.#parsedData !== null && this.#errors.length === 0,
            buttons: [
                { type: 'button', action: 'parse', icon: 'fa-solid fa-magnifying-glass', label: 'RT.NPC.Import.Parse', cssClass: 'secondary' },
                { type: 'submit', icon: 'fa-solid fa-file-import', label: 'RT.NPC.Import.Import', cssClass: 'primary', disabled: !this.#parsedData },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /** @override */
    _onRender(context, options) {
        super._onRender(context, options);

        // Track input changes
        const textarea = this.element.querySelector('[name="rawInput"]');
        if (textarea) {
            textarea.addEventListener('input', (e) => {
                this.#rawInput = e.target.value;
            });
        }
    }

    /* -------------------------------------------- */
    /*  Parsing Methods                             */
    /* -------------------------------------------- */

    /**
     * Parse input text and detect format.
     * @param {string} input - Raw input text.
     * @returns {Object} Parsed NPC data with validation.
     */
    static parse(input) {
        const trimmed = input.trim();

        if (!trimmed) {
            return {
                data: null,
                errors: ['No stat block text provided.'],
                warnings: [],
                info: [],
            };
        }

        let parseResult;

        // Detect JSON
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            parseResult = this.parseJSON(trimmed);
        } else {
            // Parse as text
            parseResult = this.parseText(trimmed);
        }

        // Run validation on parsed data if we have any
        if (parseResult.data) {
            const validation = StatBlockValidator.validate(parseResult.data);

            // Merge validation results with parse results
            parseResult.errors = [...parseResult.errors, ...validation.errors];
            parseResult.warnings = [...parseResult.warnings, ...validation.warnings];
            parseResult.info = validation.info || [];
        }

        return parseResult;
    }

    /**
     * Parse JSON format input.
     * @param {string} input - JSON string.
     * @returns {Object} Parsed data with validation.
     */
    static parseJSON(input) {
        const result = {
            data: null,
            errors: [],
            warnings: [],
            info: [],
        };

        try {
            const parsed = JSON.parse(input);

            // Check if it's a full actor export
            if (parsed.system && parsed.type) {
                result.data = {
                    name: parsed.name || 'Imported NPC',
                    img: parsed.img || 'icons/svg/mystery-man.svg',
                    type: parsed.type === 'npcV2' ? 'npcV2' : 'npcV2',
                    system: parsed.system,
                    items: parsed.items || [],
                };
            }
            // Check if it's just system data
            else if (parsed.characteristics || parsed.threatLevel) {
                result.data = {
                    name: parsed.name || 'Imported NPC',
                    img: 'icons/svg/mystery-man.svg',
                    type: 'npcV2',
                    system: parsed,
                    items: [],
                };
            } else {
                result.errors.push('Unrecognized JSON format. Expected actor export or system data.');
            }

            // Validate required fields
            if (result.data) {
                if (!result.data.system.characteristics) {
                    result.warnings.push('No characteristics found. Default values will be used.');
                }
                if (!result.data.system.wounds) {
                    result.warnings.push('No wounds found. Default value will be used.');
                }
            }
        } catch (err) {
            result.errors.push(`Invalid JSON: ${err.message}`);
        }

        return result;
    }

    /**
     * Parse structured text format.
     * @param {string} input - Text input.
     * @returns {Object} Parsed data with validation.
     */
    static parseText(input) {
        const result = {
            data: null,
            errors: [],
            warnings: [],
            info: [],
        };
        const sanitized = this._normalizeInput(input);
        const lines = this._splitLines(sanitized);

        // Start with default NPC data
        const systemData = ThreatCalculator.generateNPCData({ threatLevel: 5 });

        // Extract name
        const name = this._extractName(lines, sanitized);

        // Extract characteristics
        const characteristicResult = this._parseCharacteristics(lines, sanitized);
        if (characteristicResult.hasValues) {
            this._applyCharacteristics(systemData, characteristicResult);
        } else {
            result.warnings.push('No characteristics found. Using defaults based on threat level.');
        }

        // Extract wounds
        const wounds = this._parseWounds(sanitized);
        if (wounds !== null) {
            systemData.wounds.max = wounds;
            systemData.wounds.value = wounds;
        } else {
            result.warnings.push('No wounds found. Using default value.');
        }

        // Extract movement
        const movement = this._parseMovement(sanitized);
        if (movement) {
            systemData.movement.half = movement.half;
            systemData.movement.full = movement.full;
            systemData.movement.charge = movement.charge;
            systemData.movement.run = movement.run;
        }

        // Extract armour
        const armourText = this._extractSection(lines, 'armour') || this._extractSection(lines, 'armor');
        const armour = this._parseArmour(armourText || sanitized);
        if (armour) {
            if (armour.mode === 'locations') {
                systemData.armour.mode = 'locations';
                systemData.armour.locations = armour.locations;
            } else {
                systemData.armour.mode = 'simple';
                systemData.armour.total = armour.total;
            }
        }

        // Extract threat level
        const threatLevel = this._parseThreatLevel(sanitized);
        if (threatLevel) {
            systemData.threatLevel = threatLevel;
        }

        // Extract NPC type
        const typeMatch = sanitized.match(this.PATTERNS.npcType);
        if (typeMatch) {
            systemData.type = typeMatch[1].toLowerCase();
        }

        // Extract skills
        const skillsText = this._extractSection(lines, 'skills') || this._extractSkillSectionFallback(sanitized);
        const skills = this._parseSkills(skillsText);
        if (skills.hasEntries) {
            systemData.trainedSkills = { ...systemData.trainedSkills, ...skills.trainedSkills };
        }

        // Extract weapons
        const weaponText = this._extractSection(lines, 'weapons') || this._extractWeaponSectionFallback(sanitized);
        const weapons = this._parseWeapons(weaponText);
        if (weapons.length > 0) {
            systemData.weapons.mode = 'simple';
            systemData.weapons.simple = weapons;
        }

        // Extract talents
        const talentsText = this._extractSection(lines, 'talents');
        const talentItems = this._parseTalents(talentsText);

        // Extract traits
        const traitsText = this._extractSection(lines, 'traits');
        const traitResult = this._parseTraits(traitsText);
        const traitItems = traitResult.items;
        this._applyTraitAdjustments(systemData, traitResult.parsedTraits);

        // Additional notes
        const additionalText = this._extractSection(lines, 'additional') || this._extractSection(lines, 'notes');
        if (additionalText) {
            systemData.description = additionalText;
        }

        // Build final data
        result.data = {
            name,
            img: 'icons/svg/mystery-man.svg',
            type: 'npcV2',
            system: systemData,
            items: [...talentItems, ...traitItems],
        };

        return result;
    }

    static _normalizeInput(input) {
        return TextPatternExtractor.normalizeInput(input);
    }

    static _splitLines(input) {
        return TextPatternExtractor.splitLines(input);
    }

    static _extractName(lines, input) {
        if (lines.length === 0) return 'Imported NPC';
        const firstLine = lines[0];
        if (this._looksLikeCharacteristicHeader(firstLine)) {
            const nameMatch = input.match(this.PATTERNS.name);
            return nameMatch ? nameMatch[1].trim() : 'Imported NPC';
        }
        if (this._isSectionHeader(firstLine)) {
            return 'Imported NPC';
        }
        return firstLine;
    }

    static _looksLikeCharacteristicHeader(line) {
        const required = ['WS', 'BS', 'S', 'T', 'Ag', 'Int', 'Per', 'WP', 'Fel'];
        return TextPatternExtractor.looksLikeHeader(line, required);
    }

    static _parseCharacteristics(lines, input) {
        const result = {
            values: {},
            unnaturalValues: {},
            hasValues: false,
        };

        const headerIndex = lines.findIndex((line) => this._looksLikeCharacteristicHeader(line));
        if (headerIndex >= 0) {
            const headers = lines[headerIndex].split(/\s+/).map((token) => token.trim());
            const potentialUnnatural = lines[headerIndex + 1] || '';
            const hasUnnaturalRow = /\(\d+\)/.test(potentialUnnatural);
            const valueLine = hasUnnaturalRow ? lines[headerIndex + 2] || '' : lines[headerIndex + 1] || '';
            const values = this._extractValueTokens(valueLine);
            const unnatural = hasUnnaturalRow ? this._extractParentheticalNumbers(potentialUnnatural) : [];
            const mapUnnatural = unnatural.length === headers.length;

            headers.forEach((header, index) => {
                const key = this.CHAR_MAP[header];
                if (!key) return;
                const valueToken = values[index] ?? '-';
                const baseValue = this._parseNumericValue(valueToken);
                result.values[key] = baseValue;
                if (mapUnnatural) {
                    const unnaturalValue = unnatural[index];
                    if (unnaturalValue !== null && unnaturalValue !== undefined) {
                        result.unnaturalValues[key] = unnaturalValue;
                    }
                }
            });

            result.hasValues = Object.keys(result.values).length > 0;
        }

        const shortMatches = [...input.matchAll(this.PATTERNS.characteristic)];
        const longMatches = [...input.matchAll(this.PATTERNS.characteristicLong)];
        const allMatches = [...shortMatches, ...longMatches];
        for (const match of allMatches) {
            const key = this.CHAR_MAP[match[1]];
            if (!key) continue;
            if (result.values[key] !== undefined) continue;
            const value = parseInt(match[2], 10);
            if (!Number.isNaN(value)) {
                result.values[key] = value;
                result.hasValues = true;
            }
        }

        return result;
    }

    static _applyCharacteristics(systemData, characteristicResult) {
        for (const [key, value] of Object.entries(characteristicResult.values)) {
            if (!systemData.characteristics[key]) continue;
            systemData.characteristics[key].base = value;
            systemData.characteristics[key].total = value;
            systemData.characteristics[key].bonus = Math.floor(value / 10);
        }

        for (const [key, bonusValue] of Object.entries(characteristicResult.unnaturalValues)) {
            const base = systemData.characteristics[key]?.base ?? 0;
            const baseBonus = Math.floor(base / 10) || 1;
            const multiplier = Math.max(2, Math.round(bonusValue / baseBonus));
            systemData.characteristics[key].unnatural = multiplier;
        }
    }

    static _parseWounds(input) {
        const match = input.match(this.PATTERNS.wounds);
        if (!match) return null;
        const value = parseInt(match[1], 10);
        return Number.isNaN(value) ? null : value;
    }

    static _parseMovement(input) {
        const match = input.match(this.PATTERNS.movement);
        if (match) {
            const values = [match[1], match[2], match[3], match[4]].filter((value) => value).map((value) => parseInt(value, 10));
            if (values.length === 1) {
                return {
                    half: values[0],
                    full: values[0] * 2,
                    charge: values[0] * 3,
                    run: values[0] * 6,
                };
            }
            if (values.length >= 4) {
                return {
                    half: values[0],
                    full: values[1],
                    charge: values[2],
                    run: values[3],
                };
            }
        }

        const namedMatches = [...input.matchAll(this.PATTERNS.movementNamed)];
        if (namedMatches.length > 0) {
            const movement = {};
            for (const match of namedMatches) {
                movement[match[1].toLowerCase()] = parseInt(match[2], 10);
            }
            if (movement.half && movement.full && movement.charge && movement.run) {
                return movement;
            }
        }
        return null;
    }

    static _parseArmour(text) {
        if (!text) return null;
        const normalized = text.replace(/\./g, ' ');
        const locations = this._parseArmourLocations(normalized);
        if (locations) {
            return { mode: 'locations', locations };
        }

        const allMatch = normalized.match(/\bAll\s*(\d+)/i) || normalized.match(/\b(\d+)\s*All\b/i);
        if (allMatch) {
            const total = parseInt(allMatch[1], 10);
            return Number.isNaN(total) ? null : { mode: 'simple', total };
        }

        const armourMatch = normalized.match(this.PATTERNS.armour);
        if (armourMatch) {
            const total = parseInt(armourMatch[1], 10);
            return Number.isNaN(total) ? null : { mode: 'simple', total };
        }

        return null;
    }

    static _parseArmourLocations(text) {
        const matches = [...text.matchAll(this.PATTERNS.armourByLocation)];
        if (matches.length === 0) return null;
        const locations = {
            head: 0,
            body: 0,
            leftArm: 0,
            rightArm: 0,
            leftLeg: 0,
            rightLeg: 0,
        };

        for (const match of matches) {
            const location = match[1].toLowerCase();
            const value = parseInt(match[2], 10);
            if (Number.isNaN(value)) continue;
            if (location === 'head') locations.head = value;
            if (location === 'body') locations.body = value;
            if (location.startsWith('arm')) {
                locations.leftArm = value;
                locations.rightArm = value;
            }
            if (location.startsWith('leg')) {
                locations.leftLeg = value;
                locations.rightLeg = value;
            }
        }

        return locations;
    }

    static _parseThreatLevel(input) {
        const match = input.match(this.PATTERNS.threat);
        if (match) {
            const value = parseInt(match[1], 10);
            if (!Number.isNaN(value)) return value;
        }

        const labelMatch = input.match(this.PATTERNS.threatLabel);
        if (labelMatch) {
            const label = labelMatch[1].toLowerCase();
            if (label.includes('minoris')) return 5;
            if (label.includes('medius')) return 10;
            if (label.includes('gravis')) return 15;
            if (label.includes('extremis')) return 20;
            if (label.includes('maximus')) return 25;
        }

        return null;
    }

    static _parseSkills(text) {
        if (!text) return { trainedSkills: {}, hasEntries: false };
        const entries = this._splitList(text);
        const trainedSkills = {};

        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;

            const { name, specialization, characteristic, level } = this._parseSkillEntry(cleaned);
            if (!name) continue;

            const baseKey = SkillKeyHelper.nameToKey(name) || this._toSkillKey(name);
            const key = specialization ? `${baseKey}${this._toSkillKey(specialization, true)}` : baseKey;
            trainedSkills[key] = {
                name: specialization ? `${name} (${specialization})` : name,
                characteristic: characteristic || this._characteristicKeyFromShort(SkillKeyHelper.getCharacteristic(baseKey)) || 'perception',
                trained: true,
                plus10: level === 'plus10' || level === 'plus20',
                plus20: level === 'plus20',
                bonus: 0,
            };
        }

        return { trainedSkills, hasEntries: Object.keys(trainedSkills).length > 0 };
    }

    static _parseTalents(text) {
        if (!text) return [];
        const entries = this._splitList(text);
        const items = [];

        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;
            const withoutFootnotes = cleaned.replace(/[\u2020*]+$/g, '').trim();
            const { baseName, specializations } = this._parseNameWithSpecializations(withoutFootnotes);
            if (specializations.length > 0) {
                for (const specialization of specializations) {
                    items.push({
                        name: `${baseName} (${specialization})`,
                        type: 'talent',
                        system: {},
                    });
                }
            } else {
                items.push({ name: baseName, type: 'talent', system: {} });
            }
        }

        return items;
    }

    static _parseTraits(text) {
        const result = {
            items: [],
            parsedTraits: [],
        };
        if (!text) return result;

        const entries = this._splitList(text);
        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;
            const parsed = this._parseTraitEntry(cleaned);
            if (!parsed.name) continue;
            result.parsedTraits.push(parsed);
            result.items.push({
                name: parsed.displayName,
                type: 'trait',
                system: parsed.level !== null ? { level: parsed.level, notes: parsed.notes } : { notes: parsed.notes },
            });
        }

        return result;
    }

    static _applyTraitAdjustments(systemData, traits) {
        if (!traits || traits.length === 0) return;
        const sizeMap = {
            tiny: 1,
            puny: 2,
            scrawny: 3,
            average: 4,
            hulking: 5,
            massive: 6,
            enormous: 7,
            monstrous: 8,
            colossal: 9,
            gargantuan: 10,
        };

        for (const trait of traits) {
            if (trait.name.toLowerCase() === 'size' && trait.value) {
                const sizeKey = trait.value.toLowerCase();
                if (sizeMap[sizeKey]) {
                    systemData.size = sizeMap[sizeKey];
                }
            }

            if (trait.name.toLowerCase().startsWith('unnatural')) {
                const key = this._unnaturalCharacteristicKey(trait.name);
                if (key && trait.numericValue) {
                    systemData.characteristics[key].unnatural = trait.numericValue;
                }
            }
        }
    }

    static _parseWeapons(text) {
        if (!text) return [];
        const entries = this._splitList(text);
        const weapons = [];

        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;
            const weapon = this._parseWeaponEntry(cleaned);
            if (weapon) weapons.push(weapon);
        }

        return weapons;
    }

    static _parseWeaponEntry(entry) {
        const match = entry.match(/^([^()]+)\s*(?:\((.+)\))?$/);
        if (!match) return null;
        const name = match[1].trim();
        const details = (match[2] || '').trim();
        if (!name) return null;

        const segments = details
            ? details
                  .split(';')
                  .map((segment) => segment.trim())
                  .filter(Boolean)
            : [];
        let range = 'Melee';
        let rof = 'S/-/-';
        let damage = '1d10';
        let pen = 0;
        let clip = 0;
        let reload = '-';
        const qualities = [];

        for (const segment of segments) {
            const rangeMatch = segment.match(/(\d+)\s*m/i);
            if (rangeMatch) {
                range = `${rangeMatch[1]}m`;
                continue;
            }
            const rofMatch = segment.match(/([SBF])\s*\/\s*([0-9-]+)\s*\/\s*([0-9-]+)/i);
            if (rofMatch) {
                rof = `${rofMatch[1].toUpperCase()}/${rofMatch[2]}/${rofMatch[3]}`;
                continue;
            }
            const damageMatch = segment.match(/(\d+d\d+(?:[+-]\d+)?)\s*([IRXET])?/i);
            if (damageMatch) {
                damage = damageMatch[1];
                continue;
            }
            const penMatch = segment.match(/Pen\s*(\d+)/i);
            if (penMatch) {
                pen = parseInt(penMatch[1], 10);
                continue;
            }
            const clipMatch = segment.match(/Clip\s*(\d+)/i);
            if (clipMatch) {
                clip = parseInt(clipMatch[1], 10);
                continue;
            }
            const reloadMatch = segment.match(/Reload\s*(.+)/i);
            if (reloadMatch) {
                reload = reloadMatch[1].trim();
                continue;
            }
            qualities.push(segment);
        }

        const damagePenMatch = details.match(/(\d+d\d+(?:[+-]\d+)?)\s*([IRXET])?/i);
        if (damagePenMatch) {
            damage = damagePenMatch[1];
        }
        const penMatch = details.match(/Pen\s*(\d+)/i);
        if (penMatch) {
            pen = parseInt(penMatch[1], 10);
        }

        const special = qualities.join(', ');
        const weaponClass = this._inferWeaponClass(name, range);

        return {
            name,
            damage,
            pen: Number.isNaN(pen) ? 0 : pen,
            range,
            rof,
            clip: Number.isNaN(clip) ? 0 : clip,
            reload,
            special,
            class: weaponClass,
        };
    }

    static _inferWeaponClass(name, range) {
        const lower = name.toLowerCase();
        if (range.toLowerCase() === 'melee') return 'melee';
        if (lower.includes('pistol')) return 'pistol';
        if (lower.includes('launcher') || lower.includes('missile')) return 'launcher';
        if (lower.includes('heavy')) return 'heavy';
        return 'basic';
    }

    static _parseSkillEntry(entry) {
        const bonusMatch = entry.match(/\+\s*(\d+)/);
        const bonusValue = bonusMatch ? parseInt(bonusMatch[1], 10) : 0;
        let level = 'trained';
        if (bonusValue >= 20) level = 'plus20';
        else if (bonusValue >= 10) level = 'plus10';

        const groups = [...entry.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].trim());
        let characteristic = null;
        let specialization = null;
        if (groups.length > 0) {
            const lastGroup = groups[groups.length - 1];
            if (this.CHAR_MAP[lastGroup] || this.CHAR_MAP[this._normalizeShortCharacteristic(lastGroup)]) {
                characteristic = lastGroup;
                if (groups.length > 1) {
                    specialization = groups.slice(0, -1).join(' ');
                }
            } else {
                specialization = groups.join(' ');
            }
        }

        let name = entry
            .replace(/\([^)]*\)/g, '')
            .replace(/\+\s*\d+/g, '')
            .trim();
        name = name.replace(/\s{2,}/g, ' ');

        return {
            name,
            specialization,
            characteristic: characteristic ? this._characteristicKeyFromShort(characteristic) : null,
            level,
        };
    }

    static _parseTraitEntry(entry) {
        const match = entry.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
        const name = match ? match[1].trim() : entry.trim();
        const value = match && match[2] ? match[2].trim() : null;
        let numericValue = null;
        let level = null;
        let notes = '';
        let displayName = name;

        if (value) {
            const numericMatch = value.match(/\d+/);
            if (numericMatch) {
                numericValue = parseInt(numericMatch[0], 10);
                level = numericValue;
                displayName = `${name} (${value})`;
            } else {
                notes = value;
                displayName = `${name} (${value})`;
            }
        }

        if (value && value.toLowerCase().startsWith('x')) {
            const multiplier = parseInt(value.slice(1), 10);
            if (!Number.isNaN(multiplier)) {
                numericValue = multiplier;
                level = multiplier;
            }
        }

        return {
            name,
            value,
            numericValue,
            level,
            notes,
            displayName,
        };
    }

    static _parseNameWithSpecializations(name) {
        const match = name.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (!match) {
            return { baseName: name, specializations: [] };
        }
        const baseName = match[1].trim();
        const specializationText = match[2].trim();
        const specializations = specializationText
            .split(',')
            .map((spec) => spec.trim())
            .filter(Boolean);
        return { baseName, specializations };
    }

    static _extractSection(lines, label) {
        return TextPatternExtractor.extractSection(lines, label, this.SECTION_HEADERS);
    }

    static _isSectionHeader(line) {
        return TextPatternExtractor.isSectionHeader(line, this.SECTION_HEADERS);
    }

    static _splitList(text) {
        return TextPatternExtractor.splitList(text);
    }

    static _cleanEntry(entry) {
        return TextPatternExtractor.cleanEntry(entry);
    }

    static _extractValueTokens(line) {
        return TextPatternExtractor.extractValueTokens(line);
    }

    static _extractParentheticalNumbers(line) {
        return TextPatternExtractor.extractParentheticalNumbers(line);
    }

    static _parseNumericValue(value) {
        return TextPatternExtractor.parseNumericValue(value);
    }

    static _toSkillKey(text, capitalize = false) {
        return TextPatternExtractor.toKey(text, capitalize);
    }

    static _extractSkillSectionFallback(input) {
        const match = input.match(this.PATTERNS.skillList);
        return match ? match[1].trim() : '';
    }

    static _extractWeaponSectionFallback(input) {
        const match = input.match(this.PATTERNS.weaponList);
        return match ? match[1].trim() : '';
    }

    static _characteristicKeyFromShort(short) {
        if (!short) return null;
        const normalized = this._normalizeShortCharacteristic(short);
        if (normalized === 'A') return this.CHAR_MAP.Ag;
        return this.CHAR_MAP[normalized] || this.CHAR_MAP[short] || null;
    }

    static _normalizeShortCharacteristic(short) {
        return short.replace(/\./g, '').replace(/\s+/g, '');
    }

    static _unnaturalCharacteristicKey(name) {
        const lowered = name.toLowerCase();
        if (lowered.includes('strength')) return 'strength';
        if (lowered.includes('toughness')) return 'toughness';
        if (lowered.includes('agility')) return 'agility';
        if (lowered.includes('perception')) return 'perception';
        if (lowered.includes('willpower')) return 'willpower';
        if (lowered.includes('fellowship')) return 'fellowship';
        if (lowered.includes('weapon skill')) return 'weaponSkill';
        if (lowered.includes('ballistic skill')) return 'ballisticSkill';
        if (lowered.includes('intelligence')) return 'intelligence';
        return null;
    }

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle parse button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async _onParse(event, target) {
        const result = StatBlockParser.parse(this.#rawInput);

        this.#parsedData = result.data;
        this.#errors = result.errors;
        this.#warnings = result.warnings;
        this.#info = result.info || [];

        this.render({ parts: ['form'] });
    }

    /**
     * Handle form submission.
     * @param {Event} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static async _onSubmit(event, form, formData) {
        if (!this.#parsedData) {
            ui.notifications.error('No valid data to import. Parse input first.');
            return;
        }

        try {
            if (this.#targetActor) {
                const updateData = {
                    system: this.#parsedData.system,
                };
                if (this.#parsedData.name && this.#parsedData.name !== 'Imported NPC') {
                    updateData.name = this.#parsedData.name;
                }

                await this.#targetActor.update(updateData);

                if (this.#parsedData.items?.length > 0) {
                    await this.#targetActor.createEmbeddedDocuments('Item', this.#parsedData.items);
                }

                ui.notifications.info(game.i18n.format('RT.NPC.Import.Success', { name: this.#targetActor.name }));
                this.#targetActor.sheet.render(true);

                this.#submitted = true;
                if (this.#resolve) this.#resolve(this.#targetActor);
                return;
            }

            const actorData = {
                name: this.#parsedData.name,
                type: this.#parsedData.type,
                img: this.#parsedData.img,
                system: this.#parsedData.system,
            };

            const actor = await Actor.create(actorData);

            // Create embedded items if any
            if (this.#parsedData.items?.length > 0) {
                await actor.createEmbeddedDocuments('Item', this.#parsedData.items);
            }

            ui.notifications.info(game.i18n.format('RT.NPC.Import.Success', { name: actor.name }));
            actor.sheet.render(true);

            this.#submitted = true;
            if (this.#resolve) this.#resolve(actor);
        } catch (err) {
            console.error('Failed to import NPC:', err);
            ui.notifications.error(game.i18n.localize('RT.NPC.Import.Failed'));
            if (this.#resolve) this.#resolve(null);
        }
    }

    /**
     * Handle cancel button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async _onCancel(event, target) {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /**
     * Handle clear input button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async _onClearInput(event, target) {
        this.#rawInput = '';
        this.#parsedData = null;
        this.#errors = [];
        this.#warnings = [];
        this.#info = [];
        this.render({ parts: ['form'] });
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    async close(options = {}) {
        if (!this.#submitted && this.#resolve) {
            this.#resolve(null);
        }
        return super.close(options);
    }

    /* -------------------------------------------- */
    /*  Public API                                  */
    /* -------------------------------------------- */

    /**
     * Wait for import completion.
     * @returns {Promise<Actor|null>} Created actor or null.
     */
    async wait() {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            this.render(true);
        });
    }

    /**
     * Open the parser dialog.
     * @param {string} [initialInput=""] - Optional initial input.
     * @returns {Promise<Actor|null>} Created actor or null.
     */
    static async open(initialInput = '') {
        let input = initialInput;
        let options = {};
        if (typeof initialInput === 'object' && initialInput !== null) {
            options = initialInput;
            input = initialInput.initialInput ?? '';
        }

        const { actor, initialInput: _ignored, ...appOptions } = options;
        const parser = new this(appOptions);
        parser.#rawInput = input;
        parser.#targetActor = actor ?? null;
        return parser.wait();
    }

    /**
     * Quick parse without dialog (returns data only, doesn't create actor).
     * @param {string} input - Input to parse.
     * @returns {Object} Parse result with data, errors, warnings.
     */
    static quickParse(input) {
        return this.parse(input);
    }
}
