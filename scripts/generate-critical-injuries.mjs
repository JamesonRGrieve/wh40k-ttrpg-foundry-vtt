/**
 * Generate 160 critical injury items from hardcoded critical damage tables.
 * Creates compendium pack entries for all injury combinations.
 * 
 * Run with: node scripts/generate-critical-injuries.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { criticalDamage } from '../src/module/rules/critical-damage.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'packs', 'rt-items-critical-injuries', '_source');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`✅ Created directory: ${OUTPUT_DIR}`);
}

// Mapping for body part naming
const bodyPartMap = {
  "Arm": "arm",
  "Body": "body",
  "Head": "head",
  "Leg": "leg"
};

// Mapping for damage type naming
const damageTypeMap = {
  "Energy": "energy",
  "Explosive": "explosive",
  "Impact": "impact",
  "Rending": "rending"
};

// Icon mapping (fallback to SVG icon)
const damageIcons = {
  impact: "icons/svg/blood.svg",
  rending: "icons/svg/blood.svg",
  explosive: "icons/svg/blood.svg",
  energy: "icons/svg/blood.svg"
};

/**
 * Generate a random Foundry-style ID
 */
function randomID(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Main generation function
 */
function generateInjuries() {
  const tables = criticalDamage();
  let count = 0;
  const generated = [];

  for (const [damageTypeName, bodyParts] of Object.entries(tables)) {
    const damageType = damageTypeMap[damageTypeName];
    
    for (const [bodyPartName, severities] of Object.entries(bodyParts)) {
      const bodyPart = bodyPartMap[bodyPartName];
      
      for (const [severity, effect] of Object.entries(severities)) {
        const severityNum = parseInt(severity);
        
        // Generate item name
        const name = `${damageTypeName} ${bodyPartName} Critical ${severityNum}`;
        
        // Generate unique ID
        const id = randomID(16);
        
        // Determine if permanent (severity 7+)
        const permanent = severityNum >= 7;
        
        // Create item data
        const itemData = {
          name: name,
          type: "criticalInjury",
          img: damageIcons[damageType] || "icons/svg/blood.svg",
          system: {
            identifier: `crit_${damageType}_${bodyPart}_${severity}`,
            damageType: damageType,
            bodyPart: bodyPart,
            severity: severityNum,
            effect: `<p>${effect}</p>`,
            permanent: permanent,
            notes: "",
            description: {
              value: `<p><strong>${damageTypeName} Damage to ${bodyPartName} (Severity ${severityNum})</strong></p><p>${effect}</p>`,
              chat: "",
              summary: `${damageTypeName} ${bodyPartName} injury`
            },
            source: {
              book: "Rogue Trader Core Rulebook",
              page: "254-257",
              custom: ""
            }
          },
          effects: [],
          flags: {
            rt: {
              generated: true,
              version: "1.0"
            }
          },
          _id: id
        };
        
        // Write to file
        const filename = `${name.toLowerCase().replace(/\s+/g, '-')}_${id}.json`;
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, JSON.stringify(itemData, null, 2));
        
        generated.push({ name, id, damageType, bodyPart, severity: severityNum });
        count++;
      }
    }
  }

  return { count, generated };
}

// Run the script
console.log('🩹 Generating Critical Injury Compendium Items...\n');

try {
  const result = generateInjuries();
  
  console.log(`\n✅ Successfully generated ${result.count} critical injury items!`);
  console.log(`📁 Output directory: ${OUTPUT_DIR}\n`);
  
  // Print summary by damage type
  console.log('📊 Summary by Damage Type:');
  const summary = {};
  result.generated.forEach(item => {
    if (!summary[item.damageType]) {
      summary[item.damageType] = 0;
    }
    summary[item.damageType]++;
  });
  
  Object.entries(summary).forEach(([type, count]) => {
    console.log(`   ${type.padEnd(10)} : ${count} items`);
  });
  
  console.log('\n🎯 Next steps:');
  console.log('   1. Add pack to system.json');
  console.log('   2. Restart Foundry');
  console.log('   3. Verify pack loads correctly');
  console.log('   4. Test drag/drop onto characters\n');
  
} catch (error) {
  console.error('❌ Error generating injuries:', error);
  process.exit(1);
}
