/**
 * Character sheet: the origin path, biography and aptitude context.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed functions; the sheet calls
 * them with itself as `this` (`fn.call(sheet, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import { AptitudeBasedSystemConfig } from '../../../config/game-systems/aptitude-based-system-config.ts';
import { SystemConfigRegistry } from '../../../config/game-systems/index.ts';
import type { GameSystemId } from '../../../config/game-systems/types.ts';
import type { WH40KItem } from '../../../documents/item.ts';
import type { WH40KItemSystemData } from '../../../types/global.d.ts';
import { orderAptitudesGeneralFirst } from '../../../utils/aptitude-order.ts';
import { isLinePack } from '../../../utils/compendium-query.ts';
import { capitalize } from '../../../utils/format.ts';
import type CharacterSheet from '../character-sheet.ts';
import { TextEditor, type CharacterSheetContext, type OriginSummary, type PartContext } from './sheet-support.ts';

/**
 * Prepare biography tab context with ProseMirror enriched content.
 * @param {object} context  Context being prepared.
 * @param {object} options  Render options.
 * @returns {Promise<object>}
 * @protected
 */
export async function prepareBiographyContext(this: CharacterSheet, context: PartContext, options: PartContext): Promise<PartContext> {
    const ctx = context as CharacterSheetContext;
    // First prepare the standard tab context
    await this._prepareTabPartContext('biography', context, options);

    // Prepare biography data with enriched HTML for ProseMirror
    // eslint-disable-next-line no-restricted-syntax -- bio.notes may be undefined in migrated data; ?? '' is safe fallback until DataModel schema enforces the default
    const rawNotes = this.actor.system.bio.notes ?? '';

    const enrichedNotes = await TextEditor.enrichHTML(rawNotes, {
        relativeTo: this.actor,
        secrets: this.actor.isOwner,
        rollData: this.actor.getRollData(),
    });
    ctx.biography = {
        source: {
            notes: rawNotes,
        },
        enriched: {
            notes: enrichedNotes,
        },
    };
    // The journal panel under the notes lists these; nothing supplied them, so it always showed "no entries" (#613).
    ctx.journalEntries = this.actor.items.filter((item) => (item.type as string) === 'journalEntry');

    return ctx;
}

/**
 * Fetch unique origin path names grouped by step from compendium packs.
 * @param {string} gameSystem - The game system ID (e.g. 'dh2', 'rt')
 * @returns {Promise<Record<string, string[]>>}
 * @private
 */
export async function getOriginPathOptions(this: CharacterSheet, gameSystem: GameSystemId): Promise<Record<string, string[]>> {
    // Use cached options if available (packs don't change at runtime)
    const cached = this._originOptionsCache.get(gameSystem);
    if (cached !== undefined) return cached;

    const stepNames: Record<string, Set<string>> = {};

    const relevantPacks = [...game.packs].filter((pack) => pack.documentName === 'Item' && isLinePack(pack.metadata, gameSystem));

    const indexes = await Promise.all(
        relevantPacks.map(
            async (pack) =>
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry pack.getIndex() returns Collection with no typed item shape; double-cast to concrete interface
                (await pack.getIndex({ fields: ['type', 'system.step'] })) as unknown as Array<{
                    _id: string;
                    name: string;
                    type?: string;
                    system?: { step?: string };
                }>,
        ),
    );

    for (const index of indexes) {
        for (const entry of index) {
            if (entry.type !== 'originPath') continue;
            const step = entry.system?.step;
            if (step === undefined || step === '') continue;
            // eslint-disable-next-line no-restricted-syntax -- ??= used to lazily initialize per-step Set; stepNames is a local accumulator not owned by any DataModel
            stepNames[step] ??= new Set();
            stepNames[step].add(entry.name);
        }
    }

    // Convert Sets to sorted arrays
    const result: Record<string, string[]> = {};
    for (const [step, names] of Object.entries(stepNames)) {
        result[step] = [...names].sort();
    }

    this._originOptionsCache.set(gameSystem, result);
    return result;
}

