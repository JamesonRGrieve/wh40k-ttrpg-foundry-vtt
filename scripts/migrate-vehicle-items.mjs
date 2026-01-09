#!/usr/bin/env node
/**
 * Migrate vehicle trait and upgrade pack data to enhanced schemas.
 * Adds missing fields and ensures compatibility.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAITS_DIR = path.join(__dirname, '../src/packs/rt-items-vehicle-traits/_source');
const UPGRADES_DIR = path.join(__dirname, '../src/packs/rt-items-vehicle-upgrades/_source');

/**
 * Migrate a vehicle trait.
 */
function migrateTrait(trait) {
  const migrated = { ...trait };
  const old = trait.system;
  
  // Ensure all fields exist
  migrated.system = {
    // Keep existing
    descriptionText: old.descriptionText || "",
    description: old.description || { value: "" },
    modifiers: old.modifiers || { speed: 0, manoeuvrability: 0, armour: 0, integrity: 0 },
    
    // Add missing
    identifier: old.identifier || "",
    hasLevel: old.hasLevel || false,
    level: old.level || null,
    notes: old.notes || ""
  };
  
  return migrated;
}

/**
 * Migrate a vehicle upgrade.
 */
function migrateUpgrade(upgrade) {
  const migrated = { ...upgrade };
  const old = upgrade.system;
  
  // Parse difficulty (string like "+10" or "-30")
  let difficulty = 0;
  if (old.difficulty) {
    const match = old.difficulty.match(/([+-]?\d+)/);
    difficulty = match ? parseInt(match[1]) : 0;
  }
  
  // Map old type to new upgradeType
  let upgradeType = "standard";
  if (old.type) {
    const typeLower = old.type.toLowerCase();
    if (typeLower === "integral") upgradeType = "integral";
    else if (typeLower === "custom") upgradeType = "custom";
  }
  
  // Ensure all fields exist
  migrated.system = {
    // Keep existing
    descriptionText: old.descriptionText || "",
    description: old.description || { value: "" },
    availability: old.availability || "common",
    source: old.source || "",
    installCost: old.installCost || 0,
    modifiers: old.modifiers || { speed: 0, manoeuvrability: 0, armour: 0, integrity: 0 },
    
    // Transform
    upgradeType: upgradeType,
    difficulty: difficulty,
    allowedVehicles: old.allowedVehicles || "any",
    
    // Add missing
    identifier: old.identifier || "",
    notes: old.notes || ""
  };
  
  // Remove old fields
  delete migrated.system.type; // Now upgradeType
  
  return migrated;
}

async function migrateAll() {
  console.log("\n" + "=".repeat(60));
  console.log("Vehicle Traits & Upgrades Migration");
  console.log("=".repeat(60) + "\n");
  
  // Migrate traits
  const traitFiles = fs.readdirSync(TRAITS_DIR).filter(f => f.endsWith('.json'));
  console.log(`Migrating ${traitFiles.length} vehicle traits...`);
  
  let traitsSuccess = 0;
  for (const file of traitFiles) {
    try {
      const filePath = path.join(TRAITS_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const migrated = migrateTrait(data);
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      traitsSuccess++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  console.log(`  ✓ ${traitsSuccess} traits migrated`);
  
  // Migrate upgrades
  const upgradeFiles = fs.readdirSync(UPGRADES_DIR).filter(f => f.endsWith('.json'));
  console.log(`\nMigrating ${upgradeFiles.length} vehicle upgrades...`);
  
  let upgradesSuccess = 0;
  for (const file of upgradeFiles) {
    try {
      const filePath = path.join(UPGRADES_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const migrated = migrateUpgrade(data);
      fs.writeFileSync(filePath, JSON.stringify(migrated, null, 2));
      upgradesSuccess++;
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  console.log(`  ✓ ${upgradesSuccess} upgrades migrated`);
  
  console.log("\n" + "=".repeat(60));
  console.log("Migration Summary");
  console.log("=".repeat(60));
  console.log(`✓ Traits: ${traitsSuccess}/${traitFiles.length}`);
  console.log(`✓ Upgrades: ${upgradesSuccess}/${upgradeFiles.length}`);
  console.log("=".repeat(60) + "\n");
}

migrateAll().catch(console.error);
