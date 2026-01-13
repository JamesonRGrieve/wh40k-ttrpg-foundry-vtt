/**
 * Origin Path Data Migration Script
 * Run from Foundry console: game.rt.migrateOriginPaths({ dryRun: true })
 */

export class OriginPathMigrator {
  static async migrateCompendium(options = {}) {
    const { dryRun = false } = options;
    const pack = game.packs.get("rogue-trader.rt-items-origin-path");
    if (!pack) return console.error("Pack not found!");

    const documents = await pack.getDocuments();
    console.log(`Migrating ${documents.length} origins...`);

    for (const doc of documents) {
      const updates = {};
      
      // Add navigation if missing
      if (!doc.system?.navigation?.connectsTo) {
        const pos = doc.system?.position || 0;
        updates["system.navigation.connectsTo"] = pos === 0 ? [0,1] : pos >= 7 ? [pos-1,pos] : [pos-1,pos,pos+1];
      }
      
      // Initialize new fields
      if (!doc.system?.rollResults) {
        updates["system.rollResults"] = {wounds:{},fate:{}};
      }
      if (!doc.system?.selectedChoices) {
        updates["system.selectedChoices"] = {};
      }
      
      if (Object.keys(updates).length > 0 && !dryRun) {
        await doc.update(updates);
        console.log(`✓ ${doc.name}`);
      }
    }
    console.log("Migration complete!");
  }
}

Hooks.once("ready", () => {
  if (!game.rt) game.rt = {};
  game.rt.migrateOriginPaths = (opts) => OriginPathMigrator.migrateCompendium(opts);
});
