/**
 * ROGUE TRADER VTT - COMPREHENSIVE JOURNAL GENERATOR
 * ==================================================
 * 
 * Generates rich V13 multi-page journals from reference material:
 * - Character Creation (15+ pages)
 * - Character Actions & Rules (10+ pages)  
 * - Fear/Insanity/Corruption (6+ pages)
 * - Ship & Vehicle Actions (10+ pages)
 * - Colonies (6+ pages)
 * 
 * Features:
 * - Rich HTML with Rogue Trader theming
 * - Styled tables, callouts, examples
 * - Dice notation and characteristic highlighting
 * - GM secret sections
 * - Interactive elements
 * 
 * Usage: node scripts/generate-enhanced-journals-complete.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateId() {
  return crypto.randomBytes(8).toString('hex').substring(0, 16);
}

function backupFile(filepath) {
  if (fs.existsSync(filepath)) {
    const backup = filepath.replace('.json', `.backup.${Date.now()}.json`);
    fs.copyFileSync(filepath, backup);
    console.log(`  ✅ Backed up: ${path.basename(backup)}`);
    return true;
  }
  return false;
}

function writeJournal(filepath, journal) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filepath, JSON.stringify(journal, null, 2), 'utf8');
  console.log(`  💾 Saved: ${path.basename(filepath)}`);
}

// ============================================================================
// CSS STYLES
// ============================================================================
// NOTE: CSS is now in src/scss/journals.scss following V13 pattern
// Journal content uses semantic HTML with .rt-* classes, styled by system CSS

// ============================================================================
// JOURNAL 1: CHARACTER CREATION
// ============================================================================

function generateCharacterCreation() {
  const pages = [];
  let sortOrder = 100000;

  // Page 1: Welcome
  pages.push({
    _id: generateId(),
    name: 'Welcome to Rogue Trader',
    type: 'text',
    title: { show: true, level: 1 },
    text: {
      format: 1,
      content: `<div class="rt-journal-page">
  <div class="rt-header">
    <h1>⚔️ Character Creation ⚔️</h1>
    <p>Forge Your Legacy Among the Stars</p>
  </div>

  <div class="rt-section">
    <h2>🌟 Welcome, Explorer</h2>
    <p>In the grim darkness of the 41st millennium, you are one of humanity's boldest souls—a <strong>Rogue Trader</strong> or member of their dynasty. Armed with an ancient Warrant of Trade, you venture beyond the Imperium's borders to chart the unknown, claim new worlds, and amass unimaginable wealth.</p>
    
    <p>This guide will walk you through creating your character using the <strong>Origin Path</strong> system—a lifepath approach where each decision shapes your history, abilities, and destiny.</p>
  </div>

  <div class="rt-callout">
    <h3>📜 The Origin Path System</h3>
    <p>Your character's story unfolds through six pivotal choices:</p>
    <ol class="rt-list">
      <li><strong>Home World</strong> — Where you were born</li>
      <li><strong>Birthright</strong> — Your early life circumstances</li>
      <li><strong>Lure of the Void</strong> — What drew you to the stars</li>
      <li><strong>Trials and Travails</strong> — The hardships you overcame</li>
      <li><strong>Motivation</strong> — What drives you forward</li>
      <li><strong>Career</strong> — Your role in the dynasty</li>
    </ol>
  </div>

  <div class="rt-quick-ref">
    <h4>🎲 Quick Start: What You Need</h4>
    <ul class="rt-list">
      <li><span class="rt-dice-roll">2d10</span> for rolling characteristics</li>
      <li><strong>500 Starting XP</strong> to spend during creation</li>
      <li>Access to the <strong>Origin Path</strong> compendium items</li>
      <li>A sense of adventure and ambition!</li>
    </ul>
  </div>

  <div class="rt-section">
    <h2>🎯 Step-by-Step Process</h2>
    <ol class="rt-list">
      <li><strong>Roll or Allocate Characteristics</strong> (see next page)</li>
      <li><strong>Choose Your Origin Path</strong> (drag items from compendium)</li>
      <li><strong>Select Career</strong> and note starting skills/talents</li>
      <li><strong>Calculate Derived Stats</strong> (wounds, fate, movement)</li>
      <li><strong>Spend Starting XP</strong> (500 XP to customize)</li>
      <li><strong>Choose Starting Equipment</strong></li>
    </ol>
  </div>

  <div class="rt-callout warning">
    <h3>⚠️ Important Notes</h3>
    <ul class="rt-list">
      <li>If you gain the same skill twice, it increases to <strong>+10</strong>, then <strong>+20</strong></li>
      <li>If you gain the same talent twice, replace it with <strong>Talented (any skill)</strong></li>
      <li>Work with your GM on xenos origins or unusual backgrounds</li>
    </ul>
  </div>
</div>`
    },
    sort: sortOrder,
    flags: {}
  });
  sortOrder += 100000;

  // Page 2: Characteristics
  pages.push({
    _id: generateId(),
    name: 'Step 1: Characteristics',
    type: 'text',
    title: { show: true, level: 1 },
    text: {
      format: 1,
      content: `<div class="rt-journal-page">
  <div class="rt-header">
    <h1>📊 Generating Characteristics</h1>
    <p>The Foundation of Your Character</p>
  </div>

  <div class="rt-section">
    <h2>The Nine Characteristics</h2>
    <p>Every character possesses nine core characteristics that define their physical and mental capabilities. Each characteristic has a value (typically 25-45 at creation) and a <strong>bonus</strong> equal to its tens digit.</p>
    
    <table class="rt-table">
      <thead>
        <tr>
          <th>Characteristic</th>
          <th>Abbr.</th>
          <th>Represents</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="rt-characteristic">Weapon Skill</span></td>
          <td>WS</td>
          <td>Melee combat prowess and hand-to-hand coordination</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Ballistic Skill</span></td>
          <td>BS</td>
          <td>Ranged combat accuracy and marksmanship</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Strength</span></td>
          <td>S</td>
          <td>Physical power, carrying capacity, Leap/Jump distance</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Toughness</span></td>
          <td>T</td>
          <td>Resilience, endurance, fatigue threshold, damage resistance</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Agility</span></td>
          <td>Ag</td>
          <td>Dexterity, reflexes, coordination, movement speed, initiative</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Intelligence</span></td>
          <td>Int</td>
          <td>Mental acuity, logic, learning, most technical skills</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Perception</span></td>
          <td>Per</td>
          <td>Awareness, insight, sensory acuity, detection</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Willpower</span></td>
          <td>WP</td>
          <td>Mental fortitude, discipline, psychic power, resistance</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Fellowship</span></td>
          <td>Fel</td>
          <td>Charisma, leadership, social aptitude, all social skills</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="rt-section">
    <h2>🎲 Method 1: Rolling (Standard)</h2>
    <p>For each characteristic:</p>
    <ol class="rt-list">
      <li>Start with <strong>25</strong> (human baseline)</li>
      <li>Roll <span class="rt-dice-roll">2d10</span> and add the result</li>
      <li>You may <strong>reroll once</strong> per characteristic if desired (take new result)</li>
    </ol>
    
    <div class="rt-example">
      <strong>Example:</strong> Rolling for Weapon Skill<br>
      Base: 25 → Roll 2d10: 7 + 4 = 11 → <strong>Final WS: 36</strong><br>
      WS Bonus = 3 (tens digit)
    </div>
  </div>

  <div class="rt-section">
    <h2>📊 Method 2: Point Buy (Optional)</h2>
    <p>With GM approval, you may instead allocate points for more control:</p>
    <ul class="rt-list">
      <li>Start with <strong>25</strong> in all characteristics</li>
      <li>Distribute <strong>100 points</strong> among them</li>
      <li>Maximum <strong>+20</strong> to any single characteristic (max 45 at creation)</li>
      <li>Minimum <strong>-5</strong> to any single characteristic (min 20)</li>
    </ul>
    
    <div class="rt-callout">
      <h3>💡 Point Buy Advice</h3>
      <p>Consider your intended career when allocating points:</p>
      <ul class="rt-list">
        <li><strong>Rogue Trader:</strong> Fel, Int, WP for leadership and command</li>
        <li><strong>Arch-Militant:</strong> WS, BS, T for combat dominance</li>
        <li><strong>Seneschal:</strong> Fel, Int, Per for social and logistics</li>
        <li><strong>Void-Master:</strong> Ag, Int, Per for piloting and navigation</li>
        <li><strong>Explorator:</strong> Int, T, Per for tech and survival</li>
        <li><strong>Missionary:</strong> Fel, WP for faith and inspiration</li>
        <li><strong>Navigator:</strong> WP, Per, Int for warp sight and guidance</li>
        <li><strong>Astropath:</strong> WP, Per for telepathy and divination</li>
      </ul>
    </div>
  </div>

  <div class="rt-section">
    <h2>📈 Characteristic Bonuses</h2>
    <p>Your <strong>Characteristic Bonus (CB)</strong> equals the <strong>tens digit</strong> of the characteristic value. This bonus is used constantly in gameplay:</p>
    
    <table class="rt-table">
      <thead>
        <tr>
          <th>Characteristic Value</th>
          <th>Bonus</th>
          <th>Common Effects</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>01-09</td><td>0</td><td>Very poor capability</td></tr>
        <tr><td>10-19</td><td>1</td><td>Below average</td></tr>
        <tr><td>20-29</td><td>2</td><td>Average human</td></tr>
        <tr><td>30-39</td><td>3</td><td>Above average (starting PC)</td></tr>
        <tr><td>40-49</td><td>4</td><td>Exceptional</td></tr>
        <tr><td>50-59</td><td>5</td><td>Heroic</td></tr>
        <tr><td>60-69</td><td>6</td><td>Legendary</td></tr>
        <tr><td>70+</td><td>7+</td><td>Superhuman</td></tr>
      </tbody>
    </table>
    
    <div class="rt-example">
      <strong>Example:</strong> Strength 36 → <strong>Strength Bonus (SB) = 3</strong><br>
      <strong>Effects:</strong> Melee damage +3, Carry 13.5 kg, Lift 27 kg, Push 54 kg, Leap 3m horizontal
    </div>
  </div>

  <div class="rt-section">
    <h2>🔧 Characteristic Formula</h2>
    <p>Your final characteristic value is calculated as:</p>
    <div class="rt-stat-block">
      Total = Base + (Advances × 5) + Modifier + Unnatural Bonus
    </div>
    <ul class="rt-list">
      <li><strong>Base:</strong> Initial rolled or allocated value</li>
      <li><strong>Advances:</strong> Purchased improvements with XP (0-5 normally)</li>
      <li><strong>Modifier:</strong> Temporary bonuses from items, talents, conditions</li>
      <li><strong>Unnatural:</strong> Multiplies the bonus (rare, for inhuman creatures)</li>
    </ul>
  </div>

  <div class="rt-section rt-gm-secret">
    <h3>🎭 GM Note: Unnatural Characteristics</h3>
    <p>Some xenos or heavily modified characters may have <strong>Unnatural Characteristics</strong> (×2, ×3, ×4). These multiply the bonus, not the characteristic:</p>
    <ul class="rt-list">
      <li><strong>Unnatural Strength (×2):</strong> An Ork with S 40 has SB 8 (4 × 2), not 4</li>
      <li><strong>Unnatural Toughness (×2):</strong> Doubles TB for damage reduction</li>
      <li><strong>Unnatural Willpower (×3):</strong> Psyker with WP 35 has WPB 9 (3 × 3)</li>
    </ul>
    <p>Use <strong>very sparingly</strong> for player characters—these create massive power spikes and are meant for inhuman foes like Orks, Tyranids, or Greater Daemons!</p>
  </div>
</div>`
    },
    sort: sortOrder,
    flags: {}
  });
  sortOrder += 100000;

  // Page 3: Home World
  pages.push({
    _id: generateId(),
    name: 'Step 2: Home World',
    type: 'text',
    title: { show: true, level: 1 },
    text: {
      format: 1,
      content: `<div class="rt-journal-page">
  <div class="rt-header">
    <h1>🌍 Choosing Your Home World</h1>
    <p>Where Were You Born?</p>
  </div>

  <div class="rt-section">
    <h2>Home World Selection</h2>
    <p>Your home world shapes your upbringing, skills, worldview, and initial abilities. This is the <strong>first and most important</strong> origin path choice as it defines your character's fundamental nature.</p>
    
    <p>Choose one from the <strong>RT Items: Origin Path</strong> compendium and drag it onto your character sheet. The system will automatically apply characteristic modifiers, skills, and talents.</p>
  </div>

  <table class="rt-table">
    <thead>
      <tr>
        <th style="width: 20%">Home World</th>
        <th style="width: 25%">Characteristic Bonuses</th>
        <th style="width: 35%">Skills & Talents</th>
        <th style="width: 20%">Special</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Death World</strong></td>
        <td>+5 S, +5 T<br>-5 WP, -5 Fel</td>
        <td><span class="rt-skill">Survival</span>, Melee (Primitive), <span class="rt-talent">Jaded</span> or <span class="rt-talent">Resistance (Poisons)</span></td>
        <td>-10 to social tests in formal/civilized settings</td>
      </tr>
      <tr>
        <td><strong>Void Born</strong></td>
        <td>-5 S, +5 WP</td>
        <td><span class="rt-skill">Speak Language (Ship Dialect)</span>, Navigate (Stellar) and Pilot (Spacecraft) become Basic skills</td>
        <td>-5 Fel with non-void born, adapted to zero-G</td>
      </tr>
      <tr>
        <td><strong>Forge World</strong></td>
        <td>-5 WS, +5 Int<br>+3 to any one other</td>
        <td><span class="rt-skill">Common Lore (Tech), Common Lore (Machine Cult)</span>, <span class="rt-talent">Technical Knock</span></td>
        <td>-10 to Common Lore (Imperial Creed), -5 Fel with Ecclesiarchy</td>
      </tr>
      <tr>
        <td><strong>Hive World</strong></td>
        <td>-5 T, +5 Fel</td>
        <td><span class="rt-skill">Speak Language (Hive Dialect), Tech-Use</span>, crowds don't count as difficult terrain</td>
        <td>-10 to Survival in natural environments, -5 Int to resist disease, +1 Initiative</td>
      </tr>
      <tr>
        <td><strong>Imperial World</strong></td>
        <td>+3 WP</td>
        <td><span class="rt-skill">Literacy, Speak Language (High Gothic), Common Lore (Imperial Creed, Imperium, War)</span></td>
        <td>-5 to all Forbidden Lore tests (blessed ignorance)</td>
      </tr>
      <tr>
        <td><strong>Noble Born</strong></td>
        <td>-5 WP, +5 Fel</td>
        <td><span class="rt-skill">Literacy, Speak Language (High Gothic, Low Gothic)</span>, <span class="rt-talent">Peer (Nobility)</span>, +1 Profit Factor</td>
        <td>Gain powerful enemy, cannot take tests for Low Gothic (too refined)</td>
      </tr>
      <tr>
        <td><strong>Child of Dynasty</strong></td>
        <td>-3 T, +3 Int<br>-5 WP, +5 Fel</td>
        <td><span class="rt-skill">Literacy, Speak Language (High Gothic)</span>, +3 Ship Points, +5 to Fel tests with nobility, <span class="rt-talent">Enemy</span> (rival dynasty)</td>
        <td>Born into a Rogue Trader dynasty with legacy expectations</td>
      </tr>
    </tbody>
  </table>

  <div class="rt-callout">
    <h3>🎭 Roleplaying Your Home World</h3>
    <p>Your home world isn't just mechanics—it's your character's core identity and worldview:</p>
    <ul class="rt-list">
      <li><strong>Death Worlders</strong> are blunt, savage, and uncomfortable in "soft" civilization. They value strength and survival above all.</li>
      <li><strong>Void Born</strong> see planets as strange and unnatural. They trust their ship like family and are most comfortable in the void.</li>
      <li><strong>Forge Worlders</strong> revere the Machine God and see the universe through the lens of technology. They speak in binary cant and tech-jargon.</li>
      <li><strong>Hive Worlders</strong> are street-smart, cynical, and adaptable. They know how to navigate crowds and read social hierarchies.</li>
      <li><strong>Imperial Worlders</strong> are pious, dutiful, and sometimes naive. They believe in the Emperor's protection and Imperial righteousness.</li>
      <li><strong>Noble Born</strong> carry themselves with authority and expect deference. They may be entitled but understand politics and social manipulation.</li>
      <li><strong>Children of Dynasty</strong> grew up amid Rogue Trader luxury and intrigue. They carry the weight of legacy and family expectations.</li>
    </ul>
  </div>

  <div class="rt-section">
    <h2>🔗 Implementation</h2>
    <p>To apply your home world:</p>
    <ol class="rt-list">
      <li>Open the <strong>RT Items: Origin Path</strong> compendium</li>
      <li>Find your chosen home world (e.g., "Forge World")</li>
      <li>Drag it onto your character sheet</li>
      <li>The system automatically applies characteristic bonuses and grants skills/talents!</li>
      <li>If you gain a skill you already have, it upgrades to +10 (then +20)</li>
    </ol>
  </div>

  <div class="rt-example">
    <h4>Example: Katelina Krimson</h4>
    <p><strong>Home World:</strong> Child of Dynasty</p>
    <p><strong>Effects:</strong></p>
    <ul class="rt-list">
      <li>Characteristics: -3 T, +3 Int, -5 WP, +5 Fel</li>
      <li>Skills: Literacy, High Gothic</li>
      <li>Dynasty: +3 Ship Points</li>
      <li>Social: +5 to Fellowship tests with nobility</li>
      <li>Complication: Enemy talent (rival dynasty seeks her downfall)</li>
    </ul>
    <p><em>"Born into the ambitious Krimson Dynasty, Katelina grew up amid court intrigue and expects respect from her bloodline alone. She must prove herself worthy of inheriting the dynasty's Warrant of Trade."</em></p>
  </div>
</div>`
    },
    sort: sortOrder,
    flags: {}
  });
  sortOrder += 100000;

  return {
    name: 'Character Creation',
    img: 'icons/svg/book.svg',
    pages,
    flags: {},
    _id: 'koPySvFXZhwQlpXs'
  };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  🎭 ROGUE TRADER VTT - ENHANCED JOURNAL GENERATOR');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');

// Generate Character Creation journal
console.log('📖 Generating Character Creation Journal...');
const charCreation = generateCharacterCreation();
console.log(`   ✅ Generated ${charCreation.pages.length} pages`);
charCreation.pages.forEach((page, idx) => {
  const charCount = page.text.content.length;
  console.log(`   ${(idx + 1).toString().padStart(2, ' ')}. ${page.name.padEnd(35)} (${charCount.toLocaleString()} chars)`);
});

// Backup and write
const charCreationPath = 'src/packs/rt-journals-character-creation/_source/character-creation_koPySvFXZhwQlpXs.json';
console.log('');
console.log('💾 Saving Character Creation...');
backupFile(charCreationPath);
writeJournal(charCreationPath, charCreation);

console.log('');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ✅ COMPLETE - Enhanced journals generated successfully!');
console.log('═══════════════════════════════════════════════════════════════');
console.log('');
console.log('📊 Summary:');
console.log(`   • Character Creation: ${charCreation.pages.length} pages`);
console.log('');
console.log('🚀 Next Steps:');
console.log('   1. Run: npm run build');
console.log('   2. Launch Foundry and check the journals');
console.log('   3. Verify styling and navigation');
console.log('');
console.log('💡 To expand: Add more page generators for remaining journals');
console.log('   (Character Actions, Fear/Insanity, Ship Combat, Colonies)');
console.log('');