/** Accumulate grants from an origin-path choice option into the running accumulators. */
/* eslint-disable no-restricted-syntax -- boundary: grants shape varies per game system; typed via local OriginGrants alias */
function accumulateOriginGrants(
    this: CharacterSheet,
    grants: {
        characteristics?: unknown;
        skills?: unknown;
        talents?: unknown;
        traits?: unknown;
        [key: string]: unknown;
    },
    charTotals: Record<string, number>,
    skillSet: Set<string>,
    talentSet: Set<string>,
    traitSet: Set<string>,
): void {
    if (grants.characteristics !== undefined && grants.characteristics !== null) {
        for (const [key, value] of Object.entries(grants.characteristics as Record<string, unknown>)) {
            if (value !== 0) {
                charTotals[key] = (charTotals[key] ?? 0) + Number(value);
            }
        }
    }
    if (Array.isArray(grants.skills)) {
        for (const skill of grants.skills as Array<{ name?: string; specialization?: string }>) {
            const skillName =
                skill.specialization !== undefined && skill.specialization !== '' ? `${String(skill.name ?? '')} (${skill.specialization})` : skill.name ?? '';
            skillSet.add(skillName);
        }
    }
    if (Array.isArray(grants.talents)) {
        for (const talent of grants.talents as Array<{ name?: string }>) {
            talentSet.add(talent.name ?? '');
        }
    }
    if (Array.isArray(grants.traits)) {
        for (const trait of grants.traits as Array<{ name?: string }>) {
            traitSet.add(trait.name ?? '');
        }
    }
}
/* eslint-enable no-restricted-syntax */

/**
 * Prepare origin path step data.
 * @returns {Array<object>}
 * @protected
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: steps are heterogeneous data passed to Handlebars templates where a concrete type doesn't propagate
export function prepareOriginPathSteps(this: CharacterSheet): Record<string, unknown>[] {
    const gameSystem = this._resolveGameSystemId();
    if (!gameSystem) return [];

    const sysConfig = SystemConfigRegistry.get(gameSystem);
    const stepConfig = sysConfig.getOriginStepConfig();
    const shortLabels = sysConfig.getStepShortLabels();
    const allSteps = [...stepConfig.coreSteps];
    if (stepConfig.optionalStep) allSteps.push(stepConfig.optionalStep);

    const steps = allSteps.map((step) => {
        const labelKey = `WH40K.OriginPath.${capitalize(step.key)}`;
        const label = game.i18n.localize(labelKey);
        return {
            key: step.key,
            label: label !== labelKey ? label : step.step,
            shortLabel: shortLabels[step.key] ?? step.key,
            icon: step.icon,
        };
    });

    const originItems = this.actor.items.filter((item) => item.type === 'originPath');

    // Calculate totals from all origins
    const charTotals: Record<string, number> = {};
    const skillSet = new Set<string>();
    const talentSet = new Set<string>();
    const traitSet = new Set<string>();
    let completedSteps = 0;

    const preparedSteps = steps.map((step) => {
        const item = originItems.find((i) => {
            const sys = i.system as WH40KItemSystemData & { step?: string };
            const itemStep = sys.step ?? '';
            return itemStep === step.key || itemStep === step.label;
        });

        if (item) {
            completedSteps++;
            /* eslint-disable no-restricted-syntax -- boundary: origin-path item.system grants/choices vary by game system; per-key fields exist to keep noPropertyAccessFromIndexSignature happy. */
            type OriginGrants = {
                skills?: unknown;
                talents?: unknown;
                traits?: unknown;
                choices?: unknown;
                characteristics?: unknown;
                [key: string]: unknown;
            };
            type OriginChoice = {
                label?: unknown;
                options?: unknown;
                [key: string]: unknown;
            };
            const system = item.system as unknown as {
                grants?: OriginGrants;
                modifiers?: { characteristics?: Record<string, unknown> };
                selectedChoices?: Record<string, unknown[]>;
                [key: string]: unknown;
            };
            /* eslint-enable no-restricted-syntax */
            const grants: OriginGrants = system.grants ?? {};
            const modifiers = system.modifiers?.characteristics ?? {};
            const selectedChoices = system.selectedChoices ?? {};

            // Accumulate base characteristics from modifiers
            for (const [key, value] of Object.entries(modifiers)) {
                if (value !== 0) {
                    charTotals[key] = (charTotals[key] ?? 0) + Number(value);
                }
            }

            // Collect base skills, talents, and traits from grants
            accumulateOriginGrants.call(this, grants, charTotals, skillSet, talentSet, traitSet);

            // Process choice grants
            if (Array.isArray(grants.choices)) {
                for (const choice of grants.choices as Array<OriginChoice>) {
                    const selectedValues = selectedChoices[choice.label as string] ?? [];
                    for (const selectedValue of selectedValues) {
                        const option = (choice.options as Array<{ value?: string; grants?: OriginGrants }> | undefined)?.find((o) => o.value === selectedValue);
                        if (option?.grants !== undefined) {
                            accumulateOriginGrants.call(this, option.grants, charTotals, skillSet, talentSet, traitSet);
                        }
                    }
                }
            }
        }

        const tooltipData = item
            ? JSON.stringify({
                  title: `${step.label}: ${item.name}`,
                  // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is typed by Foundry DataModel; accessing description requires a cast until the DataModel exports description
                  content: (item.system as Record<string, unknown> & { description?: { value?: string } }).description?.value ?? '',
              })
            : null;

        return {
            ...step,
            item: item
                ? {
                      _id: item.id,
                      name: item.name,
                      img: item.img,
                      system: item.system,
                  }
                : null,
            tooltipData,
        };
    });

    // Build characteristic summary array
    const charShorts: Record<string, string> = {
        weaponSkill: 'WS',
        ballisticSkill: 'BS',
        strength: 'S',
        toughness: 'T',
        agility: 'Ag',
        intelligence: 'Int',
        perception: 'Per',
        willpower: 'WP',
        fellowship: 'Fel',
        influence: 'Inf',
    };

    const characteristicBonuses: OriginSummary['characteristics'] = [];
    for (const [key, value] of Object.entries(charTotals)) {
        if (value !== 0) {
            characteristicBonuses.push({
                key: key,
                short: charShorts[key] || key.substring(0, 3).toUpperCase(),
                value: value,
                positive: value > 0,
            });
        }
    }

    // Store summary in context for the template
    this._originPathSummary = {
        steps: preparedSteps,
        completedSteps: completedSteps,
        totalSteps: 6,
        isComplete: completedSteps === 6,
        characteristics: characteristicBonuses,
        skills: Array.from(skillSet),
        talents: Array.from(talentSet),
        traits: Array.from(traitSet),
    };

    return preparedSteps;
}

