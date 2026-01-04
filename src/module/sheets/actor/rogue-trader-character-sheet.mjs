export class RogueTraderCharacterSheet extends ActorSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 900,
            height: 750,
            resizable: true,
        });
    }

    get template() {
        return `systems/rogue-trader/templates/actor/actor-rogue-trader-character-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        const characteristics = this.actor.system.characteristics ?? {};
        const characteristicOrder = [
            'weaponSkill',
            'ballisticSkill',
            'strength',
            'toughness',
            'agility',
            'intelligence',
            'perception',
            'willpower',
            'fellowship',
        ];
        context.characteristics = characteristicOrder
            .filter((key) => characteristics[key])
            .map((key) => ({ key, data: characteristics[key] }));

        const skills = Object.entries(this.actor.system.skills ?? {}).map(([key, data]) => ({
            key,
            data,
        }));
        skills.sort((a, b) => a.data.label.localeCompare(b.data.label));
        const splitIndex = Math.ceil(skills.length / 2);
        context.skillColumns = {
            left: skills.slice(0, splitIndex),
            right: skills.slice(splitIndex),
        };
        return context;
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find('.roll-characteristic').click(async (ev) => {
            ev.preventDefault();
            const characteristicName = ev.currentTarget.dataset.characteristic;
            await this.actor.rollCharacteristic(characteristicName);
        });

        html.find('.roll-skill').click(async (ev) => {
            ev.preventDefault();
            const skillName = ev.currentTarget.dataset.skill;
            await this.actor.rollSkill(skillName);
        });
    }
}
