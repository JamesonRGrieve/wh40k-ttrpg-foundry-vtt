/**
 * Origin Path Builder: committing the path to the actor (grants, rolled values, ledger, equipment and the resets a rebuild needs).
 *
 * Split out of `origin-path-builder.ts` (#717): `this`-typed functions; the class calls
 * them with itself as `this` (`fn.call(app, …)`), and binds any handlers in
 * `DEFAULT_OPTIONS.actions`.
 */
import type { WH40KItem } from '../../../documents/item.ts';
import { t } from '../../../i18n/t.ts';
import { GrantsManager, generateDeterministicId } from '../../../managers/grants-manager.ts';
import {
    BUILDER_ORIGIN_RESOURCE_PATHS,
    deltaFromModifiers,
    originContribution,
    originDeltaFlagPath,
    originIdentityKey,
    priorAfterBuilderWrites,
    readOriginDelta,
    reconcileResourceDeltas,
    resetItemResourceDeltas,
    type OriginModifierBag,
    type OriginResource,
} from '../../../origin-grant-ledger.ts';
import { startingCorruptionHoldsMalignancy, startingMutationFormula } from '../../../rules/chaos-backgrounds.ts';
import { originFateContribution } from '../../../rules/fate.ts';
import { builderPacks, lineCategoryPack, packLineFlags } from '../../../utils/line-packs.ts';
import { iterateResolvedChoices } from '../../../utils/origin-choices.ts';
import { WH40KSettings } from '../../../wh40k-rpg-settings.ts';
import AdvancementDialog from '../../dialogs/advancement-dialog.ts';
import ConfirmationDialog from '../../dialogs/confirmation-dialog.ts';
import { openMutantBackgroundDialog } from '../../prompts/mutant-background-dialog.ts';
import {
    type AmmoIndexEntry,
    collectEquipmentGrantPlans,
    type EquipmentGrantPlan,
    matchEquipmentEntry,
    pickStandardAmmo,
    STARTING_CLIPS,
} from '../equipment-grants.ts';
import { cloneGrantedItemData } from '../grant-materialize.ts';
import { type NormalizedOrigin, normalizeOrigin } from '../normalized-origin.ts';
import { collectItemGrantPlans, type GrantedItemKind } from '../origin-grant-plans.ts';
import type OriginPathBuilder from '../origin-path-builder.ts';
import type { CoreFlags, ItemDataLike } from '../types.ts';
import {
    collectContentItemPlans,
    GENERATION_CHARACTERISTICS,
    type AmmoIndexRow,
    type ContentItemPlan,
    type OriginPathSystemData,
    type StandardClipWeapon,
} from './builder-support.ts';
import * as NavigationActions from './navigation-actions.ts';

/** Item types considered "inventory" — wiped on a Reset Inventory commit. */
const INVENTORY_ITEM_TYPES = new Set([
    'weapon',
    'armour',
    'armourModification',
    'ammunition',
    'consumable',
    'cybernetic',
    'drug',
    'forceField',
    'gear',
    'tool',
    'backpack',
    'weaponModification',
]);

/** Item types considered "injuries/conditions" — wiped on a Reset Injuries and Effects commit. */
const INJURY_ITEM_TYPES = new Set(['criticalInjury', 'mentalDisorder', 'malignancy', 'mutation']);

/**
 * Build grant selections from choice selections stored on each origin.
 * @returns {object}
 * @private
 */
function buildGrantSelections(this: OriginPathBuilder): Record<string, { selected: string[] }> {
    const selections: Record<string, { selected: string[] }> = {};
    for (const [, selection] of this.selections) {
        const selSys = selection.system as OriginPathSystemData;
        const choices = selSys.grants?.choices ?? [];
        const selectedChoices = selSys.selectedChoices ?? {};
        // Deduplicate labels the same way the choice dialog does,
        // so we look up the right key in selectedChoices.
        // Shared keying (#305); the per-index deterministic id + singleton-preserving
        // strict-scoped read (no legacy fallback) stay local to this site.
        let i = -1;
        for (const { baseLabel, choiceKey } of iterateResolvedChoices(choices, selectedChoices)) {
            i += 1;
            const selected = selectedChoices[choiceKey];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: selectedChoices is a Record; key may be absent
            if (selected !== undefined && selected !== null) {
                const grantId = generateDeterministicId(`choice-${i}-${baseLabel}`);
                selections[grantId] = {
                    selected: Array.isArray(selected) ? selected : [selected],
                };
            }
        }
    }
    return selections;
}

/**
 * Build rolled values from roll results stored on each origin.
 * @returns {object}
 * @private
 */
function buildRolledValues(this: OriginPathBuilder): { wounds?: number; fate?: number } {
    const values: { wounds?: number; fate?: number } = {};
    for (const [, selection] of this.selections) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: selection.system is a compendium payload cast; rollResults is optional and ?? provides the safe default
        const rollResults = (selection.system as OriginPathSystemData).rollResults ?? {};
        const woundsResult = rollResults['wounds'];
        const fateResult = rollResults['fate'];
        if (woundsResult?.rolled !== undefined) {
            values.wounds = (values.wounds ?? 0) + woundsResult.rolled;
        }
        if (fateResult?.rolled !== undefined) {
            values.fate = (values.fate ?? 0) + fateResult.rolled;
        }
    }
    return values;
}

/**
 * Sum origin-path characteristic bonuses across every committed origin so the final
 * values can be written directly into `system.characteristics.*.base` at commit time,
 * with no runtime re-computation needed.
 *
 * Sources per origin:
 * - `system.modifiers.characteristics[key]` — base bonuses authored on the origin
 * - `system.activeModifiers[]` with `type === 'characteristic'` — bonuses resolved
 *    from choice selections (e.g. "pick a +5 bonus from three options")
 *
 * @private
 */
