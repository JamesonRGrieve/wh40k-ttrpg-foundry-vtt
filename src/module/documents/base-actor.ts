import { prepareUnifiedRoll } from '../applications/prompts/unified-roll-dialog.ts';
import { SYSTEM_ID } from '../constants.ts';
import { computeCharacteristicTotals } from '../data/shared/characteristic-math.ts';
import { isEffectSuppressedByEquipState, isWeaponAttackBlockedByEquip } from '../data/shared/equip-state.ts';
import { computeMovement } from '../data/shared/movement-math.ts';
import { type RawSubtletyAdjuster, subtletyAdjusterEffectOf } from '../data/shared/subtlety-adjuster.ts';
import { toCamelCase } from '../handlebars/handlebars-helpers.ts';
import { t } from '../i18n/t.ts';
import { SimpleSkillData } from '../rolls/action-data.ts';
import { clampDisposition } from '../rules/disposition.ts';
import { clampFearRating, getFearTestPenalty } from '../rules/fear.ts';
import { resolveEscapePinningTest, resolvePinningTest } from '../rules/pinning.ts';
import { type RerollOption, type RerollRollContext, type RerollSpec, rerollApplies, rerollLedgerKey, rerollUseAvailable } from '../rules/reroll.ts';
import { type CollectedAdjuster, clampSubtletyLoss, isSubtletyPrimitive, type SubtletySourceRef } from '../rules/subtlety-adjusters.ts';
import type { WH40KActorSystemData, WH40KCharacteristic, WH40KModifierEntry, WH40KSkill, WH40KStatBreakdown } from '../types/global.d.ts';
import { handleTalentRemoval, processTalentGrants } from '../utils/talent-grants.ts';
import { uuidNameCache } from '../utils/uuid-name-cache.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import type { WH40KItem } from './item.ts';

/* eslint-disable no-restricted-syntax -- boundary: these utility types intersect with Record<string, unknown> to allow index access on opaque roll/characteristic/skill data models */
type RollDataLike = Record<string, unknown> & {
    actor?: WH40KBaseActor;
    sourceActor?: WH40KBaseActor;
    nameOverride?: string;
    type?: string;
    rollKey?: string;
    baseTarget?: number;
    /**
     * Effective training rank of the *specific* thing being rolled (0 = untrained,
     * >0 = trained at some tier). Set for specialist-skill rolls so the roll dialog
     * reads the rolled specialisation entry's rank rather than the parent skill's
     * advance (which is ~0 for specialist skills). See #225.
     */
    skillRank?: number;
    modifiers: { modifier: number; situational?: number; [key: string]: number | undefined };
};

type CharacteristicLike = Record<string, unknown> & WH40KCharacteristic;
type SkillLike = Record<string, unknown> & WH40KSkill;
/* eslint-enable no-restricted-syntax */
type ItemModifierCarrier = WH40KItem & {
    system: WH40KItem['system'] & {
        modifiers?: {
            characteristics?: Record<string, number>;
            skills?: Record<string, number>;
            other?: Array<{ key: string; value: number }>;
        };
    };
};

export class WH40KBaseActor extends Actor {
    declare system: Actor['system'] & WH40KActorSystemData;
    declare items: Actor['items'] & foundry.utils.Collection<WH40KItem>;