/**
 * Get the origin path summary (call after _prepareOriginPathSteps)
 * @returns {object}
 */
export function getOriginPathSummary(this: CharacterSheet): OriginSummary {
    return (
        // eslint-disable-next-line no-restricted-syntax -- _originPathSummary is lazily computed during render; ?? provides the empty-state default until it's populated
        this._originPathSummary ?? {
            steps: [],
            completedSteps: 0,
            totalSteps: 6,
            isComplete: false,
            characteristics: [],
            skills: [],
            talents: [],
            traits: [],
        }
    );
}

/**
 * Origin-granted aptitudes for this actor, or `[]` when the schema has none.
 * NPC actors reuse the PC templates but their DataModel has no `aptitudes`
 * field, so `system.aptitudes` is undefined — defaulting here (rather than
 * spreading a raw cast) is what stops the "granted is not iterable" NPC-sheet
 * crash (#331). Kept as its own method so the guard's branch doesn't push
 * `_prepareAptitudePills` over the complexity limit.
 */
export function grantedAptitudes(this: CharacterSheet): string[] {
    // NPCData is a separate hierarchy from CharacterData and has no `aptitudes`
    // field, yet the character sheet (which NPCs reuse) types this.actor.system
    // as CharacterData — so the compiler believes aptitudes is always string[].
    // Read through an optional shape so the real NPC-runtime absence is handled
    // instead of crashing the spread with "granted is not iterable" (#331).
    const apt = (this.actor.system as { aptitudes?: string[] }).aptitudes;
    return apt ?? [];
}

/**
 * Build per-aptitude display data with the origin path source(s) that granted it.
 * Aptitudes come from home world / background / role / elite advance grants or
 * resolved choices. (Characteristic-named aptitudes are NOT auto-granted per RAW.)
 * @protected
 */