function collectOriginCharacteristicBonuses(this: OriginPathBuilder): Record<string, number> {
    const sums: Record<string, number> = {};
    const addToSum = (key: string, value: number | string | undefined | null): void => {
        const n = Number(value);
        if (!Number.isFinite(n) || n === 0) return;
        sums[key] = (sums[key] ?? 0) + n;
    };

    const collectFromSelection = (selection: NormalizedOrigin | null): void => {
        if (selection === null) return;
        const system = this._getSelectionSystem(selection);
        const sys = system;
        const charMods = sys.modifiers?.characteristics as Record<string, number | undefined> | undefined;
        if (charMods) {
            for (const [key, value] of Object.entries(charMods)) addToSum(key, value);
        }
        const activeMods = sys.activeModifiers;
        if (Array.isArray(activeMods)) {
            for (const mod of activeMods) {
                if (mod.type === 'characteristic' && typeof mod.key === 'string') {
                    addToSum(mod.key, mod.value);
                }
            }
        }
    };

    for (const [, selection] of this.selections) collectFromSelection(selection);
    collectFromSelection(this.lineageSelection);
    collectFromSelection(this._divinationSelection);
    return sums;
}

/**
 * Resolve the chosen divination (#316) to its origin-path doc so its bonus
 * applies through the same commit machinery as the step selections. The
 * divination is stored as free text (`system.originPath.divination`); we match
 * that text by name against the system's `<sys>-core-origins-divinations` pack.
 * Kept in `_divinationSelection` (NOT `this.selections`) so it never inflates
 * the size/completion logic keyed off the selection map. Freeform text with no
 * matching doc resolves to null (text-only, no grant) — the prior behaviour.
 * @private
 */
async function resolveDivinationSelection(this: OriginPathBuilder): Promise<void> {
    this._divinationSelection = null;
    const text = this._divination.trim();
    if (text === '') return;
    const pack = lineCategoryPack(game.packs, this.gameSystem, 'origins-divinations');
    if (!pack) return;
    const documents = await pack.getDocuments();
    const wanted = text.toLowerCase();
    const match = documents.find((d): d is typeof d & { type: string; name: string } => {
        const doc = d as { type?: string; name?: string };
        return doc.type === 'originPath' && typeof doc.name === 'string' && doc.name.trim().toLowerCase() === wanted;
    });
    if (!match) return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: normalizeOrigin accepts the raw compendium document shape and validates structurally (mirrors _loadOrigins)
    this._divinationSelection = normalizeOrigin(match as unknown as Record<string, unknown>);
}

/**
 * Apply every embedded origin's `modifiers.resources` and record its delta
 * in the shared origin-grant ledger, so the boot-time reconcile pass
 * ({@link WH40KItem.applyOriginToActor}) becomes a no-op afterwards.
 *
 * The builder writes characteristics and rolled Wounds / Fate absolutely
 * (`system.characteristics.*.base = baseline + roll + originBonus`,
 * `system.wounds.max = rolled`). The reconcile applier instead adds an
 * origin's modifier deltas on top of whatever it finds, reversing a recorded
 * prior delta first. Each origin is reconciled here through the same
 * {@link reconcileResourceDeltas}, against {@link priorAfterBuilderWrites}:
 * the baked-in characteristics count as applied, a resource this commit
 * rewrote absolutely starts from 0, and every other resource (Corruption,
 * Insanity) re-bases off its recorded prior so a re-commit never stacks it.
 * The recorded delta is then exactly what the next reconcile derives, so
 * `prior === newDelta` there. Origins are written one at a time because
 * each builds on the actor values the previous one left.
 * @param rewritten  The resources this commit wrote absolutely.
 * @private
 */
async function reconcileOriginGrantLedger(this: OriginPathBuilder, rewritten: ReadonlySet<OriginResource>): Promise<void> {
    const embeddedOrigins = this.actor.items.filter((i) => i.type === 'originPath');
    for (const origin of embeddedOrigins) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: embedded item system bag is the open-ended shared item schema; we read only the modifier fields
        const modifiers = (origin.system as { modifiers?: OriginModifierBag } | undefined)?.modifiers;
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KItem's fvtt-typed _stats/flags shapes are looser than OriginIdentityItemLike; the same coercion is used in WH40KItem.#originIdentityKey
        const identityKey = originIdentityKey(origin as unknown as Parameters<typeof originIdentityKey>[0]);
        const delta = deltaFromModifiers(modifiers);
        const prior = priorAfterBuilderWrites(readOriginDelta(this.actor.flags, identityKey), delta, rewritten);
        const { updates, newDelta } = reconcileResourceDeltas(this.actor.system, originContribution(delta), prior, BUILDER_ORIGIN_RESOURCE_PATHS);
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
        const ledgerUpdate: Record<string, unknown> = {
            ...updates,
            // A starting-mutation origin's Corruption queues no Malignancy Test.
            ...startingCorruptionHoldsMalignancy(origin.system, updates, this.actor.system),
            [originDeltaFlagPath(identityKey)]: newDelta,
        };
        // eslint-disable-next-line no-await-in-loop -- sequential by design: each origin builds on the values the previous one wrote
        await this.actor.update(ledgerUpdate);
    }
}

/**
 * Delete all inventory-category items from the actor. Grants from the origin path
 * re-add anything tracked via grants; Equip Acolyte selections are applied after this.
 * @private
 */
async function resetInventoryItems(this: OriginPathBuilder): Promise<void> {
    const inventoryIds = this.actor.items
        .filter((i) => INVENTORY_ITEM_TYPES.has(i.type as string))
        .map((i) => i.id)
        .filter((id): id is string => typeof id === 'string');
    if (inventoryIds.length > 0) {
        await this.actor.deleteEmbeddedDocuments('Item', inventoryIds);
    }
}

/**
 * Delete all ActiveEffects and injury/condition items from the actor.
 * @private
 */
async function resetInjuriesAndEffects(this: OriginPathBuilder): Promise<void> {
    const injuryIds = this.actor.items
        .filter((i) => INJURY_ITEM_TYPES.has(i.type as string))
        .map((i) => i.id)
        .filter((id): id is string => typeof id === 'string');
    if (injuryIds.length > 0) {
        await this.actor.deleteEmbeddedDocuments('Item', injuryIds);
    }
    const effectIds = this.actor.effects.map((e) => e.id).filter((id): id is string => typeof id === 'string');
    if (effectIds.length > 0) {
        await this.actor.deleteEmbeddedDocuments('ActiveEffect', effectIds);
    }
}