    // eslint-disable-next-line no-restricted-syntax -- boundary: base class stub returns unknown; subclasses override with concrete roll results
    async rollCharacteristicCheck(_characteristic: string): Promise<unknown> {
        return Promise.resolve(null);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: base class stub returns unknown; subclasses override with concrete roll results
    async rollWeaponAction(item: WH40KItem): Promise<unknown> {
        return this.rollItem(item.id ?? '');
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: base class stub returns unknown; subclasses override with concrete roll results
    async rollPsychicPower(item: WH40KItem): Promise<unknown> {
        return this.rollItem(item.id ?? '');
    }

    async spendFate(): Promise<void> {}

    /**
     * Apply fatigue to the actor (core.md §"Fatigue"). Knock-Down, Forced
     * Marching, Suppressing Fire, and several conditions all push fatigue
     * without going through the full damage pipeline. Clamps at the
     * fatigue threshold (typically `2 × TB`) but does NOT auto-knock the
     * actor unconscious — surface that decision to the GM via chat
     * notification when the cap is reached.
     *
     * @param amount Positive integers add fatigue; negative integers
     *   remove it (clamped at 0).
     */
    async applyFatigue(amount: number): Promise<void> {
        if (!Number.isFinite(amount) || amount === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system shape varies by subclass; the fatigue slot is guaranteed by `creature.ts` for the relevant subclasses
        const fatigue = (this.system as { fatigue?: { value: number; max: number } }).fatigue;
        if (!fatigue) return;
        const next = Math.max(0, fatigue.value + Math.trunc(amount));
        await this.update({ 'system.fatigue.value': next });
    }

    /**
     * Apply recoverable characteristic damage (core.md §"Characteristic
     * Damage"). The damage slot lives on each characteristic; the actor's
     * effective value is `total − damage`. Always non-negative.
     *
     * @param characteristic Lowercase characteristic key
     *   (e.g. `'weaponSkill'`, `'toughness'`).
     * @param amount Positive integers add damage; negative integers
     *   heal it (clamped at 0).
     */
    async applyCharacteristicDamage(characteristic: string, amount: number): Promise<void> {
        if (!Number.isFinite(amount) || amount === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is a dynamic record keyed by characteristic slug
        const chars = (this.system as { characteristics?: Record<string, { damage?: number } | undefined> }).characteristics;
        const slot = chars?.[characteristic];
        if (!slot) return;
        const current = slot.damage ?? 0;
        const next = Math.max(0, current + Math.trunc(amount));
        await this.update({ [`system.characteristics.${characteristic}.damage`]: next });
    }

    /**
     * Adjust the actor's Shock counter (core.md §"Shock And Snapping
     * Out Of It"). Positive amounts add shock; negative amounts (e.g.
     * after a successful Snap-Out test) reduce it. Clamps at 0.
     */
    async applyShock(amount: number): Promise<void> {
        if (!Number.isFinite(amount) || amount === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: shock slot is optional and per-subclass
        const shock = (this.system as { shock?: { value: number } }).shock;
        if (!shock) return;
        const next = Math.max(0, shock.value + Math.trunc(amount));
        await this.update({ 'system.shock.value': next });
    }

    /**
     * Tree-walk the actor's owned items (origin-path steps are materialized as
     * `originPath` items, so this covers homeworld clamps too) and collect
     * every Subtlety adjuster declared on a governing compendium entry.
     *
     * Mechanic values come straight from each item's `system.subtletyAdjuster`
     * (authored on the compendium document, kept current on owned items by the
     * boot-time compendium→world resync). Nothing is hardcoded here per
     * CLAUDE.md Direction #7. `passive` adjusters that require an equipped
     * carrier (e.g. a Daemon Weapon) are only collected while wielded.
     */
    collectSubtletyAdjusters(): CollectedAdjuster[] {
        const out: CollectedAdjuster[] = [];
        for (const item of this.items) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: subtletyAdjuster/equipped live on specific item DataModels; the mixin static type is not surfaced through SystemDataModel.mixin
            const sys = item.system as { subtletyAdjuster?: RawSubtletyAdjuster; state?: { equipped?: boolean } } | undefined;
            const effect = subtletyAdjusterEffectOf(sys?.subtletyAdjuster);
            if (effect === null) continue;
            // If `requiresEquipped` is set, the carrier item must expose an
            // explicit `equipped: true`. Items that don't declare an
            // `equipped` field at all (e.g. talents) are treated as
            // always-on, so they pass this gate when the adjuster does not
            // require equipping.
            if (effect.kind === 'passive' && effect.requiresEquipped && !('equipped' in (sys?.state ?? {}) && sys?.state?.equipped === true)) continue;
            const sourceUuid = WH40KBaseActor.#compendiumSourceUuidOf(item);
            out.push({
                sourceUuid,
                primitive: null,
                // Owned-item name mirrors the compendium document (resync keeps
                // it synced); never a hardcoded string.
                label: item.name,
                kind: effect.kind,
                delta: effect.delta,
                minAbsoluteDelta: effect.minAbsoluteDelta,
            });
        }
        return out;
    }

    /** Compendium-source UUID an owned item was created from, or `null`. */
    static #compendiumSourceUuidOf(item: WH40KItem): string | null {
        // eslint-disable-next-line no-restricted-syntax -- boundary: _stats is Foundry-managed document metadata not in our schema
        const stats = (item as { _stats?: { compendiumSource?: string | null } })._stats;
        const src = stats?.compendiumSource;
        return typeof src === 'string' && src.length > 0 ? src : null;
    }

    /**
     * Resolve a Subtlety attribution to a display label. Content sources
     * resolve to the live compendium document name (single source of truth,
     * via the owned item or `uuidNameCache`); non-content primitives resolve
     * to their langpack string OUTSIDE the content namespace.
     */
    subtletySourceLabel(ref: SubtletySourceRef): string {
        if (isSubtletyPrimitive(ref)) {
            return ref === 'manual' ? t('WH40K.Subtlety.ManualAdjustment') : t('WH40K.Subtlety.Inquest');
        }
        const found = this.collectSubtletyAdjusters().find((a) => a.sourceUuid === ref);
        return found?.label ?? uuidNameCache.getName(ref);
    }

    /**
     * Adjust the actor's Subtlety pool (DH2-only, core.md §"Influence
     * And Subtlety"). Positive amounts raise the warband's subtlety;
     * negative amounts (most common, since missions usually erode it)
     * lower it. Clamps at 0..max.
     *
     * Any "resist Subtlety loss" clamp the actor carries (e.g. Quarantine
     * World, Enemies Beyond p. 30) is applied to losses first — discovered by
     * tree-walking owned items, with the minimum retained loss read from the
     * governing compendium entry rather than hardcoded.
     *
     * @param source Optional attribution: a compendium UUID (label resolved
     *   from the live document) or a non-content primitive. Stored on
     *   `flags.wh40k-rpg.lastSubtletySource` so the activity-log layer can
     *   group entries by cause.
     */
    async applySubtlety(amount: number, source?: SubtletySourceRef): Promise<void> {
        if (!Number.isFinite(amount) || amount === 0) return;
        // Subtlety is a single warband-wide, world-scoped pool (#64), DH2-only.
        // The current value mirrors that world setting on `system.subtlety.value`
        // (see CharacterData#_syncWarbandSubtlety); the actor's own carried clamps
        // still shape how far THIS player's action moves the shared pool.
        // eslint-disable-next-line no-restricted-syntax -- boundary: subtlety + gameSystem live on character.ts only
        const system = this.system as { subtlety?: { value: number; max: number }; gameSystem?: string };
        const subtlety = system.subtlety;
        if (!subtlety || system.gameSystem !== 'dh2') return;
        let delta = Math.trunc(amount);
        if (delta < 0) {
            for (const adj of this.collectSubtletyAdjusters()) {
                if (adj.kind === 'clamp' && adj.minAbsoluteDelta > 0) {
                    delta = clampSubtletyLoss(delta, adj.minAbsoluteDelta);
                }
            }
        }
        if (delta === 0) return;
        // Base the new pool on the LIVE world setting, not system.subtlety.value:
        // that field is a per-actor mirror only re-synced on prep, so two
        // applySubtlety calls within a single tick (no re-prep between) would both
        // compute from the same stale baseline and lose one delta. The setting is
        // the source of truth and reflects the prior call immediately.
        const current = WH40KSettings.getWarbandSubtlety();
        const next = Math.max(0, Math.min(subtlety.max, current + delta));
        // Persist to the shared world setting: it propagates to every connected
        // client and its onChange re-renders open sheets so all acolytes show the
        // same pool. Attribution stays on the acting actor's flag for the
        // activity-log layer.
        await WH40KSettings.setWarbandSubtlety(next);
        if (source !== undefined) await this.update({ 'flags.wh40k-rpg.lastSubtletySource': source });
    }

    /**
     * Apply the one-shot Subtlety hit declared by a compendium-backed source
     * the actor owns (e.g. a Dark Pact talent being discovered). The delta is
     * read from that entry's `subtletyAdjuster` (`kind: 'event'`) and scaled
     * by `scale`. `passive` and `clamp` adjusters are NOT applied here — they
     * are standing effects surfaced by `collectSubtletyAdjusters()` for
     * display/aggregation, applying them as one-shots would double-count.
     */
    async applySubtletyFromSource(sourceUuid: string, scale = 1): Promise<void> {
        const adj = this.collectSubtletyAdjusters().find((a) => a.sourceUuid === sourceUuid);
        if (adj?.kind !== 'event') return;
        const delta = Math.trunc(adj.delta * scale);
        if (delta === 0) return;
        await this.applySubtlety(delta, sourceUuid);
    }

    /**
     * Adjust an NPC's disposition toward the warband (core.md §"Disposition").
     * Clamps at the −3..+3 range. The reason is informational only; an
     * audit log would be a separate sheet feature.
     */
    async adjustDisposition(delta: number, _reason?: string): Promise<void> {
        if (!Number.isFinite(delta) || delta === 0) return;
        // eslint-disable-next-line no-restricted-syntax -- boundary: disposition lives on npc.ts only
        const disposition = (this.system as { disposition?: { value: number } }).disposition;
        if (!disposition) return;
        const next = clampDisposition(disposition.value + Math.trunc(delta));
        await this.update({ 'system.disposition.value': next });
    }

    /* -------------------------------------------- */
    /*  Descendant Document Hooks                   */
    /* -------------------------------------------- */

    /**
     * Handle the creation of descendant documents (items).
     * @override
     */
    protected override _onCreateDescendantDocuments(...args: Actor.OnCreateDescendantDocumentsArgs): void {
        super._onCreateDescendantDocuments(...args);
        const [, collection, documents, , , userId] = args;
        // eslint-disable-next-line no-restricted-syntax -- boundary: _onCreateDescendantDocuments documents arg is untyped; cast to WH40KItem[] is necessary
        const items = documents as unknown as WH40KItem[];
        if (collection === 'items') {
            this._onItemsChanged();

            // Process talent grants for newly added talents
            if (game.user.id === userId) {
                for (const item of items) {
                    if (item.type === 'talent' && (item.system as { hasGrants?: boolean }).hasGrants === true) {
                        setTimeout(() => void processTalentGrants(item, this), 100);
                    }
                }
            }
        }
    }

    /**
     * Handle the update of descendant documents (items).
     * @override
     */
    protected override _onUpdateDescendantDocuments(...args: Actor.OnUpdateDescendantDocumentsArgs): void {
        super._onUpdateDescendantDocuments(...args);
        const [, collection] = args;
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Handle the deletion of descendant documents (items).
     * @override
     */
    protected override _onDeleteDescendantDocuments(...args: Actor.OnDeleteDescendantDocumentsArgs): void {
        const [, collection, documents, , , userId] = args;
        // eslint-disable-next-line no-restricted-syntax -- boundary: _onDeleteDescendantDocuments documents arg is untyped; cast to WH40KItem[] is necessary
        const items = documents as unknown as WH40KItem[];
        if (collection === 'items' && game.user.id === userId) {
            for (const item of items) {
                if (item.type === 'talent' && (item.system as { hasGrants?: boolean }).hasGrants === true) {
                    setTimeout(() => void handleTalentRemoval(item, this), 100);
                }
            }
        }

        super._onDeleteDescendantDocuments(...args);
        if (collection === 'items') {
            this._onItemsChanged();
        }
    }

    /**
     * Called when items are created, updated, or deleted.
     * Triggers recalculation of item-based data via prepareEmbeddedData.
     */
    _onItemsChanged(): void {
        const system = this.system as { _initializeModifierTracking?: () => void };
        if (typeof system._initializeModifierTracking === 'function') {
            system._initializeModifierTracking();
        }
        this._runEmbeddedDataPrep();
    }

    protected override async _preCreate(data: never, options: never, user: User.Internal.Implementation): Promise<boolean | undefined> {
        await super._preCreate(data, options, user as never);
        // eslint-disable-next-line no-restricted-syntax -- boundary: _preCreate data/options typed as never; cast to Record is necessary to access fields
        const createData = data as Record<string, unknown>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: _preCreate options typed as never; cast to Record is necessary to access fields
        const preCreateOptions = options as Record<string, unknown>;
        void preCreateOptions;
        // eslint-disable-next-line no-restricted-syntax -- boundary: token init data passed to updateSource; Record<string, unknown> is the correct boundary type
        const initData: Record<string, unknown> = {
            'token.bar1': { attribute: 'wounds' },
            'token.bar2': { attribute: 'fate' },
            'token.displayName': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.displayBars': CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
            'token.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL,
            'token.name': createData['name'],
        };

        // Seed system.gameSystem from the concrete DataModel's static, so a
        // freshly-created dh2-character / dh1-character / etc actor reflects
        // its actual ruleset instead of inheriting the 'rt' schema default.
        const actorType = typeof createData['type'] === 'string' ? createData['type'] : null;
        if (actorType !== null) {
            const dataModels = CONFIG.Actor.dataModels as { [key: string]: { gameSystem?: string } | undefined };
            const dataModelClass = dataModels[actorType];
            const staticGameSystem = dataModelClass?.gameSystem;
            const currentSystem = (this.system as { gameSystem?: string } | undefined)?.gameSystem;
            if (typeof staticGameSystem === 'string' && staticGameSystem !== '' && currentSystem !== staticGameSystem) {
                initData['system.gameSystem'] = staticGameSystem;
            } else if ((staticGameSystem === undefined || staticGameSystem === '') && (currentSystem === undefined || currentSystem === 'rt')) {
                // Generic (non-line-specific) actor type: inherit the world's primary line.
                initData['system.gameSystem'] = WH40KSettings.getPrimaryGameSystem();
            }
        }
        const createType = createData['type'];
        if (
            typeof createType === 'string' &&
            (createType.includes('terracraft') || createType.includes('aircraft') || createType.includes('watercraft') || createType.includes('vehicle'))
        ) {
            // Conventional craft track structural `integrity`; voidcraft use
            // `hullIntegrity` and set their own bars in WH40KVoidcraft._preCreate.
            initData['token.bar1'] = { attribute: 'integrity' };
            initData['token.bar2'] = undefined;
        }
        if (createData['type'] === 'acolyte' || createData['type'] === 'character') {
            initData['token.vision'] = true;
            initData['token.actorLink'] = true;

            // Set default favorite skills for new characters
            if (this.getFlag('wh40k-rpg', 'favoriteSkills') === undefined || this.getFlag('wh40k-rpg', 'favoriteSkills') === null) {
                initData['flags.wh40k-rpg.favoriteSkills'] = ['dodge', 'awareness', 'scrutiny', 'inquiry', 'commerce', 'techUse', 'command', 'medicae'];
            }
        }
        this.updateSource(initData);
        return undefined;
    }

    get characteristics(): Record<string, WH40KCharacteristic> {
        return this.system.characteristics;
    }

    get initiative(): { base: number; bonus: number; characteristic?: string } {
        return this.system.initiative;
    }

    /**
     * Foundry's default `Actor.getRollData()` returns the raw `this.system`;
     * delegate to the system DataModel's enriched `getRollData()` so characteristic
     * short-keys (`@WS`), bonuses (`@WSB`), full keys (`@weaponSkill`) and `@pr`
     * resolve in roll formulas and enriched HTML wherever actor roll data is
     * consumed (e.g. ProseMirror enrichment in the sheet).
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's Actor.getRollData returns the untyped system object; the per-system DataModel adds the @-key enrichment via its own getRollData
    override getRollData(): Record<string, unknown> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: this.system is Foundry's untyped document data; narrow to detect the per-system DataModel's own getRollData
        const system = this.system as { getRollData?: () => Record<string, unknown> };
        if (typeof system.getRollData === 'function') return system.getRollData();
        return super.getRollData();
    }

    get wounds(): { value: number; max: number; critical: number } {
        return this.system.wounds;
    }

    get size(): number {
        return Number.parseInt(String(this.system.size), 10);
    }

    get movement(): { half: number; full: number; charge: number; run: number } {
        return this.system.movement;
    }

    override prepareData(): void {
        super.prepareData();

        // Skip legacy calculations if a DataModel is handling data preparation
        // DataModels have their own prepareDerivedData that already ran
        const hasDataModel = typeof this.system.prepareDerivedData === 'function';
        if (!hasDataModel) {
            this._computeCharacteristics();
            this._computeMovement();
        }
    }

    /**
     * Gate transferred Active Effects on equip state (#333): an effect that
     * lives on an equippable item (armour / gear / cybernetic / weapon / force
     * field) applies only while that item is equipped. Effects on the actor
     * itself and on always-on items (talents / traits / conditions / origin
     * paths) are unaffected. This makes Foundry's native effect transfer follow
     * the same rule already enforced for item stat modifiers (creature template)
     * and passive Subtlety adjusters (collectSubtletyAdjusters), so unequipping
     * a piece of gear removes its bonuses and re-equipping restores them.
     *
     * `applyActiveEffects()` (invoked from the super `prepareData`) consumes this
     * generator, so filtering here suppresses the effect's changes wholesale.
     */
    override *allApplicableEffects(): Generator<ActiveEffect.Implementation, void, undefined> {
        for (const effect of super.allApplicableEffects()) {
            const parent = effect.parent;
            if (parent?.documentName === 'Item') {
                // eslint-disable-next-line no-restricted-syntax -- boundary: item.system.state lives on EquippableTemplate DataModels, not the base Item type
                const sys = (parent as { system?: { state?: { equipped?: boolean } } }).system;
                if (isEffectSuppressedByEquipState(sys)) continue;
            }
            yield effect;
        }
    }

    /**
     * Roll an item action (weapon attack, psychic power, etc.) by item ID.
     * Override in subclasses with item-type-specific behavior.
     */
    async rollItem(_itemId: string): Promise<void> {
        // Base implementation does nothing; subclasses override.
    }

    /**
     * Roll a weapon attack by item id. This is the public entry point used by
     * the combat quick panel and any other UI surface that wants to fire a
     * specific weapon. It routes through the same per-item dispatch as the
     * sheet (`rollItem`), which in turn drives the targeted-action manager —
     * so target selection (Foundry `game.user.targets`), distance, and the
     * full attack→damage pipeline all apply identically.
     *
     * Defined on the base actor so it is available for all seven game systems
     * and both PC and NPC subclasses (which override `rollItem`). Previously
     * this method did not exist, so the quick-panel's `actor?.rollWeaponAttack?.(…)`
     * optional-chained call silently no-opped and the attack buttons did nothing.
     *
     * @param weaponId The id of the weapon item to attack with.
     * @param _options Reserved for future per-call overrides (rate of fire,
     *        skip-dialog). The unified roll dialog is the single source of
     *        truth for attack options today, so these are accepted but not yet
     *        consumed; the parameter keeps the call sites stable.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: caller-supplied options bag is an opaque cross-cutting config consumed by per-system roll dialogs
    async rollWeaponAttack(weaponId: string, _options: Record<string, unknown> = {}): Promise<void> {
        await this.rollItem(weaponId);
    }

    rollCharacteristic(characteristicName: string, override?: string): void {
        const characteristic = this.characteristics[characteristicName];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (characteristic === undefined) return;

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: characteristicName,
            type: 'characteristic',
            label: characteristic.label,
            target: characteristic.total,
            ...(override !== undefined ? { typeOverride: override } : {}),
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll a Fear (X) resist test for this actor (the observer). Routes through the
     * unified roll pipeline (`type='Characteristic'`, `rollKey='willpower'`,
     * `situationalKey='willpower'`) so conditional Willpower talents/traits —
     * Resistance(Fear), Jaded, etc. — surface as selectable situational modifiers
     * BEFORE the test resolves. The Fear-rating penalty (−10 × X) is applied as a
     * visible named modifier on the card. No-op at rating 0 (no Fear trait).
     */
    rollFearTest(fearRating: number): void {
        const rating = clampFearRating(fearRating);
        if (rating === 0) return;
        const willpower = this.characteristics['willpower'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (willpower === undefined) return;

        const simpleSkillData = this._buildSimpleSkillRoll({
            key: 'willpower',
            type: 'characteristic',
            label: t('WH40K.Fear.TestLabel', { rating }),
            target: willpower.total,
            situationalKey: 'willpower',
            extraModifiers: { fear: -getFearTestPenalty(rating) },
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll a Pinning resist test (Challenging +0 Willpower, plus an optional trigger
     * modifier from the source — e.g. Suppressing Fire). Routes through the unified
     * pipeline with `situationalKey='willpower'` so Willpower talents/traits surface
     * before resolving. `resolvePinningTest` composes the WP target (the previously
     * orphaned rule now has a live caller).
     */
    rollPinningTest(triggerModifier = 0): void {
        const willpower = this.characteristics['willpower'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (willpower === undefined) return;

        const { target } = resolvePinningTest({ willpowerTotal: willpower.total, triggerModifier });
        const simpleSkillData = this._buildSimpleSkillRoll({
            key: 'willpower',
            type: 'characteristic',
            label: t('WH40K.Pinning.TestLabel'),
            target,
            situationalKey: 'willpower',
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /**
     * Roll the end-of-turn auto-escape-from-pinning test (+30 favourable bonus if in
     * cover OR not shot at this round). Routes through the unified pipeline so
     * Willpower talents/traits surface before resolving.
     */
    rollEscapePinningTest(opts: { notBeingShotAt: boolean; inCover: boolean }): void {
        const willpower = this.characteristics['willpower'];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
        if (willpower === undefined) return;

        const { target } = resolveEscapePinningTest({
            willpowerTotal: willpower.total,
            notBeingShotAt: opts.notBeingShotAt,
            inCover: opts.inCover,
        });
        const simpleSkillData = this._buildSimpleSkillRoll({
            key: 'willpower',
            type: 'characteristic',
            label: t('WH40K.Pinning.EscapeLabel'),
            target,
            situationalKey: 'willpower',
        });
        prepareUnifiedRoll(simpleSkillData);
    }

    /* -------------------------------------------- */
    /*  Re-roll variants                            */
    /* -------------------------------------------- */

    /**
     * Collect the re-roll options for a just-resolved roll: every owned
     * talent/trait whose `reroll` block applies (by test type/key + success
     * state) and still has uses left, plus any variant a
     * `wh40k.collectRerollOptions` hook listener contributes, plus the global
     * Spend-Fate re-roll. Surfaced on the roll-result chat card as buttons
     * SEPARATE from Spend Fate. `this` is the source (rolling) actor.
     */
    getRerollOptions(rollData: RerollRollContext): RerollOption[] {
        const options: RerollOption[] = [];
        const ledger = this._rerollLedger();

        for (const item of this.items) {
            if (!(item.isTalent || item.isTrait)) continue;
            // eslint-disable-next-line no-restricted-syntax -- boundary: the `reroll` block is declared on the talent/trait DataModel templates; the item.system union does not surface it here
            const spec = (item.system as { reroll?: RerollSpec }).reroll;
            if (spec === undefined || !rerollApplies(spec, rollData)) continue;
            const id = rerollLedgerKey(item.id, spec.frequency);
            options.push({
                id,
                kind: 'item',
                label: spec.label !== '' ? spec.label : item.name,
                modifier: spec.modifier,
                source: item.name,
                disabled: !rerollUseAvailable(spec, ledger[id] ?? 0),
                frequency: spec.frequency,
            });
        }

        // Let modules / external code contribute variants before the global Fate option.
        // eslint-disable-next-line no-restricted-syntax -- boundary: Hooks.callAll accepts arbitrary variadic args; the custom hook name is outside fvtt-types' HookConfig keyof constraint
        (Hooks as { callAll: (hook: string, ...args: unknown[]) => boolean }).callAll('wh40k.collectRerollOptions', { actor: this, rollData, options });

        // eslint-disable-next-line no-restricted-syntax -- boundary: fate pool is optional on the typed system union; cast through a narrow shape is necessary
        const fate = (this.system as { fate?: { value?: number } }).fate?.value ?? 0;
        if (fate > 0) {
            options.push({
                id: 'fate',
                kind: 'fate',
                label: t('WH40K.FateReroll'),
                modifier: 0,
                source: t('WH40K.Reroll.FateSource'),
                disabled: false,
                frequency: 'at-will',
            });
        }

        return options;
    }

    /** Read the per-actor windowed re-roll-use ledger (variant id → uses consumed). */
    private _rerollLedger(): Record<string, number> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry getFlag returns unknown; the reroll-uses ledger is a number map keyed by variant id
        const raw = this.getFlag(SYSTEM_ID, 'rerollUses') as Record<string, number> | undefined;
        return raw ?? {};
    }

    /**
     * Consume one use of a windowed re-roll variant (no-op for `at-will`/`fate`).
     * Persists to the actor flag ledger reset by the per-encounter / per-session
     * hooks.
     */
    async consumeRerollUse(variantId: string): Promise<void> {
        if (variantId === 'fate' || variantId.endsWith(':at-will')) return;
        const ledger = this._rerollLedger();
        await this.setFlag(SYSTEM_ID, `rerollUses.${variantId}`, (ledger[variantId] ?? 0) + 1);
    }

    /**
     * Clear windowed re-roll uses whose variant id ends with the given frequency
     * suffix (`:per-encounter` on combat end, `:per-session` on the session
     * marker). Other windows are left untouched.
     */
    async resetRerollUses(frequency: 'per-encounter' | 'per-session'): Promise<void> {
        const ledger = this._rerollLedger();
        const suffix = `:${frequency}`;
        const next: Record<string, number> = {};
        let changed = false;
        for (const [key, value] of Object.entries(ledger)) {
            if (key.endsWith(suffix)) {
                changed = true;
                continue;
            }
            next[key] = value;
        }
        if (changed) await this.setFlag(SYSTEM_ID, 'rerollUses', next);
    }

    /* -------------------------------------------- */
    /*  Roll Builders                               */
    /* -------------------------------------------- */

    /**
     * Build a populated SimpleSkillData for a unified roll. Centralises the boilerplate
     * shared by `rollCharacteristic` / `rollSkill` / `rollSimpleWeapon` across PC and NPC
     * actors.
     *
     * Asymmetry: PCs (acolyte) honour situational modifiers from items; NPCs do not.
     * Pass `situationalKey` (with the matching `type`) to opt-in to PC-style situational
     * modifier collection. Omit it for NPC-style direct rolls.
     */
    protected _buildSimpleSkillRoll(opts: {
        key: string;
        type: 'characteristic' | 'skill' | 'simpleWeapon';
        label: string;
        target: number;
        situationalKey?: string | undefined;
        nameOverride?: string | undefined;
        skillRank?: number | undefined;
        /** Free-form flavor for `rollData.type` (e.g. a weapon name), overriding the per-`type` literal. */
        typeOverride?: string | undefined;
        /**
         * Extra named modifiers folded into `rollData.modifiers` (e.g. a Fear-rating
         * penalty or a Pinning trigger modifier). Each key surfaces on the chat-card
         * breakdown and is summed into the final target alongside the dialog-managed
         * difficulty / situational modifiers. Zero-valued entries are skipped.
         */
        extraModifiers?: Record<string, number> | undefined;
    }): SimpleSkillData {
        const TYPE_LITERAL: Record<typeof opts.type, string> = {
            characteristic: 'Characteristic',
            skill: 'Skill',
            simpleWeapon: 'Attack',
        };

        const simpleSkillData = new SimpleSkillData();
        // eslint-disable-next-line no-restricted-syntax -- boundary: SimpleSkillData.rollData is opaque; cast to RollDataLike is necessary to access typed fields
        const rollData = simpleSkillData.rollData as unknown as RollDataLike;
        rollData.actor = this;
        rollData.sourceActor = this;
        rollData.nameOverride = opts.nameOverride ?? opts.label;
        rollData.type = opts.typeOverride ?? TYPE_LITERAL[opts.type];
        rollData.rollKey = opts.key;
        rollData.baseTarget = opts.target;
        if (opts.skillRank !== undefined) rollData.skillRank = opts.skillRank;
        rollData.modifiers.modifier = 0;

        if (opts.situationalKey !== undefined) {
            const sitMod = this._collectSituationalModifierTotal(opts.type, opts.situationalKey);
            if (sitMod !== 0) rollData.modifiers.situational = sitMod;
        }

        if (opts.extraModifiers !== undefined) {
            for (const [key, value] of Object.entries(opts.extraModifiers)) {
                if (value !== 0) rollData.modifiers[key] = value;
            }
        }

        return simpleSkillData;
    }

    /**
     * Sum situational modifiers for a roll. Subclasses (e.g. WH40KAcolyte) expose the
     * per-type modifier collectors; if they are not available, this returns 0 — matching
     * the NPC path where situational modifiers are intentionally not consulted.
     * @private
     */
    private _collectSituationalModifierTotal(type: 'characteristic' | 'skill' | 'simpleWeapon', key: string): number {
        // eslint-disable-next-line no-restricted-syntax -- boundary: situational modifier methods are system extensions not declared on WH40KBaseActor; cast through unknown is necessary
        const provider = this as unknown as {
            getCharacteristicSituationalModifiers?: (k: string) => Array<{ value: number }>;
            getSkillSituationalModifiers?: (k: string) => Array<{ value: number }>;
            getCombatSituationalModifiers?: (k: string) => Array<{ value: number }>;
        };
        let modifiers: Array<{ value: number }> | undefined;
        if (type === 'characteristic') {
            modifiers = provider.getCharacteristicSituationalModifiers?.(key);
        } else if (type === 'skill') {
            modifiers = provider.getSkillSituationalModifiers?.(key);
        } else {
            modifiers = provider.getCombatSituationalModifiers?.(key);
        }
        if (modifiers === undefined || modifiers.length === 0) return 0;
        let total = 0;
        for (const mod of modifiers) total += mod.value;
        return total;
    }

    /**
     * Shared weapon / psychic-power / default-vocalize roll dispatch. Centralises
     * the near-identical state machine that lived on both WH40KAcolyte and WH40KNPC.
     * PCs pass `enforceEquipped: true` (and handle their forceField branch before
     * delegating); NPCs pass `false`.
     */
    protected async _dispatchItemRoll(item: WH40KItem, { enforceEquipped }: { enforceEquipped: boolean }): Promise<void> {
        if (item.type === 'weapon') {
            if (isWeaponAttackBlockedByEquip(item.system, enforceEquipped)) {
                ui.notifications.warn(t('WH40K.Warning.WeaponNotEquipped'));
                return;
            }
            if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls) === true) {
                this.rollCharacteristic(item.isRanged ? 'ballisticSkill' : 'weaponSkill', item.name);
            } else {
                const { DHTargetedActionManager } = await import('../actions/targeted-action-manager.ts');
                DHTargetedActionManager.performWeaponAttack(this, null, item);
            }
            return;
        }
        if (item.type === 'psychicPower') {
            if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls) === true) {
                this.rollCharacteristic('willpower', item.name);
            } else {
                const { DHTargetedActionManager } = await import('../actions/targeted-action-manager.ts');
                DHTargetedActionManager.performPsychicCast(this, null, item);
            }
            return;
        }
        await this._vocalizeItem(item);
    }

    /**
     * Vocalize an item's benefit/description in chat (the default rollItem branch
     * for non-weapon/non-psychic items). Shared by PC and NPC.
     */
    protected async _vocalizeItem(item: WH40KItem): Promise<void> {
        const { DHBasicActionManager } = await import('../actions/basic-action-manager.ts');
        // eslint-disable-next-line no-restricted-syntax -- boundary: benefit/description are per-item-type fields not on the shared system union; narrowed inline before string-vs-object dispatch
        const system = item.system as { benefit?: unknown; description?: unknown };
        const benefit = system.benefit;
        const description = system.description;
        const rawDescription =
            (typeof benefit === 'string' ? benefit : null) ??
            (typeof description === 'string'
                ? description
                : typeof description === 'object' && description !== null && 'value' in description
                ? // eslint-disable-next-line no-restricted-syntax -- boundary: description-object shape is per-item-type; narrowed inline
                  (description as { value?: string }).value ?? ''
                : '');
        const psyRating = this._rollPsyRating();
        await DHBasicActionManager.sendItemVocalizeChat({
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-restricted-syntax -- this.name is a Foundry document property that may be null; boundary: ?? is necessary here, not a DataModel schema gap
            actor: this.name ?? '',
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- item.name may be null per fvtt-types; ?? guard is intentional
            name: item.name ?? '',
            type: item.type.toUpperCase(),
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- TextEditor is the V14 global; migration to foundry.applications.ux.TextEditor tracked separately
            description: await TextEditor.enrichHTML(rawDescription, {
                rollData: { actor: this, item, ...(psyRating !== undefined ? { pr: psyRating } : {}) },
            }),
        });
    }

    /**
     * Psy rating exposed to vocalized-item enrichHTML rollData (`@pr`). Base/NPC
     * actors have none; WH40KAcolyte overrides to return its psy rating.
     */
    protected _rollPsyRating(): number | undefined {
        return undefined;
    }

    /**
     * Run the DataModel's embedded-data preparation if it defines one. Shared by the
     * per-subclass `prepareData` hooks and `_onItemsChanged`.
     */
    protected _runEmbeddedDataPrep(): void {
        const system = this.system as { prepareEmbeddedData?: () => void };
        if (typeof system.prepareEmbeddedData === 'function') {
            system.prepareEmbeddedData();
        }
    }

    getCharacteristicFuzzy(char: string): WH40KCharacteristic | undefined {
        // This tries to account for case sensitivity and abbreviations
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            if (char.toUpperCase() === name.toUpperCase() || char.toLocaleString() === characteristic.short.toUpperCase()) {
                return characteristic;
            }
        }
        return undefined;
    }

    /**
     * Compute characteristic totals and bonuses.
     * Used for actor types that don't have a DataModel (NPC, Vehicle, Starship).
     * @protected
     */
    _computeCharacteristics(): void {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- characteristics may be undefined on actors without a DataModel; guard is intentional
        if (this.characteristics === undefined) return;

        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics is typed as Record<string, WH40KCharacteristic>; cast to include starting/advances fields is necessary for legacy actors
        const charRecord = this.characteristics as Record<string, WH40KCharacteristic & { starting?: number; advances?: number }>;
        for (const [, characteristic] of Object.entries(charRecord)) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: characteristic has legacy fields (base, starting, advances) not in WH40KCharacteristic type; cast is necessary
            const charAny = characteristic as unknown as Record<string, unknown>;
            const base = Number(charAny['base'] ?? charAny['starting'] ?? 0);
            const advance = Number(charAny['advance'] ?? charAny['advances'] ?? 0);
            const modifier = Number(charAny['modifier'] ?? 0);
            const unnatural = Number(charAny['unnatural'] ?? 0);

            // Single-sourced through the shared characteristic math (#337); the
            // PC-style advance*5 term is folded in via `extra`.
            const { total, bonus } = computeCharacteristicTotals(base, modifier, unnatural, advance * 5);
            characteristic.total = total;
            characteristic.bonus = bonus;
        }

        const initChar = this.initiative.characteristic;
        if (initChar !== undefined && initChar !== '') {
            const charEntry = this.characteristics[initChar];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: characteristics[key] may be undefined at runtime
            if (charEntry !== undefined) {
                this.initiative.bonus = charEntry.bonus;
            }
        }
    }

    _computeMovement(): void {
        const chars = this.characteristics as Record<string, WH40KCharacteristic> | undefined | null;
        const agility = chars !== undefined && chars !== null ? chars['agility'] : undefined;
        // Skip movement calculation if agility is not available (e.g., for starships)
        if (agility === undefined) return;
        const size = this.size;
        // Single-sourced through the shared movement math (#337); the floors
        // (1/2/3/6 minimums) were missing from this copy and the helper restores
        // them — these actor types (NPC / Vehicle / Starship) take the floors.
        this.system.movement = computeMovement(agility.bonus, size, true);
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: return type is unknown because the characteristic object shape varies by actor type
    _findCharacteristic(short: string): unknown {
        for (const characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    async addSpecialitySkill(skill: string, speciality: string): Promise<void> {
        const parent = this.system.skills[skill];
        const specialityKey = toCamelCase(speciality);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: skills[key] may be undefined; null check is for runtime safety
        if (parent === undefined || parent === null) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`Skill not specified -- unexpected error.`);
            return;
        }

        const entries = Array.isArray(parent.entries) ? [...parent.entries] : [];

        if (
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- entry.name may be undefined per noUncheckedIndexedAccess; check is intentional
            entries.some((entry) => (entry.name !== undefined ? entry.name.toLowerCase() === speciality.toLowerCase() : false) || entry.slug === specialityKey)
        ) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: hardcoded fallback; i18n key migration tracked separately
            ui.notifications.warn(`Speciality already exists. Unable to create.`);
            return;
        }

        const isAdvanced = parent.advanced;
        entries.push({
            name: speciality,
            slug: specialityKey,
            characteristic: parent.characteristic,
            advanced: isAdvanced,
            basic: !isAdvanced,
            trained: false,
            plus10: false,
            plus20: false,
            bonus: 0,
            notes: '',
            cost: 0,
            current: 0,
        });

        await this.update({
            [`system.skills.${skill}.entries`]: entries,
        });
    }

    /* -------------------------------------------- */
    /*  Stat Breakdown System                       */
    /* -------------------------------------------- */

    /**
     * Get a breakdown of a stat showing base value and all modifiers.
     * Used by StatBreakdownMixin to display detailed stat calculations.
     * @param {string} statKey - The stat to break down (characteristic name, skill name, etc.)
     * @returns {Object|null} Breakdown object or null if stat not found
     */
    getStatBreakdown(statKey: string): WH40KStatBreakdown | null {
        // Try characteristic
        /* eslint-disable no-restricted-syntax -- boundary: system fields accessed via index; cast to Record<string, unknown> is necessary for dynamic stat lookup */
        const sysChars = (this.system as Record<string, unknown>)['characteristics'] as Record<string, unknown> | undefined;
        /* eslint-enable no-restricted-syntax */
        const characteristic = sysChars !== undefined ? sysChars[statKey] : undefined;
        if (characteristic !== undefined && characteristic !== null) {
            return this.#getCharacteristicBreakdown(statKey, characteristic as CharacteristicLike);
        }

        // Try skill
        /* eslint-disable no-restricted-syntax -- boundary: system fields accessed via index; cast to Record<string, unknown> is necessary for dynamic stat lookup */
        const sysSkills = (this.system as Record<string, unknown>)['skills'] as Record<string, unknown> | undefined;
        /* eslint-enable no-restricted-syntax */
        const skill = sysSkills !== undefined ? sysSkills[statKey] : undefined;
        if (skill !== undefined && skill !== null) {
            return this.#getSkillBreakdown(statKey, skill as SkillLike);
        }

        // Try derived stats (wounds, initiative, etc.)
        if (statKey === 'wounds') {
            return this.#getWoundsBreakdown();
        }
        if (statKey === 'initiative') {
            return this.#getInitiativeBreakdown();
        }
        if (statKey === 'fate') {
            return this.#getFateBreakdown();
        }

        // Armour locations
        if (statKey.startsWith('armour.')) {
            const location = statKey.split('.')[1];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: split result element may be undefined
            if (location === undefined) return null;
            return this.#getArmourBreakdown(location);
        }

        return null;
    }

    /**
     * Get breakdown for a characteristic
     * @param {string} charKey - Characteristic key
     * @param {Object} characteristic - Characteristic data
     * @returns {Object} Breakdown object
     * @private
     */
    #getCharacteristicBreakdown(charKey: string, characteristic: CharacteristicLike): WH40KStatBreakdown {
        // eslint-disable-next-line no-restricted-syntax -- boundary: CharacteristicLike has legacy fields (base, starting, advances) accessed via index
        const charAny = characteristic as Record<string, unknown>;
        const base = Number(charAny['base'] ?? charAny['starting'] ?? 0);
        const advance = Number(charAny['advance'] ?? charAny['advances'] ?? 0);
        const modifierValue = Number(charAny['modifier'] ?? 0);

        const breakdown: WH40KStatBreakdown = {
            label: characteristic.label !== '' ? characteristic.label : charKey.toUpperCase(),
            base,
            modifiers: [],
            total: Number(characteristic.total),
        };

        // Add advances
        if (advance > 0) {
            breakdown.modifiers.push({
                source: `Advances (${advance})`,
                value: advance * 5,
                icon: 'fa-solid fa-arrow-up',
            });
        }

        // Add modifier from items/effects
        if (modifierValue !== 0) {
            // Collect modifiers from items
            this.#collectCharacteristicModifiers(charKey, breakdown.modifiers);
        }

        return breakdown;
    }

    /**
     * Get breakdown for a skill
     * @param {string} skillKey - Skill key
     * @param {Object} skill - Skill data
     * @returns {Object} Breakdown object
     * @private
     */
    #getSkillBreakdown(skillKey: string, skill: SkillLike): WH40KStatBreakdown {
        const charShort = skill.characteristic;
        const characteristic = this._findCharacteristic(charShort) as { total?: number };
        const baseTarget = Number(characteristic.total ?? 0);

        const breakdown: WH40KStatBreakdown = {
            label: skill.label !== undefined && skill.label !== '' ? skill.label : skillKey,
            base: baseTarget,
            modifiers: [],
            total: Number(skill.current !== 0 ? skill.current : baseTarget),
        };

        // Add training modifiers
        if (skill.trained) {
            breakdown.modifiers.push({
                source: 'Trained',
                value: skill.advanced ? 20 : 0, // Advanced skills get +20 when trained (removes -20 penalty)
                icon: 'fa-solid fa-graduation-cap',
            });
        } else if (skill.advanced) {
            breakdown.modifiers.push({
                source: 'Untrained (Advanced)',
                value: -20,
                icon: 'fa-solid fa-ban',
            });
        }

        if (skill.plus10) {
            breakdown.modifiers.push({
                source: '+10 Training',
                value: 10,
                icon: 'fa-solid fa-star',
            });
        }

        if (skill.plus20) {
            breakdown.modifiers.push({
                source: '+20 Training',
                value: 20,
                icon: 'fa-solid fa-star',
            });
        }

        // Add skill bonus
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- skill.bonus may be undefined per noUncheckedIndexedAccess on SkillLike
        if (skill.bonus !== 0 && skill.bonus !== undefined) {
            this.#collectSkillModifiers(skillKey, breakdown.modifiers);
        }

        return breakdown;
    }

    /**
     * Get breakdown for wounds
     * @returns {Object} Breakdown object
     * @private
     */
    #getWoundsBreakdown(): WH40KStatBreakdown {
        const wounds = this.system.wounds;
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics accessed via index on untyped system; cast is necessary for dynamic breakdown lookup
        const sysChars = (this.system as Record<string, unknown>)['characteristics'] as Record<string, WH40KCharacteristic> | undefined;
        const toughness = sysChars !== undefined ? sysChars['toughness'] : undefined;
        const strength = sysChars !== undefined ? sysChars['strength'] : undefined;
        const willpower = sysChars !== undefined ? sysChars['willpower'] : undefined;

        const breakdown: WH40KStatBreakdown = {
            label: 'Wounds',
            base: 0,
            modifiers: [],
            total: wounds.max,
        };

        // Base calculation varies by actor type, but typically TB + 2xSB + 2xWPB for characters
        if (toughness !== undefined) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: toughness.bonus,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (strength !== undefined) {
            breakdown.modifiers.push({
                source: 'Strength Bonus ×2',
                value: strength.bonus * 2,
                icon: 'fa-solid fa-dumbbell',
            });
        }

        if (willpower !== undefined) {
            breakdown.modifiers.push({
                source: 'Willpower Bonus ×2',
                value: willpower.bonus * 2,
                icon: 'fa-solid fa-brain',
            });
        }

        // Collect modifiers from talents/traits
        this.#collectWoundsModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for initiative
     * @returns {Object} Breakdown object
     * @private
     */
    #getInitiativeBreakdown(): WH40KStatBreakdown {
        const initiative = this.system.initiative;
        // eslint-disable-next-line no-restricted-syntax -- boundary: characteristics accessed via index on untyped system; cast is necessary for dynamic breakdown lookup
        const sysCharsI = (this.system as Record<string, unknown>)['characteristics'] as Record<string, WH40KCharacteristic> | undefined;
        const agility = sysCharsI !== undefined ? sysCharsI['agility'] : undefined;

        const breakdown: WH40KStatBreakdown = {
            label: 'Initiative',
            base: agility !== undefined ? agility.bonus : 0,
            modifiers: [],
            total: initiative.bonus,
        };

        // Collect modifiers from items
        this.#collectInitiativeModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for fate points
     * @returns {Object} Breakdown object
     * @private
     */
    #getFateBreakdown(): WH40KStatBreakdown {
        /* eslint-disable no-restricted-syntax -- boundary: fate and totalFateModifier are system fields accessed via index; cast is necessary for dynamic breakdown */
        const fate = (this.system as Record<string, unknown>)['fate'] as { rolled?: boolean; max?: number } | undefined | null;

        if (fate === undefined || fate === null) {
            return { label: 'Fate Points', base: 0, modifiers: [], total: 0 };
        }

        const totalFateMod = (this.system as Record<string, unknown>)['totalFateModifier'] as number | undefined;
        /* eslint-enable no-restricted-syntax */
        const breakdown: WH40KStatBreakdown = {
            label: 'Fate Points',
            base: fate.rolled === true ? (fate.max ?? 0) - (totalFateMod ?? 0) : 0,
            modifiers: [],
            total: fate.max ?? 0,
        };

        if (fate.rolled === true) {
            breakdown.modifiers.push({
                source: 'Rolled Value',
                value: breakdown.base,
                icon: 'fa-solid fa-dice',
            });
        }

        // Collect modifiers from items
        this.#collectFateModifiers(breakdown.modifiers);

        return breakdown;
    }

    /**
     * Get breakdown for armour at a specific location
     * @param {string} location - Body location (head, body, leftArm, etc.)
     * @returns {Object} Breakdown object
     * @private
     */
    #getArmourBreakdown(location: string): WH40KStatBreakdown | null {
        // eslint-disable-next-line no-restricted-syntax -- boundary: armour is a system field accessed via index; cast is necessary for dynamic breakdown
        const sysArmour = (this.system as Record<string, unknown>)['armour'] as
            | Record<string, { value?: number; total?: number; toughnessBonus?: number; traitBonus?: number }>
            | undefined;
        const armour = sysArmour !== undefined ? sysArmour[location] : undefined;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: sysArmour[location] may be undefined; null check for runtime safety
        if (armour === undefined || armour === null) return null;

        const breakdown: WH40KStatBreakdown = {
            label: `Armour (${location})`,
            base: 0,
            modifiers: [],
            total: armour.value ?? 0,
        };

        const total = armour.total ?? 0;
        const toughnessBonus = armour.toughnessBonus ?? 0;
        const traitBonus = armour.traitBonus ?? 0;

        if (total > 0) {
            breakdown.modifiers.push({
                source: 'Equipped Armour',
                value: total,
                icon: 'fa-solid fa-vest',
            });
        }

        if (toughnessBonus > 0) {
            breakdown.modifiers.push({
                source: 'Toughness Bonus',
                value: toughnessBonus,
                icon: 'fa-solid fa-shield-halved',
            });
        }

        if (traitBonus > 0) {
            breakdown.modifiers.push({
                source: 'Trait Bonuses',
                value: traitBonus,
                icon: 'fa-solid fa-bolt',
            });
        }

        return breakdown;
    }

    /**
     * Walk owned items, pick a single modifier value per item via `pick`, and
     * push a breakdown entry for every non-zero result. The four per-stat
     * collectors below differ only in the pick function.
     * @private
     */
    #collectItemModifiers(modifiersArray: WH40KModifierEntry[], pick: (modifiers: ItemModifierCarrier['system']['modifiers']) => number | undefined): void {
        for (const item of [...this.items] as ItemModifierCarrier[]) {
            const value = pick(item.system.modifiers);
            if (value !== undefined && value !== 0) {
                modifiersArray.push({
                    source: item.name,
                    value: value,
                    uuid: item.uuid,
                    icon: this.#getItemIcon(item),
                });
            }
        }
    }

