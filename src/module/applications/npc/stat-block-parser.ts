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

import { SkillKeyHelper } from '../../helpers/skill-key-helper.ts';
import StatBlockValidator, { type StatBlockData } from '../../utils/stat-block-validator.ts';
import TextPatternExtractor from '../../utils/text-pattern-extractor.ts';
import ThreatCalculator, {
    type NPCArmourData,
    type NPCArmourLocations,
    type NPCMovement,
    type NPCSkills,
    type NPCSystemData,
    type NPCWeapon,
} from './threat-calculator.ts';

/** Shape of a characteristic entry inside NPCSystemData.characteristics. */
interface NPCCharacteristicEntry {
    base: number;
    total: number;
    bonus: number;
    unnatural?: number;
}

/** Typed view of the NPCSystemData characteristics map for safe property access. */
type NPCCharacteristicsMap = Record<string, NPCCharacteristicEntry>;

/* eslint-disable no-restricted-syntax -- boundary: Foundry Actor.update / createEmbeddedDocuments signatures use opaque bags */
/** Minimal interface for the target actor that can be updated by the import dialog. */
interface ImportTargetActor {
    update: (data: Record<string, unknown>) => Promise<unknown>;
    createEmbeddedDocuments: (type: string, data: unknown[]) => Promise<unknown>;
    name: string;
    sheet: { render: (force: boolean) => void };
}

/** Shape of a parsed actor data object ready for Actor.create(). */
interface ParsedActorData {
    name: string;
    img: string;
    type: string;
    system: NPCSystemData;
    items: Array<{ name: string; type: string; system: Record<string, unknown> }>;
}
/* eslint-enable no-restricted-syntax */

/** Result returned by parseJSON / parseText / parse. */
interface ParseResult {
    data: ParsedActorData | null;
    errors: string[];
    warnings: string[];
    info: string[];
}

/** Result returned by _parseCharacteristics. */
interface CharacteristicParseResult {
    values: Record<string, number>;
    unnaturalValues: Record<string, number>;
    hasValues: boolean;
}

/** Result returned by _parseSkills. */
interface SkillsParseResult {
    trainedSkills: NPCSkills;
    hasEntries: boolean;
}

/** Result returned by _parseTraitEntry. */
interface TraitEntry {
    name: string;
    value: string | null;
    numericValue: number | null;
    level: number | null;
    notes: string;
    displayName: string;
}

/** Result returned by _parseTraits. */
interface TraitsParseResult {
    // eslint-disable-next-line no-restricted-syntax -- boundary: trait item data is destined for createEmbeddedDocuments
    items: Array<{ name: string; type: string; system: Record<string, unknown> }>;
    parsedTraits: TraitEntry[];
}

/** Result returned by _parseSkillEntry. */
interface SkillEntryParseResult {
    name: string;
    specialization: string | null;
    characteristic: string | null;
    level: string;
}