/**
 * Reset XP to the system's starting value and zero out all characteristic/skill advances.
 *
 * Two distinct accounting failures are guarded here (issue #214 — first-time
 * origin path on an already-generated character produced negative XP):
 *
 * 1. **Half-reset advancement state.** Every XP-purchased advance is recorded
 *    in *two* places: the `.advance` rank AND a paired `.cost` (the XP that
 *    was spent on it, see AdvancementDialog#purchaseCharacteristic / #_buySkill).
 *    Zeroing only `.advance` left every `.cost` orphaned, so
 *    `_computeExperienceSpent` kept summing stale costs into
 *    `experience.calculatedTotal` and the auto-opened Advancement Dialog
 *    re-priced advances from a corrupt baseline. Both halves must be zeroed
 *    together so the post-reset character is a clean slate.
 *
 * 2. **Non-atomic experience write.** The experience reset previously rode in
 *    the *same* `actor.update()` payload as the bulk
 *    `system.skills.<k>.entries` array replacements. On an already-generated
 *    character those entries can carry legacy / out-of-range fields that fail
 *    Foundry V14 strict array validation, which rejects the *entire* atomic
 *    update — so `experience.used` was never zeroed while the rest of the
 *    commit proceeded, leaving `used` from the pre-origin build against a
 *    `total` lowered to `startingXP` → negative `available`. The experience
 *    reset is now committed first, on its own, so a later validation failure
 *    on the advance/entry sweep can never strand it.
 * @private
 */
export async function resetExperienceAndAdvancements(this: OriginPathBuilder): Promise<void> {
    // startingXP lives on the full system config (registryConfig), not the
    // OriginStepConfig slice stored in systemConfig. Reading from
    // systemConfig here always resolved to `undefined`, which silently
    // zeroed the reset. A race may set its own (BC Chaos Space Marine: 500, #727).
    const startingXP = this._startingXP();

    // Step 1 — experience totals, committed on their own so a validation
    // failure on the advance/entry sweep below can never leave `used`
    // pointing at the pre-origin spend (issue #214).
    // Only `total` is written. `used` is derived from the costs stamped on
    // purchased advancements, so setting it here was a no-op the derive
    // discarded — and step 2 below, which zeroes those costs, is what
    // actually resets the spend (#509).
    await this.actor.update({ 'system.experience.total': startingXP });

    // Step 2 — zero every advance AND its paired cost. Resetting `.advance`
    // without `.cost` left the spend accounting internally inconsistent.
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
    const update: Record<string, unknown> = {};
    const CHARS = GENERATION_CHARACTERISTICS;
    for (const key of CHARS) {
        update[`system.characteristics.${key}.advance`] = 0;
        update[`system.characteristics.${key}.cost`] = 0;
    }
    const skills = this._actorSys().skills ?? {};
    for (const skillKey of Object.keys(skills)) {
        update[`system.skills.${skillKey}.advance`] = 0;
        update[`system.skills.${skillKey}.cost`] = 0;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: skills is a Record; key may be absent at runtime
        const entries = skills[skillKey]?.entries;
        if (Array.isArray(entries)) {
            // Zero both halves of the per-entry advancement record. Step 1
            // already committed the experience reset on its own, so even if
            // this entries array write is rejected by V14 strict validation
            // the character can no longer be left with negative XP (#214).
            const resetEntries = entries.map((entry) => ({ ...entry, advance: 0, cost: 0 }));
            update[`system.skills.${skillKey}.entries`] = resetEntries;
        }
    }
    await this.actor.update(update);

    // The former step 3 — a defensive `used = total` clamp against a negative
    // available (#214) — is gone. It wrote a derived field, so it was a no-op
    // the next prepare discarded; the balance is now floored in the derive
    // itself, with any deficit reported as `experience.overspent` (#509).
}

/**
 * Reset the character's influence, requisition, and throne gelt totals to zero.
 * The commit path then applies any values rolled on origins after this reset.
 * @private
 */
async function resetCurrencyResources(this: OriginPathBuilder): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
    const currencyUpdate: Record<string, unknown> = {
        'system.influence': 0,
        'system.requisition': 0,
        'system.throneGelt': 0,
    };
    await this.actor.update(currencyUpdate);
}

/**
 * Create embedded items on the actor for the Equip Acolyte selections.
 * Per the DH2 rules, each acquired weapon comes with two clips of standard ammunition.
 * @private
 */
async function applyEquipmentSelections(this: OriginPathBuilder): Promise<void> {
    const availableWeapons = this._getAvailableWeaponsForAmmo();
    const creations: ItemDataLike[] = [];
    for (const entry of this.equipmentSelections.values()) {
        const equipEntry = entry;
        const uuid = equipEntry.uuid;
        // eslint-disable-next-line no-await-in-loop -- sequential: each item needs its own compendium lookup and clone
        const source = await fromUuid(uuid);
        if (!source) continue;
        const itemData = cloneGrantedItemData(source, { sourceId: uuid });

        if (equipEntry.type === 'ammunition') {
            // Size user-picked ammo to one clip of the primary ranged weapon that supports it.
            // Prefer origin-granted weapons over weapons the player also picked.
            const types = Array.isArray(equipEntry.weaponTypes) ? equipEntry.weaponTypes : [];
            const compatible =
                availableWeapons.find((w) => types.includes(w.identifier) && w.source === 'granted') ??
                availableWeapons.find((w) => types.includes(w.identifier));
            if (compatible && compatible.clipMax > 0) {
                /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- noUncheckedIndexedAccess: ??= is banned by no-restricted-syntax; explicit undefined check used instead */
                if (itemData.system === undefined) itemData.system = {};
                itemData.system.quantity = compatible.clipMax;
            }
        }

        creations.push(itemData);

        if (equipEntry.type === 'weapon') {
            // eslint-disable-next-line no-await-in-loop -- sequential: the clip lookup depends on the same weapon's type
            const clips = await standardClipsFor.call(this, source);
            if (clips !== null) creations.push(clips);
        }
    }

    if (creations.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', creations as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
    }
}

/**
 * Create the talents and traits the committed origins grant, then tell the
 * GM about any grant that could not be created. Before #727 trait grants
 * were never created at all, and a talent grant with no UUID vanished
 * silently (a Chaos Space Marine got none of its eleven talents).
 * @private
 */