    /**
     * Collect characteristic modifiers from items
     * @param {string} charKey - Characteristic key
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectCharacteristicModifiers(charKey: string, modifiersArray: WH40KModifierEntry[]): void {
        this.#collectItemModifiers(modifiersArray, (m) => m?.characteristics?.[charKey]);
    }

    /**
     * Collect skill modifiers from items
     * @param {string} skillKey - Skill key
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectSkillModifiers(skillKey: string, modifiersArray: WH40KModifierEntry[]): void {
        this.#collectItemModifiers(modifiersArray, (m) => m?.skills?.[skillKey]);
    }

    /**
     * Collect wounds modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectWoundsModifiers(modifiersArray: WH40KModifierEntry[]): void {
        this.#collectItemModifiers(modifiersArray, (m) => m?.other?.find((x) => x.key === 'wounds' || x.key === 'wounds.max')?.value);
    }

    /**
     * Collect initiative modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectInitiativeModifiers(modifiersArray: WH40KModifierEntry[]): void {
        this.#collectItemModifiers(modifiersArray, (m) => m?.other?.find((x) => x.key === 'initiative')?.value);
    }

    /**
     * Collect fate modifiers from items
     * @param {Array} modifiersArray - Array to push modifiers to
     * @private
     */
    #collectFateModifiers(modifiersArray: WH40KModifierEntry[]): void {
        // eslint-disable-next-line no-restricted-syntax -- boundary: totalFateModifier is a system extension that may be undefined; ?? 0 is necessary here, not a DataModel schema gap
        const totalMod = this.system.totalFateModifier ?? 0;
        if (totalMod !== 0) {
            modifiersArray.push({
                source: 'Talents & Traits',
                value: totalMod,
                icon: 'fa-solid fa-sparkles',
            });
        }
    }

    /**
     * Get appropriate icon for an item type
     * @param {Item} item - The item
     * @returns {string} Font Awesome icon class
     * @private
     */
    #getItemIcon(item: WH40KItem): string {
        const iconMap: Record<string, string> = {
            talent: 'fa-solid fa-star',
            trait: 'fa-solid fa-dna',
            condition: 'fa-solid fa-circle-exclamation',
            weapon: 'fa-solid fa-gun',
            armour: 'fa-solid fa-vest',
            gear: 'fa-solid fa-box',
        };
        return iconMap[item.type] ?? 'fa-solid fa-circle';
    }
}