/** Result returned by _parseNameWithSpecializations. */
interface ParsedNameResult {
    baseName: string;
    specializations: string[];
}

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
    static override DEFAULT_OPTIONS = {
        id: 'stat-block-parser-{id}',
        classes: ['wh40k-rpg', 'stat-block-parser'],
        tag: 'form',
        window: {
            // eslint-disable-next-line no-restricted-syntax -- already a WH40K.* langpack key; rule false-positives on static title
            title: 'WH40K.NPC.Import.Title',
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
            /* eslint-disable-next-line no-restricted-syntax, @typescript-eslint/unbound-method -- boundary: Foundry V14 FormConfiguration handler signature is too narrow; bound via `this:` parameter declaration */
            handler: StatBlockParser._onSubmit as unknown as NonNullable<ApplicationV2Config.FormConfiguration['handler']>,
            submitOnChange: false,
            closeOnSubmit: true,
        },
        /* eslint-disable @typescript-eslint/unbound-method -- ApplicationV2 invokes action handlers with the instance as `this`; each handler declares `this: StatBlockParser` */
        actions: {
            parse: StatBlockParser._onParse,
            cancel: StatBlockParser._onCancel,
            clearInput: StatBlockParser._onClearInput,
        },
        /* eslint-enable @typescript-eslint/unbound-method */
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        form: {
            template: 'systems/wh40k-rpg/templates/dialogs/stat-block-parser.hbs',
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
    static CHAR_MAP: Record<string, string> = {
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
    #targetActor: ImportTargetActor | null = null;

    /**
     * Parsed data preview.
     * @type {Object|null}
     */
    #parsedData: ParsedActorData | null = null;

    /**
     * Parse errors.
     * @type {Array<string>}
     */
    #errors: string[] = [];

    /**
     * Parse warnings.
     * @type {Array<string>}
     */
    #warnings: string[] = [];

    /**
     * Parse info messages.
     * @type {Array<string>}
     */
    #info: string[] = [];

    /**
     * Promise resolver.
     * @type {Function|null}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolves the dialog with whatever Actor.create returns
    #resolve: ((value: unknown) => void) | null = null;

    /**
     * Whether submission occurred.
     * @type {boolean}
     */
    #submitted = false;

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @override */
    /* eslint-disable no-restricted-syntax -- boundary: ApplicationV2 hook signatures use free-form bags */
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context: Record<string, unknown> = await super._prepareContext(options);
        /* eslint-enable no-restricted-syntax */
        const parsedData = this.#parsedData;
        const previewSkills = parsedData?.system.trainedSkills !== undefined ? Object.values(parsedData.system.trainedSkills) : [];
        const previewTalents = parsedData !== null ? parsedData.items.filter((item) => item.type === 'talent') : [];
        const previewTraits = parsedData !== null ? parsedData.items.filter((item) => item.type === 'trait') : [];
        const previewWeapons = parsedData?.system.weapons.simple ?? [];

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
                {
                    type: 'button',
                    action: 'parse',
                    icon: 'fa-solid fa-magnifying-glass',
                    label: 'WH40K.NPC.Import.Parse',
                    cssClass: 'tw-bg-[var(--color-bg-btn)]',
                },
                {
                    type: 'submit',
                    icon: 'fa-solid fa-file-import',
                    label: 'WH40K.NPC.Import.Import',
                    cssClass:
                        'tw-bg-[var(--wh40k-color-accent,var(--wh40k-color-gold))] tw-text-white hover:tw-bg-[#9e801f] disabled:tw-opacity-50 disabled:tw-cursor-not-allowed',
                    disabled: !this.#parsedData,
                },
                { type: 'button', action: 'cancel', icon: 'fa-solid fa-times', label: 'Cancel' },
            ],
        };
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 hook signature
    override _onRender(context: Record<string, unknown>, options: Record<string, unknown>): void {
        void super._onRender(context, options);

        // Track input changes
        const textarea = this.element.querySelector('[name="rawInput"]');
        if (textarea) {
            textarea.addEventListener('input', (e: Event) => {
                this.#rawInput = (e.target as HTMLTextAreaElement).value;
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
    static parse(input: string): ParseResult {
        const trimmed = input.trim();

        if (!trimmed) {
            return {
                data: null,
                errors: ['No stat block text provided.'],
                warnings: [],
                info: [],
            };
        }

        let parseResult: ParseResult;

        // Detect JSON
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            parseResult = this.parseJSON(trimmed);
        } else {
            // Parse as text
            parseResult = this.parseText(trimmed);
        }

        // Run validation on parsed data if we have any
        if (parseResult.data) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: validator accepts a structurally-compatible foreign shape
            const validation = StatBlockValidator.validate(parseResult.data as unknown as StatBlockData);

            // Merge validation results with parse results
            parseResult.errors = [...parseResult.errors, ...validation.errors];
            parseResult.warnings = [...parseResult.warnings, ...validation.warnings];
            parseResult.info = validation.info;
        }

        return parseResult;
    }

    /**
     * Parse JSON format input.
     * @param {string} input - JSON string.
     * @returns {Object} Parsed data with validation.
     */
    /* eslint-disable no-restricted-syntax, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing -- boundary: parseJSON ingests user-pasted free-form JSON */
    static parseJSON(input: string): ParseResult {
        const result: ParseResult = {
            data: null,
            errors: [],
            warnings: [],
            info: [],
        };

        try {
            const parsed = JSON.parse(input) as Record<string, unknown>;

            // Check if it's a full actor export
            if (parsed['system'] && parsed['type']) {
                result.data = {
                    name: (parsed['name'] as string) || 'Imported NPC',
                    img: (parsed['img'] as string) || 'icons/svg/mystery-man.svg',
                    type: 'npcV2',
                    system: parsed['system'] as NPCSystemData,
                    items: (parsed['items'] as Array<{ name: string; type: string; system: Record<string, unknown> }>) || [],
                };
            }
            // Check if it's just system data
            else if (parsed['characteristics'] || parsed['threatLevel']) {
                result.data = {
                    name: (parsed['name'] as string) || 'Imported NPC',
                    img: 'icons/svg/mystery-man.svg',
                    type: 'npcV2',
                    system: parsed as unknown as NPCSystemData,
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
            result.errors.push(`Invalid JSON: ${(err as Error).message}`);
        }

        return result;
    }
    /* eslint-enable no-restricted-syntax, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing */

    /**
     * Parse structured text format.
     * @param {string} input - Text input.
     * @returns {Object} Parsed data with validation.
     */
    /* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing -- boundary: parseText branches on optional regex capture results; defensive truthiness checks are intentional */
    static parseText(input: string): ParseResult {
        const result: ParseResult = {
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
        if (typeMatch?.[1]) {
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
    /* eslint-enable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing */

    static _normalizeInput(input: string): string {
        return TextPatternExtractor.normalizeInput(input);
    }

    static _splitLines(input: string): string[] {
        return TextPatternExtractor.splitLines(input);
    }

    static _extractName(lines: string[], input: string): string {
        const firstLine = lines[0];
        if (firstLine === undefined) return 'Imported NPC';
        if (this._looksLikeCharacteristicHeader(firstLine)) {
            const nameMatch = input.match(this.PATTERNS.name);
            return nameMatch?.[1] ? nameMatch[1].trim() : 'Imported NPC';
        }
        if (this._isSectionHeader(firstLine)) {
            return 'Imported NPC';
        }
        return firstLine;
    }

    /* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/no-base-to-string -- boundary: parser methods branch on optional regex capture results and freeform input; defensive truthiness checks are intentional */

    static _looksLikeCharacteristicHeader(line: string): boolean {
        const required = ['WS', 'BS', 'S', 'T', 'Ag', 'Int', 'Per', 'WP', 'Fel'];
        return TextPatternExtractor.looksLikeHeader(line, required);
    }

    static _parseCharacteristics(lines: string[], input: string): CharacteristicParseResult {
        const result: CharacteristicParseResult = {
            values: {},
            unnaturalValues: {},
            hasValues: false,
        };

        const headerIndex = lines.findIndex((line) => this._looksLikeCharacteristicHeader(line));
        const headerLine = headerIndex >= 0 ? lines[headerIndex] : undefined;
        if (headerLine !== undefined) {
            const headers = headerLine.split(/\s+/).map((token) => token.trim());
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
            const matchKey = match[1];
            const matchVal = match[2];
            if (matchKey === undefined || matchVal === undefined) continue;
            const key = this.CHAR_MAP[matchKey];
            if (!key) continue;
            if (result.values[key] !== undefined) continue;
            const value = parseInt(matchVal, 10);
            if (!Number.isNaN(value)) {
                result.values[key] = value;
                result.hasValues = true;
            }
        }

        return result;
    }

    static _applyCharacteristics(systemData: NPCSystemData, characteristicResult: CharacteristicParseResult): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics map keyed by free-form string
        const chars = systemData.characteristics as unknown as NPCCharacteristicsMap;
        for (const [key, value] of Object.entries(characteristicResult.values)) {
            const entry = chars[key];
            if (!entry) continue;
            entry.base = value;
            entry.total = value;
            entry.bonus = Math.floor(value / 10);
        }

        for (const [key, bonusValue] of Object.entries(characteristicResult.unnaturalValues)) {
            const entry = chars[key];
            if (!entry) continue;
            const base = entry.base;
            const baseBonus = Math.floor(base / 10) || 1;
            const multiplier = Math.max(2, Math.round(bonusValue / baseBonus));
            entry.unnatural = multiplier;
        }
    }

    static _parseWounds(input: string): number | null {
        const match = input.match(this.PATTERNS.wounds);
        if (!match?.[1]) return null;
        const value = parseInt(match[1], 10);
        return Number.isNaN(value) ? null : value;
    }

    static _parseMovement(input: string): NPCMovement | null {
        const match = input.match(this.PATTERNS.movement);
        if (match) {
            const values = [match[1], match[2], match[3], match[4]].filter((value): value is string => Boolean(value)).map((value) => parseInt(value, 10));
            const v0 = values[0];
            if (values.length === 1 && v0 !== undefined) {
                return {
                    half: v0,
                    full: v0 * 2,
                    charge: v0 * 3,
                    run: v0 * 6,
                };
            }
            const v1 = values[1];
            const v2 = values[2];
            const v3 = values[3];
            if (values.length >= 4 && v0 !== undefined && v1 !== undefined && v2 !== undefined && v3 !== undefined) {
                return {
                    half: v0,
                    full: v1,
                    charge: v2,
                    run: v3,
                };
            }
        }

        const namedMatches = [...input.matchAll(this.PATTERNS.movementNamed)];
        if (namedMatches.length > 0) {
            const movement: Partial<NPCMovement> = {};
            for (const match of namedMatches) {
                const mKey = match[1];
                const mVal = match[2];
                if (mKey === undefined || mVal === undefined) continue;
                // eslint-disable-next-line no-restricted-syntax -- boundary: regex-extracted movement key is a free-form string
                (movement as Record<string, number>)[mKey.toLowerCase()] = parseInt(mVal, 10);
            }
            if (movement.half !== undefined && movement.full !== undefined && movement.charge !== undefined && movement.run !== undefined) {
                return movement as NPCMovement;
            }
        }
        return null;
    }

    static _parseArmour(text: string): NPCArmourData | null {
        if (!text) return null;
        const normalized = text.replace(/\./g, ' ');
        const emptyLocations: NPCArmourLocations = { head: 0, body: 0, leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
        const locations = this._parseArmourLocations(normalized);
        if (locations) {
            return { mode: 'locations', total: 0, locations };
        }

        const allMatch = normalized.match(/\bAll\s*(\d+)/i) || normalized.match(/\b(\d+)\s*All\b/i);
        if (allMatch?.[1]) {
            const total = parseInt(allMatch[1], 10);
            return Number.isNaN(total) ? null : { mode: 'simple', total, locations: emptyLocations };
        }

        const armourMatch = normalized.match(this.PATTERNS.armour);
        if (armourMatch?.[1]) {
            const total = parseInt(armourMatch[1], 10);
            return Number.isNaN(total) ? null : { mode: 'simple', total, locations: emptyLocations };
        }

        return null;
    }

    static _parseArmourLocations(text: string): NPCArmourLocations | null {
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
            const rawLoc = match[1];
            const rawVal = match[2];
            if (rawLoc === undefined || rawVal === undefined) continue;
            const location = rawLoc.toLowerCase();
            const value = parseInt(rawVal, 10);
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

    static _parseThreatLevel(input: string): number | null {
        const match = input.match(this.PATTERNS.threat);
        if (match?.[1]) {
            const value = parseInt(match[1], 10);
            if (!Number.isNaN(value)) return value;
        }

        const labelMatch = input.match(this.PATTERNS.threatLabel);
        if (labelMatch?.[1]) {
            const label = labelMatch[1].toLowerCase();
            if (label.includes('minoris')) return 5;
            if (label.includes('medius')) return 10;
            if (label.includes('gravis')) return 15;
            if (label.includes('extremis')) return 20;
            if (label.includes('maximus')) return 25;
        }

        return null;
    }

    static _parseSkills(text: string | null): SkillsParseResult {
        if (!text) return { trainedSkills: {}, hasEntries: false };
        const entries = this._splitList(text);
        const trainedSkills: NPCSkills = {};

        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;

            const { name, specialization, characteristic, level } = this._parseSkillEntry(cleaned);
            if (!name) continue;

            const baseKey = SkillKeyHelper.nameToKey(name) || this._toSkillKey(name);
            const key = specialization ? `${baseKey}${this._toSkillKey(specialization, true)}` : baseKey;
            trainedSkills[key] = {
                name: specialization ? `${name} (${specialization})` : name,
                characteristic: characteristic || this._characteristicKeyFromShort(SkillKeyHelper.getCharacteristic(baseKey) ?? '') || 'perception',
                trained: true,
                plus10: level === 'plus10' || level === 'plus20',
                plus20: level === 'plus20',
                bonus: 0,
            };
        }

        return { trainedSkills, hasEntries: Object.keys(trainedSkills).length > 0 };
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: talent item data is destined for createEmbeddedDocuments
    static _parseTalents(text: string | null): Array<{ name: string; type: string; system: Record<string, unknown> }> {
        if (!text) return [];
        const entries = this._splitList(text);
        // eslint-disable-next-line no-restricted-syntax -- boundary: talent item data is destined for createEmbeddedDocuments
        const items: Array<{ name: string; type: string; system: Record<string, unknown> }> = [];

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

    static _parseTraits(text: string | null): TraitsParseResult {
        const result: TraitsParseResult = {
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

    static _applyTraitAdjustments(systemData: NPCSystemData, traits: TraitEntry[]): void {
        if (!traits || traits.length === 0) return;
        const sizeMap: Record<string, number> = {
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
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics map keyed by free-form string
        const chars = systemData.characteristics as unknown as NPCCharacteristicsMap;

        for (const trait of traits) {
            if (trait.name.toLowerCase() === 'size' && trait.value) {
                const sizeKey = trait.value.toLowerCase();
                const sizeVal = sizeMap[sizeKey];
                if (sizeVal !== undefined) {
                    systemData.size = sizeVal;
                }
            }

            if (trait.name.toLowerCase().startsWith('unnatural')) {
                const key = this._unnaturalCharacteristicKey(trait.name);
                if (key && trait.numericValue && chars[key]) {
                    chars[key].unnatural = trait.numericValue;
                }
            }
        }
    }

    static _parseWeapons(text: string | null): NPCWeapon[] {
        if (!text) return [];
        const entries = this._splitList(text);
        const weapons: NPCWeapon[] = [];

        for (const entry of entries) {
            const cleaned = this._cleanEntry(entry);
            if (!cleaned || cleaned.toLowerCase() === 'none') continue;
            const weapon = this._parseWeaponEntry(cleaned);
            if (weapon) weapons.push(weapon);
        }

        return weapons;
    }

    static _parseWeaponEntry(entry: string): NPCWeapon | null {
        const match = entry.match(/^([^()]+)\s*(?:\((.+)\))?$/);
        if (!match?.[1]) return null;
        const name = match[1].trim();
        const details = (match[2] || '').trim();
        if (!name) return null;

        const segments: string[] = details
            ? details
                  .split(';')
                  .map((s: string) => s.trim())
                  .filter((s): s is string => s.length > 0)
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
            if (rangeMatch?.[1]) {
                range = `${rangeMatch[1]}m`;
                continue;
            }
            const rofMatch = segment.match(/([SBF])\s*\/\s*([0-9-]+)\s*\/\s*([0-9-]+)/i);
            if (rofMatch?.[1] && rofMatch[2] !== undefined && rofMatch[3] !== undefined) {
                rof = `${rofMatch[1].toUpperCase()}/${rofMatch[2]}/${rofMatch[3]}`;
                continue;
            }
            const damageMatch = segment.match(/(\d+d\d+(?:[+-]\d+)?)\s*([IRXET])?/i);
            if (damageMatch?.[1]) {
                damage = damageMatch[1];
                continue;
            }
            const penMatch = segment.match(/Pen\s*(\d+)/i);
            if (penMatch?.[1]) {
                pen = parseInt(penMatch[1], 10);
                continue;
            }
            const clipMatch = segment.match(/Clip\s*(\d+)/i);
            if (clipMatch?.[1]) {
                clip = parseInt(clipMatch[1], 10);
                continue;
            }
            const reloadMatch = segment.match(/Reload\s*(.+)/i);
            if (reloadMatch?.[1]) {
                reload = reloadMatch[1].trim();
                continue;
            }
            qualities.push(segment);
        }

        const damagePenMatch = details.match(/(\d+d\d+(?:[+-]\d+)?)\s*([IRXET])?/i);
        if (damagePenMatch?.[1]) {
            damage = damagePenMatch[1];
        }
        const penFallbackMatch = details.match(/Pen\s*(\d+)/i);
        if (penFallbackMatch?.[1]) {
            pen = parseInt(penFallbackMatch[1], 10);
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

    static _inferWeaponClass(name: string, range: string): string {
        const lower = name.toLowerCase();
        if (range.toLowerCase() === 'melee') return 'melee';
        if (lower.includes('pistol')) return 'pistol';
        if (lower.includes('launcher') || lower.includes('missile')) return 'launcher';
        if (lower.includes('heavy')) return 'heavy';
        return 'basic';
    }

    static _parseSkillEntry(entry: string): SkillEntryParseResult {
        const bonusMatch = entry.match(/\+\s*(\d+)/);
        const bonusValue = bonusMatch?.[1] ? parseInt(bonusMatch[1], 10) : 0;
        let level = 'trained';
        if (bonusValue >= 20) level = 'plus20';
        else if (bonusValue >= 10) level = 'plus10';

        const groups = [...entry.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]?.trim()).filter((g): g is string => g !== undefined);
        let characteristic: string | null = null;
        let specialization: string | null = null;
        if (groups.length > 0) {
            const lastGroup = groups[groups.length - 1];
            if (lastGroup !== undefined && (this.CHAR_MAP[lastGroup] || this.CHAR_MAP[this._normalizeShortCharacteristic(lastGroup)])) {
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

    static _parseTraitEntry(entry: string): TraitEntry {
        const match = entry.match(/^(.+?)(?:\s*\(([^)]+)\))?$/);
        const name = match?.[1] ? match[1].trim() : entry.trim();
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

    static _parseNameWithSpecializations(name: string): ParsedNameResult {
        const match = name.match(/^(.+?)\s*\(([^)]+)\)$/);
        if (!match || match[1] === undefined || match[2] === undefined) {
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

    static _extractSection(lines: string[], label: string): string | null {
        return TextPatternExtractor.extractSection(lines, label, this.SECTION_HEADERS);
    }

    static _isSectionHeader(line: string): boolean {
        return TextPatternExtractor.isSectionHeader(line, this.SECTION_HEADERS);
    }

    static _splitList(text: string): string[] {
        return TextPatternExtractor.splitList(text);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: parse-time entries arrive as untyped tokens from regex extraction
    static _cleanEntry(entry: unknown): string {
        return TextPatternExtractor.cleanEntry(String(entry ?? ''));
    }

    static _extractValueTokens(line: string): string[] {
        return TextPatternExtractor.extractValueTokens(line);
    }

    static _extractParentheticalNumbers(line: string): Array<number | null> {
        return TextPatternExtractor.extractParentheticalNumbers(line);
    }

    static _parseNumericValue(value: string): number {
        return TextPatternExtractor.parseNumericValue(value);
    }

    static _toSkillKey(text: string, capitalize: boolean = false): string {
        return TextPatternExtractor.toKey(text, capitalize);
    }

    static _extractSkillSectionFallback(input: string): string {
        const match = input.match(this.PATTERNS.skillList);
        return match?.[1] ? match[1].trim() : '';
    }

    static _extractWeaponSectionFallback(input: string): string {
        const match = input.match(this.PATTERNS.weaponList);
        return match?.[1] ? match[1].trim() : '';
    }

    static _characteristicKeyFromShort(short: string): string | null {
        if (!short) return null;
        const normalized = this._normalizeShortCharacteristic(short);
        if (normalized === 'A') return this.CHAR_MAP['Ag'] ?? null;
        return this.CHAR_MAP[normalized] ?? this.CHAR_MAP[short] ?? null;
    }

    static _normalizeShortCharacteristic(short: string): string {
        return short.replace(/\./g, '').replace(/\s+/g, '');
    }

    static _unnaturalCharacteristicKey(name: string): string | null {
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
    /* eslint-enable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/prefer-optional-chain, @typescript-eslint/no-base-to-string */

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle parse button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static _onParse(this: StatBlockParser, _event: Event, _target: HTMLElement): void {
        const result = StatBlockParser.parse(this.#rawInput);

        this.#parsedData = result.data;
        this.#errors = result.errors;
        this.#warnings = result.warnings;
        this.#info = result.info;

        void this.render({ parts: ['form'] });
    }

    /**
     * Handle form submission.
     * @param {Event} event
     * @param {HTMLFormElement} form
     * @param {FormDataExtended} formData
     */
    static async _onSubmit(this: StatBlockParser, _event: Event | SubmitEvent, _form: HTMLFormElement, _formData: FormDataExtended): Promise<void> {
        if (!this.#parsedData) {
            // eslint-disable-next-line no-restricted-syntax -- legacy notification string, pending langpack migration
            ui.notifications.error('No valid data to import. Parse input first.');
            return;
        }

        try {
            if (this.#targetActor) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update payload bag
                const updateData: Record<string, unknown> = {
                    system: this.#parsedData.system,
                };
                if (this.#parsedData.name && this.#parsedData.name !== 'Imported NPC') {
                    updateData['name'] = this.#parsedData.name;
                }

                await this.#targetActor.update(updateData);

                if (this.#parsedData.items.length > 0) {
                    await this.#targetActor.createEmbeddedDocuments('Item', this.#parsedData.items);
                }

                ui.notifications.info(game.i18n.format('WH40K.NPC.Import.Success', { name: this.#targetActor.name }));
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

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor.create accepts free-form actor data
            const actorResult = await Actor.create(actorData as Parameters<typeof Actor.create>[0]);
            const actor = Array.isArray(actorResult) ? actorResult[0] : actorResult;
            if (!actor) throw new Error('Actor.create() returned nothing');

            // Create embedded items if any
            if (this.#parsedData.items.length > 0) {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor type doesn't expose createEmbeddedDocuments in its public d.ts
                await (actor as unknown as { createEmbeddedDocuments: (type: string, data: unknown[]) => Promise<unknown> }).createEmbeddedDocuments(
                    'Item',
                    this.#parsedData.items,
                );
            }

            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor type doesn't expose .name in this scope
            ui.notifications.info(game.i18n.format('WH40K.NPC.Import.Success', { name: (actor as unknown as { name?: string }).name ?? '' }));
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Actor type doesn't expose .sheet in this scope
            (actor as unknown as { sheet?: { render: (force: boolean) => void } }).sheet?.render(true);

            this.#submitted = true;
            if (this.#resolve) this.#resolve(actor);
        } catch (err) {
            console.error('Failed to import NPC:', err);
            ui.notifications.error(game.i18n.localize('WH40K.NPC.Import.Failed'));
            if (this.#resolve) this.#resolve(null);
        }
    }

    /**
     * Handle cancel button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static async _onCancel(this: StatBlockParser, _event: Event, _target: HTMLElement): Promise<void> {
        this.#submitted = false;
        if (this.#resolve) this.#resolve(null);
        await this.close();
    }

    /**
     * Handle clear input button.
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static _onClearInput(this: StatBlockParser, _event: Event, _target: HTMLElement): void {
        this.#rawInput = '';
        this.#parsedData = null;
        this.#errors = [];
        this.#warnings = [];
        this.#info = [];
        void this.render({ parts: ['form'] });
    }

    /* -------------------------------------------- */
    /*  Lifecycle                                   */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close hook signature
    override async close(options: Record<string, unknown> = {}): Promise<unknown> {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: resolves with the Actor.create result
    async wait(): Promise<unknown> {
        return new Promise((resolve) => {
            this.#resolve = resolve;
            void this.render(true);
        });
    }

    /**
     * Open the parser dialog.
     * @param {string} [initialInput=""] - Optional initial input.
     * @returns {Promise<Actor|null>} Created actor or null.
     */
    /* eslint-disable no-restricted-syntax -- boundary: open() accepts either a raw input string or an options bag from various call sites */
    static async open(initialInput: unknown = ''): Promise<unknown> {
        let input: string;
        let options: Record<string, unknown> = {};
        if (typeof initialInput === 'object' && initialInput !== null) {
            options = initialInput as Record<string, unknown>;
            const raw = (initialInput as Record<string, unknown>)['initialInput'];
            input = typeof raw === 'string' ? raw : '';
        } else {
            input = typeof initialInput === 'string' ? initialInput : '';
        }

        const { actor, initialInput: _ignored, ...appOptions } = options;
        const parser = new this(appOptions);
        parser.#rawInput = input;
        parser.#targetActor = actor !== undefined ? (actor as unknown as ImportTargetActor) : null;
        return parser.wait();
    }
    /* eslint-enable no-restricted-syntax */

    /**
     * Quick parse without dialog (returns data only, doesn't create actor).
     * @param {string} input - Input to parse.
     * @returns {Object} Parse result with data, errors, warnings.
     */
    static quickParse(input: string): ParseResult {
        return this.parse(input);
    }
}
