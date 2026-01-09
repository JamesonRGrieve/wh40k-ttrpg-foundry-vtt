import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, "../src/packs/rt-items-traits/_source");

// Category mapping from old to new semantic categories
const CATEGORY_MAP = {
  "Trait (Elite)": "elite",
  "Trait (Unique)": "unique",
  "Trait": "general",
  "creature": "creature",
  "origin": "origin"
};

/**
 * Determine semantic category from old category.
 * @param {string} oldCategory  Original category value
 * @returns {string} Semantic category
 */
function determineSemanticCategory(oldCategory) {
  if (!oldCategory) return "general";
  
  // Direct mapping
  if (CATEGORY_MAP[oldCategory]) {
    return CATEGORY_MAP[oldCategory];
  }
  
  // Fallback: check for keywords
  const lower = oldCategory.toLowerCase();
  if (lower.includes("elite")) return "elite";
  if (lower.includes("unique")) return "unique";
  if (lower.includes("creature")) return "creature";
  if (lower.includes("origin")) return "origin";
  if (lower.includes("character")) return "character";
  
  return "general";
}

/**
 * Clean individual trait file.
 * @param {string} filePath  Path to JSON file
 * @returns {boolean} True if file was modified
 */
function cleanTraitFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  
  let modified = false;
  const changes = [];
  
  // FIX 1: Type field - CRITICAL
  if (data.type !== "trait") {
    const oldType = data.type;
    data.type = "trait";
    modified = true;
    changes.push(`type: "${oldType}" → "trait"`);
  }
  
  // FIX 2: Migrate effect → benefit
  if (data.system.effect && (!data.system.benefit || data.system.benefit === "")) {
    // Copy effect to benefit (handle both string and HTML)
    if (data.system.description?.value) {
      // Use description.value as source (already HTML)
      data.system.benefit = data.system.description.value;
    } else {
      // Wrap plain text in paragraph
      data.system.benefit = `<p>${data.system.effect}</p>`;
    }
    modified = true;
    changes.push("effect → benefit");
  }
  
  // FIX 3: Remove legacy fields
  if (data.system.effect !== undefined) {
    delete data.system.effect;
    modified = true;
    changes.push("removed legacy 'effect'");
  }
  if (data.system.tier !== undefined) {
    delete data.system.tier;
    modified = true;
    changes.push("removed 'tier' (wrong field for traits)");
  }
  if (data.system.aptitudes !== undefined) {
    delete data.system.aptitudes;
    modified = true;
    changes.push("removed 'aptitudes' (wrong field for traits)");
  }
  if (data.system.effects !== undefined) {
    delete data.system.effects;
    modified = true;
    changes.push("removed 'effects'");
  }
  
  // FIX 4: Clean category
  if (data.system.category) {
    const newCategory = determineSemanticCategory(data.system.category);
    if (newCategory !== data.system.category) {
      const oldCategory = data.system.category;
      data.system.category = newCategory;
      modified = true;
      changes.push(`category: "${oldCategory}" → "${newCategory}"`);
    }
  } else {
    data.system.category = "general";
    modified = true;
    changes.push("added category: 'general'");
  }
  
  // FIX 5: Initialize level (must be number, not null/undefined)
  if (data.system.level === undefined || data.system.level === null) {
    data.system.level = 0;
    modified = true;
    changes.push("initialized level: 0");
  } else if (typeof data.system.level !== "number") {
    data.system.level = 0;
    modified = true;
    changes.push("fixed level type");
  }
  
  // FIX 6: Clean requirements
  if (data.system.requirements === "-") {
    data.system.requirements = "";
    modified = true;
    changes.push("cleaned requirements");
  } else if (data.system.requirements === undefined) {
    data.system.requirements = "";
    modified = true;
    changes.push("added requirements field");
  }
  
  // FIX 7: Add notes if missing
  if (data.system.notes === undefined) {
    data.system.notes = "";
    modified = true;
    changes.push("added notes field");
  }
  
  // FIX 8: Ensure identifier exists (from IdentifierField)
  if (!data.system.identifier) {
    data.system.identifier = "";
    modified = true;
    changes.push("added identifier field");
  }
  
  // FIX 9: Remove descriptionText if present (legacy)
  if (data.system.descriptionText !== undefined) {
    delete data.system.descriptionText;
    modified = true;
    changes.push("removed 'descriptionText'");
  }
  
  // FIX 10: Ensure modifiers object exists (from ModifiersTemplate)
  if (!data.system.modifiers) {
    data.system.modifiers = {
      characteristics: {},
      skills: {},
      combat: {},
      wounds: 0,
      fate: 0,
      movement: 0
    };
    modified = true;
    changes.push("added modifiers object");
  }
  
  // Write back if modified
  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
    return { modified: true, changes };
  }
  
  return { modified: false, changes: [] };
}

/**
 * Main execution.
 */
function main() {
  console.log("🔧 Starting Traits Pack Cleaning...\n");
  console.log("Target:", PACK_DIR, "\n");
  
  const files = fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json"));
  
  let cleaned = 0;
  let errors = 0;
  let typeFixed = 0;
  let benefitFixed = 0;
  let categoryFixed = 0;
  let levelFixed = 0;
  
  console.log(`Found ${files.length} trait files to process...\n`);
  
  for (const file of files) {
    const filePath = path.join(PACK_DIR, file);
    try {
      const result = cleanTraitFile(filePath);
      if (result.modified) {
        cleaned++;
        console.log(`✓ ${file}`);
        if (result.changes.length > 0) {
          result.changes.forEach(change => console.log(`  - ${change}`));
        }
        
        // Track specific fixes
        if (result.changes.some(c => c.includes("type:"))) typeFixed++;
        if (result.changes.some(c => c.includes("effect → benefit"))) benefitFixed++;
        if (result.changes.some(c => c.includes("category:"))) categoryFixed++;
        if (result.changes.some(c => c.includes("level"))) levelFixed++;
      }
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
      errors++;
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ Traits Pack Cleaning Complete!");
  console.log("=".repeat(60));
  console.log(`Total files:        ${files.length}`);
  console.log(`Files cleaned:      ${cleaned}`);
  console.log(`Files unchanged:    ${files.length - cleaned - errors}`);
  console.log(`Errors:             ${errors}`);
  console.log("");
  console.log("Fixes applied:");
  console.log(`  - Type fixed:     ${typeFixed} (talent → trait)`);
  console.log(`  - Benefit added:  ${benefitFixed} (migrated from effect)`);
  console.log(`  - Category clean: ${categoryFixed} (semantic categories)`);
  console.log(`  - Level init:     ${levelFixed} (null/undefined → 0)`);
  console.log("");
  
  if (errors === 0) {
    console.log("🎉 Success! All trait files cleaned with 0 errors.");
  } else {
    console.log(`⚠️  Completed with ${errors} error(s). Please review.`);
  }
}

main();
