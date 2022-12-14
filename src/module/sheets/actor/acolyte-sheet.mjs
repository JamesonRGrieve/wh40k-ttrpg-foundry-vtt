import { toggleUIExpanded } from '../../rules/config.mjs';
import { ActorContainerSheet } from './actor-container-sheet.mjs';
import { DHBasicActionManager } from '../../actions/basic-action-manager.mjs';
import { DHTargetedActionManager } from '../../actions/targeted-action-manager.mjs';
import { Hit } from '../../rolls/damage-data.mjs';
import { AssignDamageData } from '../../rolls/assign-damage-data.mjs';
import { prepareAssignDamageRoll } from '../../prompts/assign-damage-prompt.mjs';

export class AcolyteSheet extends ActorContainerSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 1000,
            height: 750,
            resizable: true,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'main' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/actor/actor-acolyte-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.dh = CONFIG.dh;
        context.effects = this.actor.getEmbeddedCollection('ActiveEffect').contents;
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.roll-characteristic').click(async (ev) => await this._prepareRollCharacteristic(ev));
        html.find('.roll-skill').click(async (ev) => await this._prepareRollSkill(ev));
        html.find('.acolyte-homeWorld').change((ev) => this._onHomeworldChange(ev));
        html.find('.bonus-vocalize').click(async (ev) => await this._onBonusVocalize(ev));

        html.find('.combat-control').click(async (ev) => await this._combatControls(ev));
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
                await woundRoll.evaluate({ async: true });
                this.actor.wounds.max = woundRoll.total;

                // Roll Fate
                let fateRoll = new Roll('1d10');
                await fateRoll.evaluate({ async: true });
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
