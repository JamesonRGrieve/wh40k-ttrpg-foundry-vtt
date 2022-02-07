export class DarkHeresyItemSheet extends ItemSheet {

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      width: 520,
      height: 480,
      tabs: [{ navSelector: ".dh-navigation", contentSelector: ".dh-body", initial: "description" }]
    });
  }

  get template() {
    const path = "systems/dark-heresy-2nd/templates/item";
    return `${path}/${this.item.data.type}-sheet.hbs`;
  }

  getData() {
    const context = super.getData();

    // Use a safe clone of the item data for further operations.
    const itemData = context.item.data;

    // Add the actor's data to context.data for easier access, as well as flags.
    context.data = itemData.data;
    context.flags = itemData.flags;
    return context;
  }


  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.isEditable) return;

    // Roll handlers, click handlers, etc. would go here.
  }
}
