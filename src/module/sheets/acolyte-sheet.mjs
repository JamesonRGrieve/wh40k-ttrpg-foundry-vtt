import {toggleUIExpanded} from "../helpers/config.mjs";
import {prepareSimpleRoll} from "../rolls/prompt.mjs";

export class AcolyteSheet extends ActorSheet {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      template: "systems/dark-heresy-2nd/templates/actor/actor-sheet.hbs",
      width: 1000,
      height: 750,
      resizable: true,
      tabs: [{ navSelector: ".dh-navigation", contentSelector: ".dh-body", initial: "main" }]
    });
  }

  get template() {
    return `systems/dark-heresy-2nd/templates/actor/actor-${this.actor.data.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();
    context.data = context.data.data;
    context.dh = CONFIG.dh;
    return context;
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.roll-characteristic').click(async ev => await this._prepareRollCharacteristic(ev));
    html.find('.roll-skill').click(async ev => await this._prepareRollSkill(ev));
    html.find('.sheet-control__hide-control').click(async ev => await this._sheetControlHideToggle(ev));
    html.find('.item-create').click(ev => this._onItemCreate(ev));
    html.find('.item-edit').click(ev => this._onItemEdit(ev));
    html.find('.item-delete').click(ev => this._onItemDelete(ev));
    html.find('.acolyte-homeWorld').change(ev => this._onHomeworldChange(ev));
  }

  async _prepareRollCharacteristic(event) {
    event.preventDefault();
    const characteristicName = $(event.currentTarget).data("characteristic");
    const characteristic = this.actor.characteristics[characteristicName];
    const rollData = {
      sheetName: this.actor.name,
      name: characteristic.label,
      type: 'Characteristic',
      baseTarget: characteristic.total,
      modifier: 0
    };
    await prepareSimpleRoll(rollData);
  }

  async _prepareRollSkill(event) {
    event.preventDefault();
    const skillName = $(event.currentTarget).data("skill");
    const specialtyName = $(event.currentTarget).data("specialty");

    let skill = this.actor.skills[skillName];
    let label = skill.label;
    if(specialtyName) {
      skill = skill.specialities[specialtyName];
      label = `${label}: ${skill.label}`;
    }

    const rollData = {
      sheetName: this.actor.name,
      name: label,
      type: 'Skill',
      baseTarget: skill.current,
      modifier: 0
    };
    await prepareSimpleRoll(rollData);
  }

  async _sheetControlHideToggle(event) {
    event.preventDefault();
    const displayToggle = $(event.currentTarget);
    $('span:first', displayToggle).toggleClass('active');
    const target = displayToggle.data("toggle");
    $('.' + target).toggle();
    toggleUIExpanded(target)
  }

  _onHomeworldChange(event) {
    event.preventDefault();
    let d = Dialog.confirm({
      title: "Roll Characteristics?",
      content: "<p>Would you like to roll Wounds and Fate for this homeworld?</p>",
      yes: async () => {
        // Roll Wounds
        let woundRoll = new Roll(this.actor.backgroundEffects.homeworld.wounds);
        await woundRoll.evaluate({async: true});
        this.actor.wounds.max = woundRoll.total;

        // Roll Fate
        let fateRoll = new Roll("1d10");
        await fateRoll.evaluate({async: true});
        this.actor.fate.max = parseInt(this.actor.backgroundEffects.homeworld.fate_threshold) + (fateRoll.total >= this.actor.backgroundEffects.homeworld.emperors_blessing ? 1 : 0);
        this.render(true);
      },
      no: () => {},
      defaultYes: false
    });
  }

  _onItemEdit(event) {
    event.preventDefault();
    const div = $(event.currentTarget);
    let item = this.actor.items.get(div.data("itemId"));
    item.sheet.render(true);
  }

  _onItemDelete(event) {
    event.preventDefault();
    let d = Dialog.confirm({
      title: "Confirm Delete",
      content: "<p>Are you sure you would like to delete this?</p>",
      yes: () => {
        const div = $(event.currentTarget);
        this.actor.deleteEmbeddedDocuments("Item", [div.data("itemId")]);
        div.slideUp(200, () => this.render(false));
      },
      no: () => {},
      defaultYes: false
    });
  }

  _onItemCreate(event) {
    event.preventDefault();
    const div = $(event.currentTarget);
    let data = {
      name : `New ${div.data("type").capitalize()}`,
      type : div.data("type")
    };
    this.actor.createEmbeddedDocuments("Item", [data], { renderSheet: true });
  }

  _confirm(func) {

  }

}