async function applyItemGrantsFromOrigins(this: OriginPathBuilder): Promise<void> {
    const missing = [...(await applyGrantedItems.call(this, 'talent')), ...(await applyGrantedItems.call(this, 'trait'))];
    if (missing.length > 0) ui.notifications.warn(t('WH40K.OriginPath.UnresolvedGrants', { names: missing.join(', ') }));
}

/**
 * Walk every committed origin's fixed `kind` grants AND its resolved
 * choice-driven activeModifiers, fetch each source compendium item by UUID,
 * stamp the specialisation (and a trait's level) onto the clone, and create
 * it on the actor. Duplicates (same name, specialisation and level,
 * case-insensitive) are skipped so a re-commit doesn't pile up copies.
 * @returns the names of the grants that could not be created.
 * @private
 */
async function applyGrantedItems(this: OriginPathBuilder, kind: GrantedItemKind): Promise<string[]> {
    const { plans, unresolved } = collectItemGrantPlans(this._selectionSystems(), kind);
    const missing = [...unresolved];
    const toCreate: ItemDataLike[] = [];
    const seenKeys = new Set<string>();

    const normSpec = (s: string | undefined): string => (s ?? '').toLowerCase().trim();
    const keyOf = (name: string, specialization: string | undefined, level: number | undefined): string =>
        `${name.toLowerCase()}::${normSpec(specialization)}::${level ?? ''}`;
    const owned = new Set(
        this.actor.items
            .filter((i) => i.type === kind)
            .map((i) => {
                const sys = i.system as { specialization?: string; level?: number } | undefined;
                return keyOf(i.name, sys?.specialization, kind === 'trait' && (sys?.level ?? 0) > 0 ? sys?.level : undefined);
            }),
    );

    for (const plan of plans) {
        // eslint-disable-next-line no-await-in-loop -- sequential: each UUID resolves to a distinct source item before we can stamp specialization and dedupe
        const source = await fromUuid(plan.uuid);
        const sourceDoc = source as { name?: string; type?: string } | null;
        if (sourceDoc?.type !== kind) {
            missing.push(sourceDoc?.name ?? plan.uuid);
            continue;
        }
        const itemData = cloneGrantedItemData(sourceDoc, {
            sourceId: plan.uuid,
            originPathGranted: true,
            specialization: plan.specialization,
            level: plan.level,
        });
        const name = typeof itemData.name === 'string' ? itemData.name : sourceDoc.name ?? '';
        const key = keyOf(name, plan.specialization, plan.level);
        if (seenKeys.has(key) || owned.has(key)) continue;
        seenKeys.add(key);
        toCreate.push(itemData);
    }

    if (toCreate.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', toCreate as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
    }
    return missing;
}

/**
 * Materialize freeform content-item grants from committed origins onto the
 * actor: special abilities, malignancies, mutations, mental disorders.
 *
 * Unlike talents/skills/traits, these options carry no compendium UUID —
 * they are authored inline as `{ name, description }` on the origin (see the
 * Deathwatch speciality packs). So each grant/choice becomes a freeform
 * world item of the matching type, built from the option's name and
 * description (written into `system.description.value`).
 *
 * Two sources are walked, mirroring {@link _applyGrantedItems}:
 *   1. Fixed grants in `grants.specialAbilities` (always specialAbility).
 *   2. Choice-resolved options whose choice `type` is one of the content
 *      types, located via the same `selectedChoices` key logic as
 *      `OriginPathData._calculateActiveModifiers`.
 *
 * Re-commit is idempotent: an item of the same type + name (case-insensitive)
 * already on the actor is skipped.
 * @private
 */
async function applyContentItemGrantsFromOrigins(this: OriginPathBuilder): Promise<void> {
    const plans: ContentItemPlan[] = [];
    for (const [, selection] of this.selections) {
        collectContentItemPlans(this._getSelectionSystem(selection), plans);
    }
    if (plans.length === 0) return;

    const norm = (s: string): string => s.toLowerCase().trim();
    const actorHas = (type: string, name: string): boolean => this.actor.items.some((i) => i.type === type && norm(i.name) === norm(name));

    const toCreate: ItemDataLike[] = [];
    const seenKeys = new Set<string>();
    for (const plan of plans) {
        const dedupKey = `${plan.type}::${norm(plan.name)}`;
        if (seenKeys.has(dedupKey)) continue;
        seenKeys.add(dedupKey);
        if (actorHas(plan.type, plan.name)) continue;

        const itemFlags: { 'wh40k-rpg'?: { originPathGranted?: boolean } } & ItemDataLike['flags'] = {};
        itemFlags['wh40k-rpg'] = { originPathGranted: true };
        const itemData: ItemDataLike = {
            name: plan.name,
            type: plan.type,
            system: { description: { value: plan.description } },
            flags: itemFlags,
        };
        toCreate.push(itemData);
    }

    if (toCreate.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', toCreate as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
    }
}

/**
 * Create every committed origin's starting equipment on the actor: the fixed
 * `grants.equipment` kit plus the options picked in its `equipment` / `gear`
 * choices. An entry with a UUID resolves by it; a name-only entry (most
 * authored kits) resolves against the line's starting-equipment packs, by
 * exact name and then by a unique loose match (see `matchEquipmentEntry`).
 * An item the actor already holds by name is skipped, so a re-commit doesn't
 * duplicate the kit; an entry no pack carries is reported to the GM.
 * @private
 */
