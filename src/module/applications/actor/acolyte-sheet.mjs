/**
 * @file AcolyteSheet - Character sheet for acolyte/character actors using ApplicationV2
 * This is the main player character sheet for Rogue Trader
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import { DHBasicActionManager } from "../../actions/basic-action-manager.mjs";
import { DHTargetedActionManager } from "../../actions/targeted-action-manager.mjs";
import { Hit } from "../../rolls/damage-data.mjs";
import { AssignDamageData } from "../../rolls/assign-damage-data.mjs";
import { prepareAssignDamageRoll } from "../../prompts/assign-damage-prompt.mjs";

/**
 * Actor sheet for Acolyte/Character type actors.
 */
export default class AcolyteSheet extends BaseActorSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            // Combat actions
            combatAction: AcolyteSheet.#combatAction,
            rollInitiative: AcolyteSheet.#rollInitiative,
            rollHitLocation: AcolyteSheet.#rollHitLocation,
            
            // Stat adjustment actions
            adjustStat: AcolyteSheet.#adjustStat,
            setCriticalPip: AcolyteSheet.#setCriticalPip,
            setFateStar: AcolyteSheet.#setFateStar,
            setCorruption: AcolyteSheet.#setCorruption,
            setInsanity: AcolyteSheet.#setInsanity,
            restoreFate: AcolyteSheet.#restoreFate,
            spendFate: AcolyteSheet.#spendFate,
            
            // Equipment actions
            toggleEquip: AcolyteSheet.#toggleEquip,
            stowItem: AcolyteSheet.#stowItem,
            unstowItem: AcolyteSheet.#unstowItem,
            toggleActivate: AcolyteSheet.#toggleActivate,
            
            // Acquisition actions
            addAcquisition: AcolyteSheet.#addAcquisition,
            removeAcquisition: AcolyteSheet.#removeAcquisition,
            
            // Misc actions
            bonusVocalize: AcolyteSheet.#bonusVocalize
        },
        classes: ["acolyte"],
        position: {
            width: 1050,
            height: 800
        },
        // Tab configuration - matches existing template
        tabs: [
            { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "overview" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        // Use existing template as single part for initial migration
        // This will be split into proper parts later
        sheet: {
            template: "systems/rogue-trader/templates/actor/actor-rt-sheet.hbs",
            scrollable: [".rt-body"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [];  // Tabs are handled by the template itself for now

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // RT-specific configuration
        context.dh = CONFIG.rt;

        // Prepare characteristic HUD data
        this._prepareCharacteristicHUD(context);

        // Prepare origin path
        context.originPathSteps = this._prepareOriginPathSteps();

        // Prepare navigator powers and ship roles
        context.navigatorPowers = this.actor.items.filter(
            item => item.type === "navigatorPower" || item.isNavigatorPower
        );
        context.shipRoles = this.actor.items.filter(
            item => item.type === "shipRole" || item.isShipRole
        );

        // Prepare loadout/equipment data
        this._prepareLoadoutData(context);

        // Prepare combat station data
        this._prepareCombatData(context);

        // Prepare Rogue Trader specific fields
        if (context.system) {
            context.system.rogueTrader = this._prepareRogueTraderFields(
                context.system.rogueTrader ?? {}
            );
        }

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare characteristic HUD data.
     * @param {object} context  Context being prepared.
     * @protected
     */
    _prepareCharacteristicHUD(context) {
        const hudCharacteristics = context.actor?.characteristics ?? {};
        Object.values(hudCharacteristics).forEach((char) => {
            const total = Number(char?.total ?? 0);
            char.hudMod = Math.floor(total / 10);
            char.hudTotal = total;
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare origin path step data.
     * @returns {Array<object>}
     * @protected
     */
    _prepareOriginPathSteps() {
        const steps = CONFIG.rt.originPath?.steps || [
            { key: "homeWorld", label: "Home World", choiceGroup: "origin.home-world" },
            { key: "birthright", label: "Birthright", choiceGroup: "origin.birthright" },
            { key: "lureOfTheVoid", label: "Lure of the Void", choiceGroup: "origin.lure-of-the-void" },
            { key: "trialsAndTravails", label: "Trials and Travails", choiceGroup: "origin.trials-and-travails" },
            { key: "motivation", label: "Motivation", choiceGroup: "origin.motivation" },
            { key: "career", label: "Career", choiceGroup: "origin.career" }
        ];

        const originItems = this.actor.items.filter(
            item => item.isOriginPath || (item.type === "trait" && item.flags?.rt?.kind === "origin")
        );

        return steps.map(step => {
            const item = originItems.find(i => {
                const itemStep = i.flags?.rt?.step || i.system?.step || "";
                return itemStep === step.label || i.flags?.rt?.choiceGroup === step.choiceGroup;
            });

            return {
                ...step,
                item: item ? {
                    _id: item.id,
                    name: item.name,
                    img: item.img,
                    system: item.system
                } : null
            };
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare loadout/equipment data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    _prepareLoadoutData(context) {
        const items = this.actor.items;

        // Add all items to context for the Backpack panel
        context.allItems = Array.from(items);

        // Filter items by type
        context.armourItems = items.filter(i => i.type === "armour" || i.isArmour);
        context.forceFieldItems = items.filter(i => i.type === "forceField" || i.isForceField);
        context.cyberneticItems = items.filter(i => i.type === "cybernetic" || i.isCybernetic);
        context.gearItems = items.filter(i => i.type === "gear" || i.isGear);
        context.storageLocations = items.filter(i => i.type === "storageLocation");

        // Equipped items (all types that are equipped)
        context.equippedItems = items.filter(i => i.system?.equipped === true);

        // Counts for section headers
        context.armourCount = context.armourItems.length;
        context.forceFieldCount = context.forceFieldItems.length;
        context.cyberneticCount = context.cyberneticItems.length;
        context.gearCount = context.gearItems.length;
        context.equippedCount = context.equippedItems.length;

        // Encumbrance percentage for bar
        const enc = this.actor.encumbrance ?? {};
        const encMax = enc.max || 1;
        context.encumbrancePercent = Math.min(100, Math.round((enc.value / encMax) * 100));

        // Backpack fill percentage
        const backpackMax = enc.backpack_max || 1;
        context.backpackPercent = Math.min(100, Math.round((enc.backpack_value / backpackMax) * 100));
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat station data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    _prepareCombatData(context) {
        const items = this.actor.items;
        const weapons = items.filter(i => i.type === "weapon" || i.isWeapon);
        const system = context.system ?? this.actor.system ?? {};

        // Calculate vitals percentages
        const woundsMax = system.wounds?.max || 1;
        context.woundsPercent = Math.min(100, Math.round(((system.wounds?.value ?? 0) / woundsMax) * 100));

        const fatigueMax = system.fatigue?.max || 1;
        context.fatiguePercent = Math.min(100, Math.round(((system.fatigue?.value ?? 0) / fatigueMax) * 100));

        // Calculate reaction targets
        const skills = this.actor.skills ?? {};
        const chars = this.actor.characteristics ?? {};

        // Dodge target: Ag + Dodge training
        const dodgeSkill = skills.dodge ?? {};
        let dodgeBase = chars.agility?.total ?? 30;
        if (dodgeSkill.plus20) dodgeBase += 20;
        else if (dodgeSkill.plus10) dodgeBase += 10;
        else if (!dodgeSkill.trained && !dodgeSkill.basic) dodgeBase = Math.floor(dodgeBase / 2);
        context.dodgeTarget = dodgeBase;

        // Parry target: WS + Parry training
        const parrySkill = skills.parry ?? {};
        let parryBase = chars.weaponSkill?.total ?? 30;
        if (parrySkill.plus20) parryBase += 20;
        else if (parrySkill.plus10) parryBase += 10;
        else if (!parrySkill.trained && !parrySkill.basic) parryBase = Math.floor(parryBase / 2);
        context.parryTarget = parryBase;

        // Critical injuries
        context.criticalInjuries = items.filter(i => i.type === "criticalInjury" || i.isCriticalInjury);

        // Force field (first active/equipped one)
        const forceFields = items.filter(i => i.type === "forceField" || i.isForceField);
        context.forceField = forceFields.find(ff => ff.system?.equipped || ff.system?.activated) || forceFields[0];
        context.hasForceField = !!context.forceField;

        // Weapon slots - categorize by class and equipped status
        const equippedWeapons = weapons.filter(w => w.system?.equipped);
        const rangedWeapons = equippedWeapons.filter(w => w.system?.class !== "Melee");
        const meleeWeapons = equippedWeapons.filter(w => w.system?.class === "Melee");

        // Primary weapon
        context.primaryWeapon = rangedWeapons[0] || meleeWeapons[0] || weapons.find(w => w.system?.equipped);

        // Secondary weapon
        if (context.primaryWeapon) {
            if (rangedWeapons[0] && meleeWeapons[0]) {
                context.secondaryWeapon = meleeWeapons[0];
            } else if (rangedWeapons.length > 1) {
                context.secondaryWeapon = rangedWeapons[1];
            } else if (meleeWeapons.length > 1) {
                context.secondaryWeapon = meleeWeapons[1];
            }
        }

        // Sidearm: Pistol class weapon
        context.sidearm = weapons.find(
            w => w.system?.class === "Pistol" && w !== context.primaryWeapon && w !== context.secondaryWeapon
        );

        // Grenades: Thrown class weapons
        context.grenades = weapons.filter(w => w.system?.class === "Thrown" || w.system?.type === "grenade");

        // Other weapons (not in slots)
        const slotWeapons = [context.primaryWeapon, context.secondaryWeapon, context.sidearm, ...context.grenades].filter(Boolean);
        context.otherWeapons = weapons.filter(w => !slotWeapons.includes(w));

        // Add ammo percentage to weapons
        [context.primaryWeapon, context.secondaryWeapon, context.sidearm].filter(Boolean).forEach(w => {
            if (w.system?.clip?.max) {
                w.ammoPercent = Math.round((w.system.clip.value / w.system.clip.max) * 100);
            }
        });
    }

    /* -------------------------------------------- */

    /**
     * Prepare Rogue Trader specific fields.
     * @param {object} rogueTraderData  The rogueTrader data object.
     * @returns {object}
     * @protected
     */
    _prepareRogueTraderFields(rogueTraderData) {
        const prepared = rogueTraderData ?? {};
        prepared.armour = prepared.armour ?? {
            head: 0, rightArm: 0, leftArm: 0, body: 0, rightLeg: 0, leftLeg: 0
        };
        prepared.weight = prepared.weight ?? { total: 0, current: 0 };

        const acquisitions = Array.isArray(prepared.acquisitions)
            ? prepared.acquisitions
            : (prepared.acquisitions
                ? [{ name: "", availability: "", modifier: 0, notes: prepared.acquisitions, acquired: false }]
                : []);
        prepared.acquisitions = acquisitions;

        prepared.wounds = {
            total: this.actor.wounds?.max ?? 0,
            current: this.actor.wounds?.value ?? 0,
            critical: this.actor.wounds?.critical ?? 0,
            fatigue: this.actor.fatigue?.value ?? 0
        };
        prepared.fate = {
            total: this.actor.fate?.max ?? 0,
            current: this.actor.fate?.value ?? 0
        };

        return prepared;
    }

    /* -------------------------------------------- */

    /**
     * Prepare overview tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareOverviewContext(context, options) {
        // Overview tab already has most data from main context
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare combat tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareCombatTabContext(context, options) {
        // Combat data already prepared in _prepareCombatData
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare equipment tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareEquipmentContext(context, options) {
        // Equipment data already prepared in _prepareLoadoutData
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare abilities tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareAbilitiesContext(context, options) {
        // Talents and traits already prepared in _prepareItems
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare notes tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareNotesContext(context, options) {
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare effects tab context.
     * @param {object} context  Context being prepared.
     * @param {object} options  Render options.
     * @returns {object}
     * @protected
     */
    async _prepareEffectsContext(context, options) {
        return context;
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Combat Actions             */
    /* -------------------------------------------- */

    /**
     * Handle combat control actions.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #combatAction(event, target) {
        const action = target.dataset.combatAction;

        switch (action) {
            case "attack":
                await DHTargetedActionManager.performWeaponAttack(this.actor);
                break;
            case "assign-damage":
                const hitData = new Hit();
                const assignData = new AssignDamageData(this.actor, hitData);
                await prepareAssignDamageRoll(assignData);
                break;
            case "dodge":
                await this.actor.rollSkill?.("dodge");
                break;
            case "parry":
                await this.actor.rollSkill?.("parry");
                break;
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle initiative roll.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(event, target) {
        const agBonus = this.actor.characteristics?.agility?.bonus ?? 0;
        const roll = await new Roll("1d10 + @ab", { ab: agBonus }).evaluate();

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="rt-initiative-roll">
                    <h3><i class="fas fa-bolt"></i> Initiative Roll</h3>
                    <div class="rt-roll-formula">1d10 + ${agBonus} (Ag Bonus)</div>
                    <div class="rt-roll-result">${roll.total}</div>
                </div>
            `,
            rolls: [roll],
            type: CONST.CHAT_MESSAGE_STYLES.ROLL
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle hit location roll.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollHitLocation(event, target) {
        const roll = await new Roll("1d100").evaluate();
        const result = roll.total;

        const locations = [
            { name: "Head", min: 1, max: 10, key: "head" },
            { name: "Right Arm", min: 11, max: 20, key: "rightArm" },
            { name: "Left Arm", min: 21, max: 30, key: "leftArm" },
            { name: "Body", min: 31, max: 70, key: "body" },
            { name: "Right Leg", min: 71, max: 85, key: "rightLeg" },
            { name: "Left Leg", min: 86, max: 100, key: "leftLeg" }
        ];

        const hitLocation = locations.find(loc => result >= loc.min && result <= loc.max);
        const armourValue = this.actor.system.armour?.[hitLocation.key]?.total ?? 0;

        const content = `
            <div class="rt-hit-location-result">
                <h3><i class="fas fa-crosshairs"></i> Hit Location Roll</h3>
                <div class="rt-hit-roll">
                    <span class="rt-roll-result">${result}</span>
                </div>
                <div class="rt-hit-location">
                    <span class="rt-location-name">${hitLocation.name}</span>
                    <span class="rt-location-armour">Armour: ${armourValue}</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content,
            rolls: [roll],
            type: CONST.CHAT_MESSAGE_STYLES.ROLL
        });

        // Flash highlight the hit location on the sheet
        const locationSlot = this.element.querySelector(`[data-location="${hitLocation.key}"]`);
        if (locationSlot) {
            locationSlot.classList.add("rt-hit-location-highlight");
            setTimeout(() => locationSlot.classList.remove("rt-hit-location-highlight"), 2000);
        }
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Stat Adjustments           */
    /* -------------------------------------------- */

    /**
     * Handle stat adjustment button clicks.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #adjustStat(event, target) {
        const field = target.dataset.field;
        const action = target.dataset.statAction;
        const min = target.dataset.min !== undefined ? parseInt(target.dataset.min) : null;
        const max = target.dataset.max !== undefined ? parseInt(target.dataset.max) : null;

        // Handle special actions
        if (action === "clear-fatigue") {
            await this.actor.update({ "system.fatigue.value": 0 });
            return;
        }

        // Get current value
        const currentValue = foundry.utils.getProperty(this.actor, field) || 0;
        let newValue = currentValue;

        if (action === "increment") {
            newValue = currentValue + 1;
            if (max !== null && newValue > max) newValue = max;
        } else if (action === "decrement") {
            newValue = currentValue - 1;
            if (min !== null && newValue < min) newValue = min;
        }

        if (newValue !== currentValue) {
            await this.actor.update({ [field]: newValue });
        }
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a critical damage pip.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCriticalPip(event, target) {
        const level = parseInt(target.dataset.critLevel);
        const currentCrit = this.actor.system.wounds?.critical || 0;
        const newValue = (level === currentCrit) ? level - 1 : level;
        const clampedValue = Math.min(Math.max(newValue, 0), 10);
        await this.actor.update({ "system.wounds.critical": clampedValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle clicking on a fate star pip.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setFateStar(event, target) {
        const index = parseInt(target.dataset.fateIndex);
        const currentFate = this.actor.system.fate?.value || 0;
        const newValue = (index === currentFate) ? index - 1 : index;
        const maxFate = this.actor.system.fate?.max || 0;
        const clampedValue = Math.min(Math.max(newValue, 0), maxFate);
        await this.actor.update({ "system.fate.value": clampedValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set corruption.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setCorruption(event, target) {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            ui.notifications.error("Invalid corruption value");
            return;
        }
        await this.actor.update({ "system.corruption": targetValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle quick-set insanity.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #setInsanity(event, target) {
        const targetValue = parseInt(target.dataset.value);
        if (isNaN(targetValue) || targetValue < 0 || targetValue > 100) {
            ui.notifications.error("Invalid insanity value");
            return;
        }
        await this.actor.update({ "system.insanity": targetValue });
    }

    /* -------------------------------------------- */

    /**
     * Handle restoring all fate points.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #restoreFate(event, target) {
        const maxFate = this.actor.system.fate?.max || 0;
        await this.actor.update({ "system.fate.value": maxFate });
        ui.notifications.info(`Restored all fate points to ${maxFate}`);
    }

    /* -------------------------------------------- */

    /**
     * Handle fate spending actions.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #spendFate(event, target) {
        const action = target.dataset.fateAction;
        const currentFate = this.actor.system.fate?.value || 0;

        if (currentFate <= 0) {
            ui.notifications.warn("No fate points available to spend!");
            return;
        }

        let message = "";
        switch (action) {
            case "reroll":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>re-roll</strong> a test!`;
                break;
            case "bonus":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to gain <strong>+10 bonus</strong> to a test!`;
                break;
            case "dos":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to add <strong>+1 Degree of Success</strong>!`;
                break;
            case "heal":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>heal damage</strong>!`;
                break;
            case "avoid":
                message = `<strong>${this.actor.name}</strong> spends a Fate Point to <strong>avoid death</strong>!`;
                break;
            case "burn":
                const confirm = await Dialog.confirm({
                    title: "Burn Fate Point?",
                    content: "<p>Are you sure you want to <strong>permanently burn</strong> a Fate Point?</p>",
                    defaultYes: false
                });
                if (!confirm) return;
                message = `<strong>${this.actor.name}</strong> <strong style="color: #b63a2b;">BURNS</strong> a Fate Point!`;
                await this.actor.update({
                    "system.fate.max": Math.max(0, (this.actor.system.fate?.max || 0) - 1)
                });
                break;
            default:
                return;
        }

        await this.actor.update({ "system.fate.value": currentFate - 1 });

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: `
                <div class="rt-fate-spend-message">
                    <div style="display: flex; align-items: center; gap: 8px; padding: 12px; background: rgba(196, 135, 29, 0.1); border-left: 3px solid #c4871d; border-radius: 4px;">
                        <i class="fas fa-star" style="font-size: 1.5rem; color: #c4871d;"></i>
                        <div>${message}</div>
                    </div>
                </div>
            `
        });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Equipment Actions          */
    /* -------------------------------------------- */

    /**
     * Handle toggling item equipped state.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleEquip(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.equipped": !item.system.equipped });
    }

    /* -------------------------------------------- */

    /**
     * Handle stowing an item.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #stowItem(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({
            "system.equipped": false,
            "system.inBackpack": true
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle unstowing an item.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #unstowItem(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.inBackpack": false });
    }

    /* -------------------------------------------- */

    /**
     * Handle toggling force field activation.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #toggleActivate(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        await item.update({ "system.activated": !item.system.activated });
    }

    /* -------------------------------------------- */
    /*  Event Handlers - Acquisitions               */
    /* -------------------------------------------- */

    /**
     * Handle adding an acquisition.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #addAcquisition(event, target) {
        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        const acquisitionList = Array.isArray(acquisitions) ? acquisitions : [];
        const updatedAcquisitions = foundry.utils.duplicate(acquisitionList);
        updatedAcquisitions.push({ name: "", availability: "", modifier: 0, notes: "", acquired: false });
        await this.actor.update({ "system.rogueTrader.acquisitions": updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Handle removing an acquisition.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #removeAcquisition(event, target) {
        const index = parseInt(target.dataset.index ?? "-1");
        if (isNaN(index) || index < 0) return;

        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        if (!Array.isArray(acquisitions)) {
            await this.actor.update({ "system.rogueTrader.acquisitions": [] });
            return;
        }

        const updatedAcquisitions = foundry.utils.duplicate(acquisitions);
        updatedAcquisitions.splice(index, 1);
        await this.actor.update({ "system.rogueTrader.acquisitions": updatedAcquisitions });
    }

    /* -------------------------------------------- */

    /**
     * Handle bonus vocalize.
     * @this {AcolyteSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #bonusVocalize(event, target) {
        const bonusName = target.dataset.bonusName;
        const bonus = this.actor.backgroundEffects?.abilities?.find(a => a.name === bonusName);
        if (bonus) {
            await DHBasicActionManager.sendItemVocalizeChat({
                actor: this.actor.name,
                name: bonus.name,
                type: bonus.source,
                description: bonus.benefit
            });
        }
    }
}
