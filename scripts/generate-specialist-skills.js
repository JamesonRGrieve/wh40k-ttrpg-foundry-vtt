#!/usr/bin/env node

/**
 * Generate individual specialist skill entries from template files
 * Creates specific compendium items like "Common Lore (Imperium)", "Pilot (Spacecraft)", etc.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Specialist skill definitions with their specializations
const SPECIALIST_SKILLS = {
  'common-lore': {
    name: 'Common Lore',
    templateId: '1I8VwbtfaXIi6DF5',
    specializations: [
      'Adeptus Arbites', 'Adeptus Astra Telepathica', 'Adeptus Mechanicus', 
      'Adeptus Administratum', 'Ecclesiarchy', 'Imperial Creed', 'Imperial Guard',
      'Imperial Navy', 'Imperium', 'Navis Nobilite', 'Rogue Traders', 'Tech',
      'Underworld', 'War', 'Calixis Sector', 'Jericho Reach', 'Koronus Expanse',
      'Screaming Vortex', 'Spinward Front'
    ]
  },
  'forbidden-lore': {
    name: 'Forbidden Lore',
    templateId: 'dcFOoPyKaSVG2qbh',
    specializations: [
      'Warp', 'Xenos', 'Daemonology', 'Heresy', 'Mutants', 'Psykers',
      'Archaeotech', 'Adeptus Mechanicus', 'Inquisition', 'Chaos',
      'The Horus Heresy', 'Mutants', 'Pirates', 'Archeotech'
    ]
  },
  'scholastic-lore': {
    name: 'Scholastic Lore',
    templateId: 'jPfXcl9ip3yPxdjE',
    specializations: [
      'Astromancy', 'Beasts', 'Bureaucracy', 'Chymistry', 'Cryptology',
      'Heraldry', 'Imperial Warrants', 'Judgement', 'Legend', 'Numerology',
      'Occult', 'Philosophy', 'Tactica Imperialis'
    ]
  },
  'speak-language': {
    name: 'Speak Language',
    templateId: 'd5Gx07FbLbo0pQqL',
    specializations: [
      'Low Gothic', 'High Gothic', 'Techna-Lingua', 'Eldar', 'Ork', 'Tau',
      'Dark Tongue', 'Kroot', 'Battlefleet War Cant', 'Mercenary Cant',
      'Trader Cant', 'Underhive Cant'
    ]
  },
  'secret-tongue': {
    name: 'Secret Tongue',
    templateId: '8Ytvc5E5EIAFDDd0',
    specializations: [
      'Military', 'Underhive', 'Gutter', 'Rogue Trader', 'Tech',
      'Administratum', 'Acolyte'
    ]
  },
  'trade': {
    name: 'Trade',
    templateId: 'heE9hGFUIrGsGUw7',
    specializations: [
      'Armorer', 'Chymist', 'Cook', 'Shipwright', 'Voidfarer', 'Soothsayer',
      'Scrimshawer', 'Explorator', 'Technomat', 'Remembrancer', 'Cartographer'
    ]
  },
  'pilot': {
    name: 'Pilot',
    templateId: 'dVj4QK82PMgrjVZ4',
    specializations: [
      'Spacecraft', 'Personal', 'Flyers', 'Drop Pod', 'Thunderhawk',
      'Land Speeder', 'Assault Ram'
    ]
  },
  'drive': {
    name: 'Drive',
    templateId: 'XwbDQ1DmvW3T7zEa',
    specializations: [
      'Ground Vehicle', 'Skimmer', 'Walker', 'Grav-Vehicle', 'Bike',
      'Chariot'
    ]
  },
  'performer': {
    name: 'Performer',
    templateId: 'g8QU7c251CRmvRPF',
    specializations: [
      'Singer', 'Musician', 'Dancer', 'Actor', 'Storyteller', 'Poet'
    ]
  }
};

function generateId() {
  return crypto.randomBytes(8).toString('hex').substring(0, 16);
}

function createSkillEntry(skillKey, skillData, specialization) {
  const templatePath = path.join(__dirname, '..', 'src', 'packs', 'rt-items-skills', '_source', `${skillKey}-x_${skillData.templateId}.json`);
  
  let template;
  try {
    template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
  } catch (err) {
    console.error(`Could not load template for ${skillKey}:`, err.message);
    return null;
  }
  
  const newSkill = JSON.parse(JSON.stringify(template));
  newSkill.name = `${skillData.name} (${specialization})`;
  newSkill._id = generateId();
  
  return newSkill;
}

function main() {
  const outputDir = path.join(__dirname, '..', 'src', 'packs', 'rt-items-skills', '_source');
  
  let totalCreated = 0;
  
  console.log('='.repeat(70));
  console.log('Generating Specialist Skill Compendium Entries');
  console.log('='.repeat(70));
  console.log();
  
  for (const [skillKey, skillData] of Object.entries(SPECIALIST_SKILLS)) {
    console.log(`\n${skillData.name}:`);
    
    for (const spec of skillData.specializations) {
      const skill = createSkillEntry(skillKey, skillData, spec);
      if (!skill) continue;
      
      const fileName = `${skillKey}-${spec.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${skill._id}.json`;
      const filePath = path.join(outputDir, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(skill, null, 2) + '\n', 'utf8');
      console.log(`  ✓ ${skill.name}`);
      totalCreated++;
    }
  }
  
  console.log();
  console.log('='.repeat(70));
  console.log(`Created ${totalCreated} specialist skill entries`);
  console.log('='.repeat(70));
}

main();