async function applyEquipmentGrantsFromOrigins(this: OriginPathBuilder): Promise<void> {
    const plans: EquipmentGrantPlan[] = [];
    for (const [, selection] of this.selections) {
        plans.push(...collectEquipmentGrantPlans(this._getSelectionSystem(selection)));
    }
    if (plans.length === 0) return;

    const catalog: Array<{ name: string; uuid: string }> = [];
    if (plans.some((plan) => plan.uuid === undefined)) {
        for (const pack of builderPacks(game.packs, this.gameSystem, 'startingEquipment')) {
            // eslint-disable-next-line no-await-in-loop -- sequential: packs are read in priority order so the first exact name wins
            const index = await pack.getIndex({ fields: ['name'] });
            for (const entry of index) {
                if (typeof entry.name === 'string') catalog.push({ name: entry.name, uuid: `Compendium.${pack.metadata.id}.Item.${entry._id}` });
            }
        }
    }

    const norm = (s: string): string => s.toLowerCase().trim();
    const toCreate: ItemDataLike[] = [];
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const plan of plans) {
        const uuid = plan.uuid ?? matchEquipmentEntry(catalog, plan.name)?.uuid;
        if (uuid === undefined) {
            missing.push(plan.name);
            continue;
        }
        if (seen.has(uuid)) continue;
        seen.add(uuid);
        // eslint-disable-next-line no-await-in-loop -- sequential: each grant resolves to its own compendium document
        const source = await fromUuid(uuid);
        if (!source) {
            missing.push(plan.name);
            continue;
        }
        const itemData = cloneGrantedItemData(source, { sourceId: uuid, originPathGranted: true });
        const name = typeof itemData.name === 'string' ? itemData.name : plan.name;
        if (this.actor.items.some((i) => norm(i.name) === norm(name))) continue;
        if (plan.quantity > 1) {
            /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- noUncheckedIndexedAccess: ??= is banned by no-restricted-syntax; explicit undefined check used instead */
            if (itemData.system === undefined) itemData.system = {};
            itemData.system.quantity = plan.quantity;
        }
        toCreate.push(itemData);
        if (itemData.type === 'weapon') {
            // eslint-disable-next-line no-await-in-loop -- sequential: the clip lookup depends on the same weapon's type
            const clips = await standardClipsFor.call(this, source);
            if (clips !== null && !this.actor.items.some((i) => norm(i.name) === norm(clips.name ?? ''))) toCreate.push(clips);
        }
    }

    if (toCreate.length > 0) {
        await this.actor.createEmbeddedDocuments('Item', toCreate as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);
    }
    if (missing.length > 0) {
        ui.notifications.warn(game.i18n.format('WH40K.OriginPath.EquipmentGrantMissing', { items: missing.join(', ') }));
    }
}

/**
 * The starting clips for a ranged weapon when standard ammunition is tracked
 * (homebrew setting): one stack of the line's standard ammunition for the
 * weapon's type, holding {@link STARTING_CLIPS} full clips of rounds. Null when
 * the setting is off, the weapon takes no ammunition, or the line has no
 * standard ammunition for its type.
 * @private
 */
async function standardClipsFor(this: OriginPathBuilder, granted: object): Promise<ItemDataLike | null> {
    if (!WH40KSettings.isStandardAmmoTrackingEnabled()) return null;
    const weapon: StandardClipWeapon = granted;
    const weaponType = weapon.system?.type ?? '';
    const identifier = weapon.system?.identifier ?? '';
    const clipMax = weapon.system?.clip?.max ?? 0;
    if (weaponType === '' || clipMax <= 0) return null;

    const entries: AmmoIndexEntry[] = [];
    for (const pack of game.packs) {
        const flags = packLineFlags(pack.metadata);
        if (pack.documentName !== 'Item' || flags?.line !== this.gameSystem || flags.category !== 'ammo') continue;
        // eslint-disable-next-line no-await-in-loop -- sequential: packs are read in manifest order so the first standard match wins
        const index = await pack.getIndex({ fields: ['type', 'system.standard', 'system.weaponTypes', 'system.identifier'] });
        // eslint-disable-next-line no-restricted-syntax -- boundary: CompendiumCollection.getIndex entries carry only the requested fields, untyped by Foundry
        for (const entry of index as unknown as AmmoIndexRow[]) {
            if (entry.type !== 'ammunition') continue;
            entries.push({
                uuid: `Compendium.${pack.metadata.id}.Item.${entry._id}`,
                name: entry.name ?? '',
                identifier: entry.system?.identifier ?? '',
                standard: entry.system?.standard === true,
                weaponTypes: entry.system?.weaponTypes,
            });
        }
    }
    const pick = pickStandardAmmo(entries, weaponType, identifier, this.gameSystem);
    if (pick === undefined) return null;
    const source = await fromUuid(pick.uuid);
    if (!source) return null;
    const data = cloneGrantedItemData(source, { sourceId: pick.uuid, originPathGranted: true });
    /* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- noUncheckedIndexedAccess: ??= is banned by no-restricted-syntax; explicit undefined check used instead */
    if (data.system === undefined) data.system = {};
    data.system.quantity = STARTING_CLIPS * clipMax;
    return data;
}

/**
 * Commit path to character
 */
