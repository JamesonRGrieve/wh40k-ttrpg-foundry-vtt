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
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'overview' }],
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
            if (skill.plus20) return 'plus20';
            if (skill.plus10) return 'plus10';
            if (skill.trained) return 'trained';
            if (skill.basic) return 'basic';
            return 'none';
        };
        context.skillLists = {
            standard: visibleSkills.filter(([, data]) => !Array.isArray(data.entries)),
            specialist: visibleSkills.filter(([, data]) => Array.isArray(data.entries)),
        };
        context.skillLists.standard.forEach(([, data]) => {
            data.trainingLevel = trainingLevel(data);
        });
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
        if (context.system) {
            context.system.rogueTrader = this._prepareRogueTraderFields(context.system.rogueTrader ?? {});
        }

        // Prepare origin path data for the template
        context.originPathSteps = this._prepareOriginPathSteps();
        
        // Prepare navigator powers and ship roles
        context.navigatorPowers = this.actor.items.filter((item) => item.type === 'navigatorPower' || item.isNavigatorPower);
        context.shipRoles = this.actor.items.filter((item) => item.type === 'shipRole' || item.isShipRole);

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

        // Arrow button handlers for quick stat adjustments
        html.find('.rt-arrow-btn').click(async (ev) => await this._onArrowButtonClick(ev));
        html.find('.rt-tracker-btn').click(async (ev) => await this._onTrackerButtonClick(ev));
        
        // Critical pip clicks
        html.find('.rt-crit-pip').click(async (ev) => await this._onCritPipClick(ev));
    }

    /**
     * Handle arrow button clicks for increment/decrement of stat values
     */
    async _onArrowButtonClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const field = button.dataset.field;
        const action = button.dataset.action;
        const min = button.dataset.min !== undefined ? parseInt(button.dataset.min) : null;
        const max = button.dataset.max !== undefined ? parseInt(button.dataset.max) : null;
        
        await this._adjustStatValue(field, action, min, max);
    }

    /**
     * Handle tracker button clicks for increment/decrement
     */
    async _onTrackerButtonClick(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const field = button.dataset.field;
        const action = button.dataset.action;
        const min = button.dataset.min !== undefined ? parseInt(button.dataset.min) : null;
        const max = button.dataset.max !== undefined ? parseInt(button.dataset.max) : null;
        
        await this._adjustStatValue(field, action, min, max);
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

    /**
     * Adjust a stat value by incrementing or decrementing
     */
    async _adjustStatValue(field, action, min, max) {
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

        }
    }

    async _onBonusVocalize(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        let bonus = this.actor.backgroundEffects.abilities.find((a) => a.name === div.data('bonusName'));
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
        const characteristicName = $(event.currentTarget).data('characteristic');
        await this.actor.rollCharacteristic(characteristicName);
    }

    async _prepareRollSkill(event) {
        event.preventDefault();
        const skillName = $(event.currentTarget).data('skill');
        const specialtyName = $(event.currentTarget).data('specialty');
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
}
