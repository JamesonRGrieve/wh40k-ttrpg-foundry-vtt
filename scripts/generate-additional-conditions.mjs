/**
 * @file generate-additional-conditions.mjs
 * @description Generate 6 additional core conditions for the pack
 * 
 * Run with: node scripts/generate-additional-conditions.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACK_DIR = path.join(__dirname, "../src/packs/rt-items-conditions/_source");

/**
 * Generate a random Foundry-style ID
 * @param {number} length - Length of ID (default 16)
 * @returns {string}
 */
function randomID(length = 16) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Additional conditions to generate
 */
const NEW_CONDITIONS = [
  {
    identifier: "blinded",
    name: "Blinded",
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>A blinded character automatically fails all Tests based on sight (Awareness, ranged attacks, etc.). All melee attacks suffer a -30 penalty. Movement is reduced to Half Move rate.</p>",
    removal: "<p>Removed when sight is restored through medical attention, psychic powers, or when the blinding effect ends.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" },
    img: "icons/svg/blind.svg"
  },
  {
    identifier: "deafened",
    name: "Deafened",
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>A deafened character automatically fails all Tests based on hearing (Awareness to hear, etc.). Opposed Social Skill Tests suffer a -10 penalty due to difficulty in communication.</p>",
    removal: "<p>Removed when hearing is restored through medical attention or when the deafening effect ends.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "249", custom: "" },
    img: "icons/svg/deaf.svg"
  },
  {
    identifier: "on-fire",
    name: "On Fire",
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>An on-fire character suffers 1d10 Energy damage (ignoring armour and Toughness) at the start of each of their turns. The character must use a Full Action and pass an Agility Test to extinguish the flames.</p>",
    removal: "<p>Removed by passing an Agility Test as a Full Action, or by allies using a Full Action to extinguish the flames automatically.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "243", custom: "" },
    img: "icons/svg/fire.svg"
  },
  {
    identifier: "bleeding",
    name: "Bleeding",
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>A bleeding character loses 1 Wound at the start of each of their turns. This damage ignores armour and Toughness Bonus.</p>",
    removal: "<p>Removed by a successful Medicae Test as a Full Action, or by the application of appropriate medical supplies or abilities.</p>",
    stackable: true,
    duration: { value: 0, units: "permanent" },
    source: { book: "", page: "", custom: "Common Houserule" },
    img: "icons/svg/blood.svg"
  },
  {
    identifier: "frightened",
    name: "Frightened",
    nature: "harmful",
    appliesTo: "self",
    effect: "<p>A frightened character suffers a -10 penalty to all Willpower Tests. The character may be required to flee or cower depending on the source of fear and the GM's discretion.</p>",
    removal: "<p>Removed when the source of fear is no longer present, or by passing a Willpower Test at the end of the character's turn.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "Rogue Trader Core", page: "296", custom: "Fear & Insanity rules" },
    img: "icons/svg/terror.svg"
  },
  {
    identifier: "inspired",
    name: "Inspired",
    nature: "beneficial",
    appliesTo: "self",
    effect: "<p>An inspired character gains a +10 bonus to all Willpower Tests. The character may reroll failed Fear Tests once and must accept the second result.</p>",
    removal: "<p>Removed at the end of the scene, or when the inspiring circumstance no longer applies.</p>",
    stackable: false,
    duration: { value: 0, units: "permanent" },
    source: { book: "", page: "", custom: "Leadership & Morale" },
    img: "icons/svg/angel.svg"
  }
];

/**
 * Main generation function
 */
function generateConditions() {
  console.log("🔄 Generating additional CONDITIONS...\n");
  
  // Check pack directory exists
  if (!fs.existsSync(PACK_DIR)) {
    console.error(`❌ Pack directory not found: ${PACK_DIR}`);
    process.exit(1);
  }
  
  console.log(`📦 Generating ${NEW_CONDITIONS.length} new conditions\n`);
  
  let generated = 0;
  let errors = 0;
  
  NEW_CONDITIONS.forEach(meta => {
    try {
      const id = randomID(16);
      const filename = `${meta.identifier}_${id}.json`;
      const filePath = path.join(PACK_DIR, filename);
      
      // Check if file already exists
      const existingFiles = fs.readdirSync(PACK_DIR).filter(f => f.startsWith(meta.identifier + "_"));
      if (existingFiles.length > 0) {
        console.log(`⏭️  ${meta.name} - Already exists (${existingFiles[0]})`);
        return;
      }
      
      // Create condition object
      const condition = {
        name: meta.name,
        type: "condition",
        img: meta.img,
        system: {
          identifier: meta.identifier,
          nature: meta.nature,
          effect: meta.effect,
          removal: meta.removal,
          stackable: meta.stackable,
          stacks: 1,
          appliesTo: meta.appliesTo,
          duration: meta.duration,
          description: {
            value: meta.effect,
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
        _id: id
      };
      
      // Write file
      fs.writeFileSync(filePath, JSON.stringify(condition, null, 2));
      console.log(`✅ ${meta.name} - Generated (${filename})`);
      generated++;
      
    } catch (error) {
      console.error(`❌ Error generating ${meta.name}:`, error.message);
      errors++;
    }
  });
  
  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("📊 Generation Summary:");
  console.log("=".repeat(50));
  console.log(`✅ Generated: ${generated}`);
  console.log(`❌ Errors:    ${errors}`);
  console.log("=".repeat(50));
  
  if (generated > 0) {
    console.log(`\n✨ Generated ${generated} new conditions!`);
    console.log(`📦 Total conditions in pack: ${fs.readdirSync(PACK_DIR).filter(f => f.endsWith(".json")).length}`);
    console.log("📝 Next: Run 'npm run build' to compile the system.");
  }
  
  if (errors > 0) {
    console.log("\n⚠️  Some conditions had errors. Please review and fix manually.");
    process.exit(1);
  }
}

// Run generation
generateConditions();