// eslint-disable-next-line complexity -- commit flow applies many grant types sequentially; extracting sub-methods would scatter the guard-and-update sequence
export async function commit(this: OriginPathBuilder, _event: Event, _target: HTMLElement): Promise<void> {
    const status = this._calculateStatus();

    if (status['canCommit'] !== true) {
        if (status['stepsComplete'] !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllSteps'));
        } else if (status['choicesComplete'] !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllChoices'));
        } else if (status['rollsComplete'] !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CompleteAllRolls'));
        } else if (status['equipmentComplete'] !== true) {
            ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.StepInProgressEquipment'));
            NavigationActions.goToEquipment.call(this, _event, _target);
        }
        return;
    }

    // Characteristics must be rolled/assigned before the path is applied —
    // commit otherwise produced a character with no characteristics
    // because the Characteristic Roll step was skippable (#206).
    if (!this._hasAssignedCharacteristics()) {
        ui.notifications.warn(game.i18n.localize('WH40K.OriginPath.CharacteristicsRequiredBeforeCommit'));
        NavigationActions.goToCharacteristics.call(this, _event, _target);
        return;
    }

    // An elite whose characteristic prerequisites the generated characteristics miss
    // (Psyker needs Willpower 40) is not committed: those are only known now.
    const shortfall = this._eliteCharacteristicShortfall();
    if (shortfall.length > 0 && this.lineageSelection !== null) {
        ui.notifications.warn(
            game.i18n.format('WH40K.OriginPath.EliteCharacteristicsUnmet', { elite: this.lineageSelection.name, reasons: shortfall.join(', ') }),
        );
        return;
    }

    // Soft-warn (do not block) on aptitude collisions that the player has
    // not yet resolved via the chooser dialog. This covers both intra-
    // selection duplicates AND collisions against aptitudes the character
    // already had before opening the builder. (#205)
    const unresolved = this._getAptitudeCollisions()
        .filter((c) => c.replacement === null || c.replacement === '')
        .map((c) => c.original);
    if (unresolved.length > 0) {
        ui.notifications.warn(game.i18n.format('WH40K.OriginPath.DuplicateAptitude', { aptitudes: unresolved.join(', ') }));
    }

    // Confirm — offer reset options. Base stats are always overridden.
    const resetChoices = (await foundry.applications.api.DialogV2.prompt({
        window: { title: game.i18n.localize('WH40K.OriginPath.CommitToCharacter') },
        content: `
            <p>${game.i18n.localize('WH40K.OriginPath.ConfirmCommit')}</p>
            <p class="notes"><em>${game.i18n.localize('WH40K.OriginPath.ResetBaseStatsNote')}</em></p>
            <div class="form-group"><label><input type="checkbox" name="resetInventory" checked /> ${game.i18n.localize(
                'WH40K.OriginPath.ResetInventory',
            )}</label></div>
            <div class="form-group"><label><input type="checkbox" name="resetExperience" checked /> ${game.i18n.localize(
                'WH40K.OriginPath.ResetExperience',
            )}</label></div>
            <div class="form-group"><label><input type="checkbox" name="resetInjuries" checked /> ${game.i18n.localize(
                'WH40K.OriginPath.ResetInjuries',
            )}</label></div>
            <div class="form-group"><label><input type="checkbox" name="resetCurrency" checked /> ${game.i18n.localize(
                'WH40K.OriginPath.ResetCurrency',
            )}</label></div>
        `,
        ok: {
            label: game.i18n.localize('WH40K.OriginPath.CommitToCharacter'),
            callback: (_cbEvent: Event, button: HTMLButtonElement) => {
                const form = button.form;
                const read = (name: string): boolean => (form?.elements.namedItem(name) as HTMLInputElement | null)?.checked ?? false;
                return {
                    resetInventory: read('resetInventory'),
                    resetExperience: read('resetExperience'),
                    resetInjuries: read('resetInjuries'),
                    resetCurrency: read('resetCurrency'),
                };
            },
        },
        rejectClose: false,
    })) as { resetInventory: boolean; resetExperience: boolean; resetInjuries: boolean; resetCurrency: boolean } | null;

    if (!resetChoices) return;

    try {
        // Resolve the chosen divination (#316) into a selection so its
        // characteristic modifiers + talent/skill grants apply through the
        // same commit machinery as the step selections (it stays out of
        // this.selections so size/completion logic is unaffected).
        await resolveDivinationSelection.call(this);
        const selectionsToApply: NormalizedOrigin[] = [...this.selections.values(), ...(this._divinationSelection !== null ? [this._divinationSelection] : [])];

        // Build array of origin items from selections
        const originItems = [];
        for (const selection of selectionsToApply) {
            // Create an item-like object with proper system data
            const maybeDoc = selection as { toObject?: () => Partial<NormalizedOrigin> };
            const itemData: Partial<NormalizedOrigin> = typeof maybeDoc.toObject === 'function' ? maybeDoc.toObject() : foundry.utils.deepClone(selection);
            // Ensure system data is present
            /* eslint-disable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: Partial<NormalizedOrigin>.system may be absent; ??= is banned by no-restricted-syntax */
            if (itemData.system === undefined || itemData.system === null) itemData.system = selection.system;
            /* eslint-enable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unnecessary-condition */
            // selectedChoices and rollResults are already on selection.system
            // from the choice dialogs and roll dialogs
            originItems.push(itemData);
        }

        // Delete existing origin path items before applying new ones.
        // Without this, re-committing would accumulate duplicate origin items
        // and _getOriginPathCharacteristicModifier() would double-count modifiers.
        const existingOriginItems = this.actor.items.filter((i) => i.type === 'originPath');
        if (existingOriginItems.length > 0) {
            const idsToDelete = existingOriginItems.map((i) => i.id).filter((id): id is string => typeof id === 'string');
            await this.actor.deleteEmbeddedDocuments('Item', idsToDelete);
        }

        // Also reverse any items we previously materialized from origin
        // grants (talents stamped with flags.wh40k-rpg.originPathGranted),
        // so re-applying the builder is idempotent and doesn't stack
        // duplicate "Weapon Training (Chain)" + "Weapon Training (Chain)".
        const grantedItems = this.actor.items.filter((i) => {
            const flags = i.flags as { 'wh40k-rpg'?: { originPathGranted?: boolean } } | undefined;
            return flags?.['wh40k-rpg']?.originPathGranted === true;
        });
        if (grantedItems.length > 0) {
            const grantedIds = grantedItems.map((i) => i.id).filter((id): id is string => typeof id === 'string');
            await this.actor.deleteEmbeddedDocuments('Item', grantedIds);
        }

        // Optional resets requested from the commit confirmation dialog
        if (resetChoices.resetInventory) {
            await resetInventoryItems.call(this);
        }
        if (resetChoices.resetInjuries) {
            await resetInjuriesAndEffects.call(this);
        }
        if (resetChoices.resetExperience) {
            await resetExperienceAndAdvancements.call(this);
        }
        if (resetChoices.resetCurrency) {
            await resetCurrencyResources.call(this);
        }

        // Use GrantsManager to apply all grants in batch
        // This handles characteristics, skills, talents, traits, wounds, fate, etc.
        // reverseExisting ensures old grants are reversed before applying new ones
        const itemLikeRecords = originItems.map((data) => ({
            name: data.name,
            type: 'originPath',
            system: data.system,
            toObject: () => data,
        }));
        // eslint-disable-next-line no-restricted-syntax -- boundary: GrantsManager.applyBatchGrants accepts a structurally-compatible item-like shape, not full WH40KItem instances
        const itemLikes = itemLikeRecords as unknown as WH40KItem[];
        const result = await GrantsManager.applyBatchGrants(itemLikes, this.actor, {
            selections: buildGrantSelections.call(this),
            rolledValues: buildRolledValues.call(this),
            showNotification: false,
            reverseExisting: true, // Reverse any previously applied grants first
        });

        if (!result.success && result.errors.length > 0) {
            console.warn('Grant application had errors:', result.errors);
        }

        // Create origin path items on actor (for reference/display). Includes
        // the resolved divination (#316) so it is embedded + stamped into the
        // origin-grant ledger, keeping the boot reconcile idempotent.
        const cleanOriginItems: ItemDataLike[] = [];
        for (const selection of selectionsToApply) {
            const selWithToObject = selection as { toObject?: () => ItemDataLike };
            const itemData: ItemDataLike = selWithToObject.toObject ? selWithToObject.toObject() : (foundry.utils.deepClone(selection) as ItemDataLike);
            const sourceUuid = itemData.uuid ?? itemData._sourceUuid;
            // Remove internal tracking properties
            delete itemData._sourceUuid;
            delete itemData._actorItemId;
            // Ensure it's marked as an origin path item
            itemData.type = 'originPath';
            if (sourceUuid !== undefined && sourceUuid !== null && sourceUuid !== '') {
                const flags: { core?: CoreFlags } & Record<string, CoreFlags | undefined> = itemData.flags ?? {};
                const core: CoreFlags = flags.core ?? {};
                core.sourceId = sourceUuid;
                flags.core = core;
                itemData.flags = flags;
                // The advancement dialog and the XP derivation identify an owned
                // origin (an elite above all) by `_stats.compendiumSource`.
                itemData._stats = { ...itemData._stats, compendiumSource: sourceUuid };
            }
            cleanOriginItems.push(itemData);
        }
        await this.actor.createEmbeddedDocuments('Item', cleanOriginItems as Parameters<typeof this.actor.createEmbeddedDocuments>[1]);

        // Materialize granted talents on the actor so picks like
        // "Weapon Training (Chain)" appear in the Talents tab with the
        // chosen specialization stamped onto the item — instead of the
        // generic "Weapon Training (any)" the source compendium entry
        // carries. Choice-driven grants resolve through activeModifiers
        // (see OriginPathData._calculateActiveModifiers). Traits too (#727).
        await applyItemGrantsFromOrigins.call(this);

        // Materialize freeform content-item grants (special abilities,
        // malignancies, mutations, mental disorders) that carry no UUID.
        await applyContentItemGrantsFromOrigins.call(this);

        // Create each origin's starting kit and the equipment the player
        // picked in its equipment choices (they were shown but never given).
        await applyEquipmentGrantsFromOrigins.call(this);

        // Apply characteristic rolls if any are assigned
        const CHARS = GENERATION_CHARACTERISTICS;
        const charRolls = this._charRolls;
        const charAssignments = this._charAssignments;
        // `charAssignments[k]` is `number | null | undefined`; loose `!= null`
        // correctly rejects BOTH undefined (no entry) and explicit null
        // (entry cleared). The earlier `!== null` accepted undefined, so the
        // gate fired even when no characteristic had been assigned — the
        // loop below then wrote `.base = baseDefault + 0 + originBonus` for
        // every char, leaving stats <20 wherever the homeworld penalty bit.
        const hasCharRolls = charRolls.some((r) => r > 0) && CHARS.some((k) => charAssignments[k] != null);
        if (this._charGenMode === 'point-buy') {
            // Point-buy commit: base = (baseline|race base) + points spent +
            // origin bonus. Mirrors the dice path's absolute-write semantics
            // so a re-commit re-derives every characteristic rather than
            // stacking. Always runs (even with 0 points spent) so an origin
            // bonus still lands on a characteristic the player left at base.
            const originModSums = collectOriginCharacteristicBonuses.call(this);
            const settingDefaultBase = this._characteristicBase();
            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
            const charUpdate: Record<string, unknown> = {
                'system.characterGeneration.customBases.enabled': this._charAdvancedMode,
                'system.characterGeneration.mode': this._charGenMode,
            };
            for (const key of CHARS) {
                charUpdate[`system.characterGeneration.customBases.${key}`] = this._charCustomBases[key];
                charUpdate[`system.characterGeneration.pointBuy.${key}`] = Math.max(0, this._charPointBuy[key] ?? 0);
                const baseDefault = this._charAdvancedMode ? this._charCustomBases[key] || settingDefaultBase : settingDefaultBase;
                const points = Math.max(0, this._charPointBuy[key] ?? 0);
                const originBonus = originModSums[key] ?? 0;
                // Skip characteristics with nothing to write so we don't wipe
                // a manually-set base back down to baseDefault (same guard as
                // the dice path's "<20 everywhere" fix).
                if (points <= 0 && originBonus === 0) continue;
                charUpdate[`system.characteristics.${key}.base`] = baseDefault + points + originBonus;
            }
            await this.actor.update(charUpdate);
        } else if (hasCharRolls) {
            // Sum origin-path characteristic bonuses across every committed selection, so
            // baked-in bonuses like Imperial World's +5 Fellowship land directly in the
            // base characteristic instead of being re-computed at runtime every render.
            const originModSums = collectOriginCharacteristicBonuses.call(this);

            // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
            const charUpdate: Record<string, unknown> = {
                'system.characterGeneration.rolls': charRolls,
                'system.characterGeneration.assignments': charAssignments,
                'system.characterGeneration.customBases.enabled': this._charAdvancedMode,
                'system.characterGeneration.mode': this._charGenMode,
            };
            // Reset every base characteristic to (baseline + assigned roll + origin bonuses).
            // Rolls and origin bonuses are ALWAYS applied on origin commit (no override
            // checkbox), so a re-commit must rewrite each characteristic even if the
            // assignment or origin selection moved off of it.
            const settingDefaultBase = this._characteristicBase();
            for (const key of CHARS) {
                charUpdate[`system.characterGeneration.customBases.${key}`] = this._charCustomBases[key];
                // `||` (not `??`) so a stored custom base of 0 (legacy
                // bad data, see fix in input handler) falls back to
                // settingDefaultBase rather than zero-out .base on commit.
                const baseDefault = this._charAdvancedMode ? this._charCustomBases[key] || settingDefaultBase : settingDefaultBase;
                const rollIndex = charAssignments[key] ?? null;
                const rolled = rollIndex !== null && (charRolls[rollIndex] ?? 0) > 0 ? charRolls[rollIndex] ?? 0 : 0;
                const originBonus = originModSums[key] ?? 0;
                // Only overwrite `.base` when this specific characteristic
                // actually has a roll assigned OR an origin bonus to bake
                // in. Otherwise the writeback would wipe a player's
                // existing base value down to `baseDefault` (20) for any
                // characteristic that wasn't assigned this commit — the
                // exact "<20 everywhere" regression players hit.
                if (rolled <= 0 && originBonus === 0) continue;
                charUpdate[`system.characteristics.${key}.base`] = baseDefault + rolled + originBonus;
            }
            await this.actor.update(charUpdate);
        }

        // Apply divination, thrones, influence, wounds and fate.
        // These are ABSOLUTE writes (not additive) so re-committing the
        // builder doesn't stack +10 wounds / +3 fate on top of values the
        // player already had: each commit re-derives the final from the
        // current selections + rolled values, replacing whatever the
        // previous commit (or a manual edit) had written.
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.update() accepts an untyped path-keyed payload; Record<string,unknown> is the documented pattern
        const resourceUpdate: Record<string, unknown> = {};
        if (this._divination !== '') resourceUpdate['system.originPath.divination'] = this._divination;
        const thronesTotal = this._getTotalThronesRolled();
        if (thronesTotal > 0) resourceUpdate['system.throneGelt'] = thronesTotal;
        if (this._influenceRolled !== 0) resourceUpdate['system.influence'] = this._influenceRolled;

        // Sum rolled wounds + rolled fate across every committed origin so
        // the totals match what the builder previewed at confirm time.
        // Fate also counts the resolved divination (#316), whose `fateThreshold`
        // grant (e.g. +1 Fate threshold) lands on the Fate total (#63).
        let woundsRolled = 0;
        let fateRolled = 0;
        const fateOrigins = [...this.selections.values(), ...(this._divinationSelection !== null ? [this._divinationSelection] : [])];
        for (const selection of fateOrigins) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: selection.system shape is OriginPathSystemData | undefined per the open-ended selection map
            const selSys = selection.system as OriginPathSystemData | undefined;
            // eslint-disable-next-line no-restricted-syntax -- boundary: rollResults is a runtime-built per-origin Record we read structurally
            const rollResults = (selSys?.rollResults ?? {}) as Record<string, { rolled?: number } | undefined>;
            const wRolled = rollResults['wounds']?.rolled;
            if (typeof wRolled === 'number' && selection !== this._divinationSelection) woundsRolled += wRolled;
            fateRolled += originFateContribution(selSys?.grants ?? {}, rollResults['fate']?.rolled);
        }
        if (woundsRolled > 0) {
            resourceUpdate['system.wounds.max'] = woundsRolled;
            resourceUpdate['system.wounds.value'] = woundsRolled;
        }
        if (fateRolled > 0) {
            // The rolled Fate is the Fate total (`fate.max`, DH2's Fate threshold);
            // the character starts with all of it. The schema has no separate total field (#42).
            resourceUpdate['system.fate.max'] = fateRolled;
            resourceUpdate['system.fate.value'] = fateRolled;
        }
        const rewritten = new Set<OriginResource>();
        if (woundsRolled > 0) rewritten.add('wounds');
        if (fateRolled > 0) rewritten.add('fate');
        // A rolled total carries no item's resources (#691): let the item
        // ledger finish applying the talents this commit granted, then clear
        // what it recorded for the rewritten resources in the same write.
        await this.actor.syncItemResourceDeltas();
        Object.assign(resourceUpdate, resetItemResourceDeltas(this.actor.flags, rewritten));
        if (Object.keys(resourceUpdate).length > 0) {
            await this.actor.update(resourceUpdate);
        }

        // Apply each origin's `modifiers.resources` on top of the absolute
        // writes above and record every origin's delta in the shared ledger,
        // so the boot-time reconcile pass treats them as already applied.
        // Must run AFTER the embedded origin items are created (it reads them
        // back) and after the resource writes (which it builds on).
        await reconcileOriginGrantLedger.call(this, rewritten);
        // Then every owned talent, trait or equipped item adds its resources on top.
        await this.actor.syncItemResourceDeltas();

        // A starting-mutation origin (DH2 Mutant) rolls its
        // starting mutation now, in place of a Malignancy Test.
        if (this.actor.items.some((i) => i.type === 'originPath' && startingMutationFormula(i.system) !== null)) {
            openMutantBackgroundDialog(this.actor);
        }

        // Equip Acolyte: create the selected Armoury items on the actor (plus 2 clips for weapons)
        if (this.systemConfig.equipmentStep && this.equipmentSelections.size > 0) {
            await applyEquipmentSelections.call(this);
        }

        // Snapshot builder-specific state (equipment picks, characteristic rolls) so a later
        // builder open can re-hydrate the UI to what was last committed.
        await this._persistBuilderFlagState();

        // Stage 4 XP spend (DH2): if the actor has unspent
        // starting XP (which _resetExperienceAndAdvancements set to the
        // system's startingXP, e.g. 1000 for DH2e), offer to open the
        // Advancement dialog so the player can spend it now instead of
        // having to discover it later. Skipped when the actor has no
        // available XP — re-commits without a reset land here.
        const xpData = (this.actor.system as { experience?: { total?: number; used?: number } } | undefined)?.experience;
        const availableXP = (xpData?.total ?? 0) - (xpData?.used ?? 0);
        if (availableXP > 0) {
            const openAdvancement = await ConfirmationDialog.confirm({
                title: game.i18n.localize('WH40K.OriginPath.OpenAdvancementTitle'),
                content: `<p>${game.i18n.format('WH40K.OriginPath.OpenAdvancementPrompt', { xp: String(availableXP) })}</p>`,
            });
            if (openAdvancement) {
                AdvancementDialog.open(this.actor);
            }
        }

        // Success
        ui.notifications.info(game.i18n.localize('WH40K.OriginPath.CommitSuccess'));
        void this.close();
    } catch (err) {
        console.error('Failed to commit origin path:', err);
        ui.notifications.error(game.i18n.localize('WH40K.OriginPath.CommitFailed'));
    }
}