export function prepareAptitudePills(this: CharacterSheet): Array<{ aptitude: string; sources: string[] }> {
    const actor = this.actor;
    const granted = grantedAptitudes.call(this);

    // Universal aptitudes (General) are inherent to every character in an
    // aptitude system and carry no origin source; pull them from the system
    // config so the literal lives in one place (the aptitude RAW tables).
    const gameSystem = this._resolveGameSystemId();
    const sysConfig = gameSystem !== null ? SystemConfigRegistry.get(gameSystem) : null;
    const universal = sysConfig instanceof AptitudeBasedSystemConfig ? [...sysConfig.universalAptitudes] : [];

    const aptitudes = [...new Set([...granted, ...universal])];
    if (aptitudes.length === 0) return [];

    const sourcesOf: Map<string, string[]> = new Map();
    const addSource = (apt: string, src: string): void => {
        let arr = sourcesOf.get(apt);
        if (arr === undefined) {
            arr = [];
            sourcesOf.set(apt, arr);
        }
        if (!arr.includes(src)) arr.push(src);
    };

    // Seed the universal aptitudes with their inherent (non-origin) source.
    const universalSource = game.i18n.localize('WH40K.AptitudeUniversalSource');
    for (const apt of universal) addSource(apt, universalSource);

    const stepLabels: Record<string, string> = {
        homeWorld: 'Home World',
        background: 'Background',
        role: 'Role',
        elite: 'Elite Advance',
        regiment: 'Regiment',
        speciality: 'Speciality',
        chapter: 'Chapter',
        archetype: 'Archetype',
        race: 'Race',
        pride: 'Pride',
        disgrace: 'Disgrace',
        career: 'Career',
        birthright: 'Birthright',
        lureOfTheVoid: 'Lure of the Void',
        trialsAndTravails: 'Trials and Travails',
        motivation: 'Motivation',
        lineage: 'Lineage',
        divination: 'Divination',
    };

    const originItems = actor.items.filter((i: WH40KItem) => i.isOriginPath);
    for (const item of originItems) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; originPath fields (step, grants, selectedChoices) are not on the base type
        const itemSystem = item.system as Record<string, unknown> & { step?: string; grants?: unknown; selectedChoices?: Record<string, string[]> };
        const step = itemSystem.step ?? '';
        const src = `${stepLabels[step] ?? 'Origin'}: ${String(item.name)}`;
        // eslint-disable-next-line no-restricted-syntax -- boundary: grants is untyped JSON from the DataModel; shape varies by system
        const grants = (itemSystem.grants ?? {}) as { aptitudes?: unknown; choices?: unknown; [key: string]: unknown };

        // Fixed aptitudes
        if (Array.isArray(grants.aptitudes)) {
            for (const apt of grants.aptitudes as string[]) if (apt !== '') addSource(apt, src);
        }

        // Resolved aptitude choices (mirrors logic in character.ts._computeOriginPathEffects)
        /* eslint-disable no-restricted-syntax -- boundary: choice shape is heterogeneous JSON from DataModel; no concrete type */
        const choices = (Array.isArray(grants.choices) ? grants.choices : []) as Array<{
            label?: unknown;
            name?: unknown;
            type?: unknown;
            options?: unknown;
            [key: string]: unknown;
        }>;
        /* eslint-enable no-restricted-syntax */
        const selectedChoices = itemSystem.selectedChoices ?? {};
        const labelCounts: Record<string, number> = {};
        for (const choice of choices) {
            const baseLabel = (choice.label as string | undefined) ?? (choice.name as string | undefined) ?? '';
            labelCounts[baseLabel] = (labelCounts[baseLabel] ?? 0) + 1;
            const suffix = labelCounts[baseLabel] > 1 ? ` (${labelCounts[baseLabel]})` : '';
            const choiceKey = `${baseLabel}${suffix}`;
            if (choice.type !== 'aptitude') continue;
            const picks = selectedChoices[choiceKey];
            if (!Array.isArray(picks)) continue;
            for (const pick of picks) {
                const option = (choice.options as Array<{ value?: string; name?: string }> | undefined)?.find((o) => o.value === pick || o.name === pick);
                const value = option?.value ?? option?.name ?? pick;
                if (value !== '') addSource(value, src);
            }
        }
    }

    // General (the universal aptitude) sorts to the front, then alphabetical (#395).
    return orderAptitudesGeneralFirst(aptitudes, new Set(universal)).map((apt) => ({
        aptitude: apt,
        sources: sourcesOf.get(apt) ?? ['Unknown'],
    }));
}
