/**
 * @file migrate-conditions.mjs
 * @description Migrate 8 conditions from type:"trait" to type:"condition"
 * 
 * Run with: node scripts/migrate-conditions.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, "../src/packs/rt-items-conditions/_source");

// Condition metadata (proper condition schema)
const CONDITIONS = {
  "concealed": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against concealed targets suffer a -20 penalty.</p>",
    removal: "<p>Removed when the target is no longer obscured or hidden from view.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "fatigued": {
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>All Tests suffer a -10 penalty while fatigued. This penalty does not stack with multiple levels of fatigue.</p>",
    removal: "<p>Removed after 1 hour of rest. Eight consecutive hours of rest removes all fatigue levels.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "232", custom: "" }
  },
  "grappled": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against targets engaged in a grapple gain a +20 bonus. The grappled character cannot move.</p>",
    removal: "<p>Removed when the grapple ends via Opposed Strength Test or when one party is rendered helpless.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "247", custom: "" }
  },
  "helpless": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against helpless targets automatically hit. Helpless characters cannot take Actions or Reactions.</p>",
    removal: "<p>Removed when the target can act again (e.g., when no longer unconscious, bound, or immobilized).</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "pinned": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>Attacks against pinned targets gain a +20 bonus. Pinned characters cannot move and suffer -20 to all Tests.</p>",
    removal: "<p>Removed by going Prone, breaking line of sight, or when suppression ends.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "prone": {
    nature: "harmful",
    appliesTo: "both",
    effect: "<p>Melee attacks against prone targets gain +10. Ranged attacks against prone targets suffer -10. Dodging while prone suffers -20 penalty.</p>",
    removal: "<p>Removed by standing up as a Half Action.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "stunned": {
    nature: "harmful",
    appliesTo: "target",
    effect: "<p>A stunned character loses their next Action. Attacks against stunned targets gain a +20 bonus.</p>",
    removal: "<p>Automatically removed at the start of the character's next turn.</p>",
    stackable: false,
    duration: { value: 1, units: "rounds" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  },
  "surprised-unaware": {
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>Surprised characters cannot take Reactions and cannot Dodge or Parry. They act last in the first round of combat.</p>",
    removal: "<p>Removed at the end of the first round of combat.</p>",
    stackable: false,
    duration: { value: 1, units: "rounds" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" }
  }
};

/**
 * Main migration function
 */
function migrateConditions() {
  console.log("🔄 Starting CONDITIONS migration...\n");
  
  // Read all condition files
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));
  
  if (files.length === 0) {
    console.error("❌ No JSON files found in pack directory!");
    process.exit(1);
  }
  
  console.log(`📦 Found ${files.length} condition files\n`);
  
  let migrated = 0;
  let skipped = 0;
  let errors = 0;
  
  files.forEach(file => {
    try {
      const filePath = path.join(PACK_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      
      // Extract identifier from filename (e.g., "stunned_xxxxx.json" -> "stunned")
      const identifier = file.split("_")[0];
      const meta = CONDITIONS[identifier];
      
      if (!meta) {
        console.warn(`⚠️  No metadata for "${identifier}", skipping...`);
        skipped++;
        return;
      }
      
      // Check if already migrated
      if (data.type === "condition") {
        console.log(`✓  ${data.name} - Already migrated`);
        skipped++;
        return;
      }
      
      // Transform to condition type
      const updated = {
        name: data.name,
        type: "condition",  // ✅ Change type!
        img: data.img,
        system: {
          identifier: identifier,
          nature: meta.nature,
          effect: meta.effect,
          removal: meta.removal,
          stackable: meta.stackable,
          stacks: 1,
          appliesTo: meta.appliesTo,
          duration: meta.duration,
          description: {
            value: meta.effect,  // Copy effect to description
            source: meta.source
          },
          modifiers: {
            characteristics: {},
            skills: {},
            combat: {}
          },
          notes: ""
        },
        effects: [],
        flags: {
          rt: {
            generated: true,
            version: "2.0"
          }
        },
        _id: data._id
      };
      
      // Write updated file
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
      console.log(`✅ ${data.name} - Migrated successfully`);
      migrated++;
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      errors++;
    }
  });
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Migration Summary:");
  console.log("=".repeat(50));
  console.log(`✅ Migrated: ${migrated}`);
  console.log(`⏭️  Skipped:  ${skipped}`);
  console.log(`❌ Errors:   ${errors}`);
  console.log("=".repeat(50));
  
  if (migrated > 0) {
    console.log("\n✨ Migration complete! Conditions are now proper 'condition' type.");
    console.log("📝 Next: Run 'npm run build' to compile the system.");
  }
  
  if (errors > 0) {
    console.log("\n⚠️  Some files had errors. Please review and fix manually.");
    process.exit(1);
  }
}

// Run migration
migrateConditions();
