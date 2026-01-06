import { toggleUIExpanded } from '../../rules/config.mjs';
import { ActorContainerSheet } from './actor-container-sheet.mjs';
import { DHBasicActionManager } from '../../actions/basic-action-manager.mjs';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.mjs';
import { Hit } from '../../rolls/damage-data.mjs';
import { AssignDamageData } from '../../rolls/assign-damage-data.mjs';
import { prepareAssignDamageRoll } from '../../prompts/assign-damage-prompt.mjs';

export class AcolyteSheet extends ActorContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 1050,
            height: 800,
            resizable: true,
            tabs: [{ navSelector: '.rt-navigation', contentSelector: '.rt-body', initial: 'overview' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/actor/actor-rt-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.dh = CONFIG.rt;
        context.effects = this.actor.getEmbeddedCollection('ActiveEffect').contents;
        const skills = Object.entries(this.actor.skills ?? {});
        const visibleSkills = skills.filter(([, data]) => !data.hidden);
        const getSkillLabel = (key, data) => {
            if (data?.label) return String(data.label);
            if (data?.name) return String(data.name);
            if (key) return String(key);
            return '';
        };
        visibleSkills.sort((a, b) => {
            const labelA = getSkillLabel(a[0], a[1]);
            const labelB = getSkillLabel(b[0], b[1]);
            return labelA.localeCompare(labelB);
        });
        const trainingLevel = (skill) => {
            if (skill.plus20) return 3;
            if (skill.plus10) return 2;
            if (skill.trained) return 1;
            return 0;
        };
        context.skillLists = {
            standard: visibleSkills.filter(([, data]) => !Array.isArray(data.entries)),
            specialist: visibleSkills.filter(([, data]) => Array.isArray(data.entries)),
        };
        const characteristicShorts = {};
        Object.entries(this.actor.characteristics ?? {}).forEach(([key, value]) => {
            if (value?.short) characteristicShorts[key] = value.short;
        });
        const trainingBonus = (level) => {
            if (level === 3) return 20;
            if (level === 2) return 10;
            return 0;
        };
        const trainingLabel = (skill) => {
            if (skill.plus20) return 'Plus 20';
            if (skill.plus10) return 'Plus 10';
            if (skill.trained) return 'Trained';
            return 'Untrained (Half)';
        };
        context.skillLists.standard.forEach(([, data]) => {
            data.trainingLevel = trainingLevel(data);
            data.charShort = characteristicShorts[data.characteristic] ?? data.characteristic ?? '';
            const baseTotal = this.actor.characteristics?.[data.characteristic]?.total ?? 0;
            const level = trainingLevel(data);
            const baseValue = level > 0 ? baseTotal : Math.floor(baseTotal / 2);
            const bonus = Number(data.bonus ?? 0);
            const itemMod = Number(data.itemModifier ?? 0);
            const trainValue = trainingBonus(level);
            data.breakdown = `Base ${baseValue} + ${trainingLabel(data)} ${trainValue} + Bonus ${bonus} + Items ${itemMod}`;
        });
        const standardSkills = context.skillLists.standard;
        const splitIndex = Math.ceil(standardSkills.length / 2);
        context.skillLists.standardColumns = [
            standardSkills.slice(0, splitIndex),
            standardSkills.slice(splitIndex),
        ];
        context.skillLists.specialist.forEach(([, data]) => {
            data.entries?.forEach((entry) => {
                entry.trainingLevel = trainingLevel(entry);
            });
        });
        context.skillCharacteristicOptions = Object.values(this.actor.characteristics ?? {}).map((c) => ({
            label: c.short,
            value: c.short,
        }));
        context.skillTrainingOptions = {
            none: game.i18n.localize('RT.Skills.Untrained'),
            basic: game.i18n.localize('RT.Skills.Basic'),
            trained: game.i18n.localize('RT.Skills.Trained'),
            plus10: game.i18n.localize('RT.Skills.Plus10'),
            plus20: game.i18n.localize('RT.Skills.Plus20'),
        };
        const hudCharacteristics = context.actor?.characteristics ?? {};
        Object.values(hudCharacteristics).forEach((char) => {
            const total = Number(char?.total ?? 0);
            char.hudMod = Math.floor(total / 10);
            char.hudTotal = total;
        });
        if (context.system) {
            context.system.rogueTrader = this._prepareRogueTraderFields(context.system.rogueTrader ?? {});
        }

        // Prepare origin path data for the template
        context.originPathSteps = this._prepareOriginPathSteps();
        
        // Prepare navigator powers and ship roles
        context.navigatorPowers = this.actor.items.filter((item) => item.type === 'navigatorPower' || item.isNavigatorPower);
        context.shipRoles = this.actor.items.filter((item) => item.type === 'shipRole' || item.isShipRole);

        // Prepare loadout/equipment data
        this._prepareLoadoutData(context);
        
        // Prepare combat station data
        this._prepareCombatData(context);

        return context;
    }

    /**
      * Prepares origin path step data for the template.
      * Maps each step to its selected item (if any).
      */
    _prepareOriginPathSteps() {
        const steps = CONFIG.rt.originPath?.steps || [
            { key: 'homeWorld', label: 'Home World', choiceGroup: 'origin.home-world' },
            { key: 'birthright', label: 'Birthright', choiceGroup: 'origin.birthright' },
            { key: 'lureOfTheVoid', label: 'Lure of the Void', choiceGroup: 'origin.lure-of-the-void' },
            { key: 'trialsAndTravails', label: 'Trials and Travails', choiceGroup: 'origin.trials-and-travails' },
            { key: 'motivation', label: 'Motivation', choiceGroup: 'origin.motivation' },
            { key: 'career', label: 'Career', choiceGroup: 'origin.career' }
        ];

        // Get all origin path items from the actor
        const originItems = this.actor.items.filter((item) => 
            item.isOriginPath || 
            (item.type === 'trait' && item.flags?.rt?.kind === 'origin')
        );

        return steps.map(step => {
            // Find the item matching this step
            const item = originItems.find(i => {
                const itemStep = i.flags?.rt?.step || i.system?.step || '';
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

    /**
     * Prepare loadout/equipment data for the template.
     * @param {object} context - The template render context
     */
    _prepareLoadoutData(context) {
        const items = this.actor.items;
        
        // Add all items to context for the Backpack panel
        context.allItems = Array.from(items);
        
        // Filter items by type
        context.armourItems = items.filter(i => i.type === 'armour' || i.isArmour);
        context.forceFieldItems = items.filter(i => i.type === 'forceField' || i.isForceField);
        context.cyberneticItems = items.filter(i => i.type === 'cybernetic' || i.isCybernetic);
        context.gearItems = items.filter(i => i.type === 'gear' || i.isGear);
        context.storageLocations = items.filter(i => i.type === 'storageLocation');
        
        // Equipped items (all types that are equipped)
        context.equippedItems = items.filter(i => i.system?.equipped === true);
        
        // Counts for section headers
        context.armourCount = context.armourItems.length;
        context.forceFieldCount = context.forceFieldItems.length;
        context.cyberneticCount = context.cyberneticItems.length;
        context.gearCount = context.gearItems.length;
        context.equippedCount = context.equippedItems.length;
        
        // Carried items (not in backpack or storage)
        context.carriedItemCount = items.filter(i => {
            const sys = i.system;
            return sys && !sys.inBackpack && !sys.container && 
                   ['armour', 'gear', 'weapon', 'forceField', 'cybernetic', 'ammunition'].includes(i.type);
        }).length;
        
        // Encumbrance percentage for bar
        const enc = this.actor.encumbrance ?? {};
        const encMax = enc.max || 1;
        context.encumbrancePercent = Math.min(100, Math.round((enc.value / encMax) * 100));
        
        // Backpack fill percentage
        const backpackMax = enc.backpack_max || 1;
        context.backpackPercent = Math.min(100, Math.round((enc.backpack_value / backpackMax) * 100));
    }

    /**
     * Prepare combat station data for the template.
     * @param {object} context - The template render context
     */
    _prepareCombatData(context) {
        const items = this.actor.items;
        const weapons = items.filter(i => i.type === 'weapon' || i.isWeapon);
        const system = context.system ?? this.actor.system ?? {};
        
        // Calculate vitals percentages
        const woundsMax = system.wounds?.max || 1;
        context.woundsPercent = Math.min(100, Math.round(((system.wounds?.value ?? 0) / woundsMax) * 100));
        
        const fatigueMax = system.fatigue?.max || 1;
        context.fatiguePercent = Math.min(100, Math.round(((system.fatigue?.value ?? 0) / fatigueMax) * 100));
        
        // Calculate reaction targets (Dodge = Ag, Parry = WS)
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
        context.criticalInjuries = items.filter(i => i.type === 'criticalInjury' || i.isCriticalInjury);
        
        // Force field (first active/equipped one)
        const forceFields = items.filter(i => i.type === 'forceField' || i.isForceField);
        context.forceField = forceFields.find(ff => ff.system?.equipped || ff.system?.activated) || forceFields[0];
        context.hasForceField = !!context.forceField;
        
        // Weapon slots - categorize by class and equipped status
        const equippedWeapons = weapons.filter(w => w.system?.equipped);
        const rangedWeapons = equippedWeapons.filter(w => w.system?.class !== 'Melee');
        const meleeWeapons = equippedWeapons.filter(w => w.system?.class === 'Melee');
        
        // Primary weapon: first equipped ranged, or first equipped melee
        context.primaryWeapon = rangedWeapons[0] || meleeWeapons[0] || weapons.find(w => w.system?.equipped);
        
        // Secondary weapon: second equipped weapon or first melee if primary is ranged
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
        context.sidearm = weapons.find(w => w.system?.class === 'Pistol' && w !== context.primaryWeapon && w !== context.secondaryWeapon);
        
        // Grenades: Thrown class weapons
        context.grenades = weapons.filter(w => w.system?.class === 'Thrown' || w.system?.type === 'grenade');
        
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

    activateListeners(html) {
        super.activateListeners(html);

        const charDetails = html.find('.rt-char-details');
        if (charDetails.length) {
            if (this._charDetailsOpen) {
                charDetails.prop('open', true);
            }
            const persistCharDetailsState = () => {
                this._charDetailsOpen = charDetails.prop('open');
            };
            charDetails.on('toggle', persistCharDetailsState);
            const charInputs = charDetails.find('input[name^="system.characteristics"], select[name^="system.characteristics"]');
            charInputs.on('change', persistCharDetailsState);
        }

        html.find('.roll-characteristic').click(async (ev) => await this._prepareRollCharacteristic(ev));
        html.find('.roll-skill').click(async (ev) => await this._prepareRollSkill(ev));
        html.find('.rt-skill-training-select').change(async (ev) => await this._onSkillTrainingChange(ev));
        html.find('.acolyte-homeWorld').change((ev) => this._onHomeworldChange(ev));
        html.find('.bonus-vocalize').click(async (ev) => await this._onBonusVocalize(ev));

        html.find('.combat-control').click(async (ev) => await this._combatControls(ev));
        html.find('.acquisition-add').click(async (ev) => await this._addAcquisition(ev));
        html.find('.acquisition-remove').click(async (ev) => await this._removeAcquisition(ev));

        // Stat adjustment buttons (arrow, tracker, vital buttons all use same handler)
        html.find('.rt-arrow-btn, .rt-tracker-btn, .rt-vital-btn').click(async (ev) => await this._onStatButtonClick(ev));
        
        // Critical pip clicks
        html.find('.rt-crit-pip').click(async (ev) => await this._onCritPipClick(ev));
        
        // Hit location roll button
        html.find('.rt-hit-location-roll').click(async (ev) => await this._rollHitLocation(ev));
        
        // Loadout Manager actions
        html.find('[data-action="toggleEquip"]').click(async (ev) => await this._onToggleEquip(ev));
        html.find('[data-action="stowItem"]').click(async (ev) => await this._onStowItem(ev));
        html.find('[data-action="unstowItem"]').click(async (ev) => await this._onUnstowItem(ev));
        html.find('[data-action="toggleActivate"]').click(async (ev) => await this._onToggleActivate(ev));
        html.find('.rt-section-collapsible').click((ev) => this._onToggleSection(ev));
        
        // Fatigue max manual override handler
        html.find('input[name="system.fatigue.max"]').change(async (ev) => {
            await this.actor.update({ 'system.fatigue.manualMax': true });
        });
        
        // Note: Skill training buttons (.rt-train-btn) are handled by parent class
    }

    /**
     * Roll a hit location and highlight the result on the armour panel.
     */
    async _rollHitLocation(event) {
        event.preventDefault();
        
        // Roll 1d100 for hit location
        const roll = await new Roll('1d100').evaluate();
        const result = roll.total;
        
        // Determine hit location based on roll
        const locations = [
            { name: 'Head', min: 1, max: 10, key: 'head' },
            { name: 'Right Arm', min: 11, max: 20, key: 'rightArm' },
            { name: 'Left Arm', min: 21, max: 30, key: 'leftArm' },
            { name: 'Body', min: 31, max: 70, key: 'body' },
            { name: 'Right Leg', min: 71, max: 85, key: 'rightLeg' },
            { name: 'Left Leg', min: 86, max: 100, key: 'leftLeg' }
        ];
        
        const hitLocation = locations.find(loc => result >= loc.min && result <= loc.max);
        const armourValue = this.actor.system.armour?.[hitLocation.key]?.total ?? 0;
        
        // Create chat message with result
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
            content: content,
            rolls: [roll],
            type: CONST.CHAT_MESSAGE_STYLES.ROLL
        });
        
        // Flash highlight the hit location on the sheet
        const locationSlot = this.element.find(`[data-location="${hitLocation.key}"]`);
        if (locationSlot.length) {
            locationSlot.addClass('rt-hit-location-highlight');
            setTimeout(() => locationSlot.removeClass('rt-hit-location-highlight'), 2000);
        }
    }

    /**
     * Handle stat adjustment button clicks for increment/decrement.
     * Works for arrow buttons, tracker buttons, and vital buttons.
     */
    async _onStatButtonClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const field = button.dataset.field;
        const action = button.dataset.action;
        const min = button.dataset.min !== undefined ? parseInt(button.dataset.min) : null;
        const max = button.dataset.max !== undefined ? parseInt(button.dataset.max) : null;
        
        // Get current value using foundry's getProperty
        const currentValue = foundry.utils.getProperty(this.actor, field) || 0;
        let newValue = currentValue;
        
        if (action === 'increment') {
            newValue = currentValue + 1;
            if (max !== null && newValue > max) newValue = max;
        } else if (action === 'decrement') {
            newValue = currentValue - 1;
            if (min !== null && newValue < min) newValue = min;
        }
        
        // Only update if value changed
        if (newValue !== currentValue) {
            await this.actor.update({ [field]: newValue });
        }
    }

    /**
     * Handle clicking on a critical damage pip
     */
    async _onCritPipClick(event) {
        event.preventDefault();
        const pip = event.currentTarget;
        const level = parseInt(pip.dataset.critLevel);
        const currentCrit = this.actor.system.wounds?.critical || 0;
        
        // If clicking on a filled pip at the current level, reduce by 1
        // Otherwise set to the clicked level
        const newValue = (level === currentCrit) ? level - 1 : level;
        const clampedValue = Math.min(Math.max(newValue, 0), 10);
        
        await this.actor.update({ 'system.wounds.critical': clampedValue });
    }

    async _combatControls(event) {
        event.preventDefault();
        const target = event.currentTarget;

        switch(target.dataset.action) {
            case 'attack':
                await DHTargetedActionManager.performWeaponAttack(this.actor);
                break;
            case 'assign-damage':
                const hitData = new Hit();
                const assignData = new AssignDamageData(this.actor, hitData);
                await prepareAssignDamageRoll(assignData);
                break;
            case 'dodge':
                await this.actor.rollSkill('dodge');
                break;
            case 'parry':
                await this.actor.rollSkill('parry');
                break;
            case 'initiative':
                await this._rollInitiative();
                break;
        }
    }

    /**
     * Roll initiative for this character.
     */
    async _rollInitiative() {
        const agBonus = this.actor.characteristics?.agility?.bonus ?? 0;
        const roll = await new Roll('1d10 + @ab', { ab: agBonus }).evaluate();
        
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

    async _onBonusVocalize(event) {
        event.preventDefault();
        const element = event.currentTarget;
        let bonus = this.actor.backgroundEffects.abilities.find((a) => a.name === element.dataset.bonusName);
        if (bonus) {
            await DHBasicActionManager.sendItemVocalizeChat({
                actor: this.actor.name,
                name: bonus.name,
                type: bonus.source,
                description: bonus.benefit,
            });
        }
    }

    async _prepareRollCharacteristic(event) {
        event.preventDefault();
        const characteristicName = event.currentTarget.dataset.characteristic;
        await this.actor.rollCharacteristic(characteristicName);
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = event.currentTarget.dataset.skill;
        const specialtyName = event.currentTarget.dataset.specialty;
        await this.actor.rollSkill(skillName, specialtyName);
    }

    async _onSkillTrainingChange(event) {
        event.preventDefault();
        const select = event.currentTarget;
        const skillKey = select.dataset.skill;
        const specialty = select.dataset.specialty;
        const level = select.value;
        if (!skillKey) return;

        const basePath = specialty != null
            ? `system.skills.${skillKey}.entries.${specialty}`
            : `system.skills.${skillKey}`;

        const flags = {
            basic: level === 'basic',
            trained: level === 'trained',
            plus10: level === 'plus10',
            plus20: level === 'plus20',
        };

        const updateData = {};
        Object.entries(flags).forEach(([key, value]) => {
            updateData[`${basePath}.${key}`] = value;
        });

        await this.actor.update(updateData);
    }

    _prepareRogueTraderFields(rogueTraderData) {
        const prepared = rogueTraderData ?? {};
        prepared.armour = prepared.armour ?? { head: 0, rightArm: 0, leftArm: 0, body: 0, rightLeg: 0, leftLeg: 0 };
        prepared.weight = prepared.weight ?? { total: 0, current: 0 };

        const acquisitions = Array.isArray(prepared.acquisitions)
            ? prepared.acquisitions
            : (prepared.acquisitions ? [{ name: '', availability: '', modifier: 0, notes: prepared.acquisitions, acquired: false }] : []);
        prepared.acquisitions = acquisitions;
        prepared.wounds = {
            total: this.actor.wounds?.max ?? 0,
            current: this.actor.wounds?.value ?? 0,
            critical: this.actor.wounds?.critical ?? 0,
            fatigue: this.actor.fatigue?.value ?? 0,
        };
        prepared.fate = {
            total: this.actor.fate?.max ?? 0,
            current: this.actor.fate?.value ?? 0,
        };
        return prepared;
    }

    async _addAcquisition(event) {
        event.preventDefault();
        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        const acquisitionList = Array.isArray(acquisitions)
            ? acquisitions
            : (acquisitions ? [{ name: '', availability: '', modifier: 0, notes: acquisitions, acquired: false }] : []);
        const updatedAcquisitions = foundry.utils.duplicate(acquisitionList);
        updatedAcquisitions.push({ name: '', availability: '', modifier: 0, notes: '', acquired: false });
        await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    async _removeAcquisition(event) {
        event.preventDefault();
        const index = Number.parseInt(event.currentTarget.dataset.index ?? '-1');
        if (Number.isNaN(index) || index < 0) return;

        const acquisitions = this.actor.system?.rogueTrader?.acquisitions;
        if (!Array.isArray(acquisitions)) {
            await this.actor.update({ 'system.rogueTrader.acquisitions': [] });
            return;
        }

        const updatedAcquisitions = foundry.utils.duplicate(acquisitions);
        updatedAcquisitions.splice(index, 1);
        await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
    }

    _onHomeworldChange(event) {
        event.preventDefault();
        Dialog.confirm({
            title: 'Roll Characteristics?',
            content: '<p>Would you like to roll Wounds and Fate for this homeworld?</p>',
            yes: async () => {
                // Something is probably wrong -- we will skip this
                if(!this.actor.backgroundEffects?.homeworld) return;

                // Roll Wounds
                let woundRoll = new Roll(this.actor.backgroundEffects.homeworld.wounds);
                await woundRoll.evaluate();
                this.actor.wounds.max = woundRoll.total;

                // Roll Fate
                let fateRoll = new Roll('1d10');
                await fateRoll.evaluate();
                this.actor.fate.max =
                    parseInt(this.actor.backgroundEffects.homeworld.fate_threshold) +
                    (fateRoll.total >= this.actor.backgroundEffects.homeworld.emperors_blessing ? 1 : 0);
                this.render(true);
            },
            no: () => {},
            defaultYes: false,
        });
    }

    /* -------------------------------------------- */
    /*  Loadout Manager Handlers                    */
    /* -------------------------------------------- */

    /**
     * Toggle the equipped state of an item.
     */
    async _onToggleEquip(event) {
        event.preventDefault();
        event.stopPropagation();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        await item.update({ 'system.equipped': !item.system.equipped });
    }

    /**
     * Stow an item in the backpack.
     */
    async _onStowItem(event) {
        event.preventDefault();
        event.stopPropagation();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        await item.update({ 
            'system.equipped': false,
            'system.inBackpack': true 
        });
    }

    /**
     * Remove an item from the backpack.
     */
    async _onUnstowItem(event) {
        event.preventDefault();
        event.stopPropagation();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        await item.update({ 'system.inBackpack': false });
    }

    /**
     * Toggle the activated state of a force field.
     */
    async _onToggleActivate(event) {
        event.preventDefault();
        event.stopPropagation();
        const itemId = event.currentTarget.dataset.itemId;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        await item.update({ 'system.activated': !item.system.activated });
    }

    /**
     * Toggle the collapsed state of a loadout section.
     */
    _onToggleSection(event) {
        const header = event.currentTarget;
        const toggleId = header.dataset.toggle;
        if (!toggleId) return;
        
        const section = header.closest('.rt-loadout-section');
        const list = section?.querySelector(`#${toggleId}`);
        if (list) {
            section.classList.toggle('rt-section-collapsed');
            list.style.display = section.classList.contains('rt-section-collapsed') ? 'none' : '';
        }
    }
}
