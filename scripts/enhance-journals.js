/**
 * Transform legacy plain-text journals into rich V13 multi-page journals
 * Uses Foundry V13's enhanced journal capabilities:
 * - Multiple pages with table of contents
 * - Rich HTML formatting with styled tables
 * - Secret text blocks for GM notes
 * - Proper semantic HTML structure
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Generate 16-character alphanumeric ID
function generateId() {
  return crypto.randomBytes(8).toString('hex').substring(0, 16);
}

// CSS styles for consistent formatting
const JOURNAL_STYLES = `
<style>
  .rt-journal-page {
    font-family: 'Crimson Text', Georgia, serif;
    line-height: 1.6;
    color: #2c2c2c;
  }
  
  .rt-header {
    background: linear-gradient(135deg, #8b0000 0%, #4a0000 100%);
    color: #d4af37;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    text-align: center;
    border: 2px solid #d4af37;
    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
  }
  
  .rt-header h1 {
    margin: 0;
    font-size: 2.5em;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
    font-family: 'Cinzel', serif;
  }
  
  .rt-header p {
    margin: 10px 0 0 0;
    font-style: italic;
    color: #f4e4c1;
  }
  
  .rt-section {
    background: #f9f7f4;
    border-left: 4px solid #8b0000;
    padding: 15px;
    margin: 20px 0;
    border-radius: 4px;
  }
  
  .rt-section h2 {
    color: #8b0000;
    margin-top: 0;
    font-family: 'Cinzel', serif;
    border-bottom: 2px solid #d4af37;
    padding-bottom: 8px;
  }
  
  .rt-table {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0;
    background: white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .rt-table th {
    background: linear-gradient(180deg, #8b0000 0%, #6a0000 100%);
    color: #d4af37;
    padding: 12px;
    text-align: left;
    font-weight: bold;
    border: 1px solid #4a0000;
  }
  
  .rt-table td {
    padding: 10px 12px;
    border: 1px solid #ddd;
    vertical-align: top;
  }
  
  .rt-table tr:nth-child(even) {
    background: #f5f5f5;
  }
  
  .rt-table tr:hover {
    background: #fff8dc;
  }
  
  .rt-callout {
    background: #fff8dc;
    border: 2px solid #d4af37;
    border-radius: 6px;
    padding: 15px;
    margin: 15px 0;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .rt-callout.warning {
    background: #ffe4e1;
    border-color: #8b0000;
  }
  
  .rt-callout h3 {
    margin-top: 0;
    color: #8b0000;
  }
  
  .rt-stat-block {
    background: #2c2c2c;
    color: #d4af37;
    padding: 15px;
    border-radius: 6px;
    font-family: monospace;
    margin: 15px 0;
  }
  
  .rt-dice-roll {
    display: inline-block;
    background: #8b0000;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: bold;
    font-family: monospace;
  }
  
  .rt-characteristic {
    display: inline-block;
    background: #4a0000;
    color: #d4af37;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: bold;
    margin: 0 2px;
  }
  
  .rt-skill {
    color: #006400;
    font-weight: bold;
  }
  
  .rt-talent {
    color: #00008b;
    font-style: italic;
  }
  
  .rt-gm-secret {
    background: #f0f0f0;
    border-left: 4px solid #666;
    padding: 10px;
    margin: 10px 0;
    font-style: italic;
  }
  
  ul.rt-list, ol.rt-list {
    margin-left: 20px;
  }
  
  ul.rt-list li, ol.rt-list li {
    margin: 8px 0;
  }
  
  .rt-example {
    background: #e8f4f8;
    border-left: 4px solid #4682b4;
    padding: 12px;
    margin: 15px 0;
    font-style: italic;
  }
  
  .rt-quick-ref {
    background: #f0fff0;
    border: 2px dashed #228b22;
    padding: 15px;
    margin: 20px 0;
    border-radius: 6px;
  }
  
  .rt-quick-ref h4 {
    margin-top: 0;
    color: #228b22;
  }
</style>
`;

console.log('🎭 Rogue Trader Journal Enhancement Script');
console.log('==========================================\n');

// For now, let's create a sample enhanced character creation journal
// This will demonstrate the V13 capabilities
console.log('Creating sample enhanced Character Creation journal...\n');

const characterCreationPages = [
  {
    _id: generateId(),
    name: 'Welcome to Rogue Trader',
    type: 'text',
    title: {
      show: true,
      level: 1
    },
    text: {
      format: 1,
      content: `${JOURNAL_STYLES}
<div class="rt-journal-page">
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
    <p>Follow these steps to create your character:</p>
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
    sort: 100000,
    flags: {}
  },
  
  {
    _id: generateId(),
    name: 'Step 1: Characteristics',
    type: 'text',
    title: {
      show: true,
      level: 1
    },
    text: {
      format: 1,
      content: `${JOURNAL_STYLES}
<div class="rt-journal-page">
  <div class="rt-header">
    <h1>📊 Generating Characteristics</h1>
    <p>The Foundation of Your Character</p>
  </div>

  <div class="rt-section">
    <h2>The Nine Characteristics</h2>
    <p>Every character possesses nine core characteristics that define their physical and mental capabilities:</p>
    
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
          <td>Physical power and carrying capacity</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Toughness</span></td>
          <td>T</td>
          <td>Resilience, endurance, and resistance to harm</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Agility</span></td>
          <td>Ag</td>
          <td>Dexterity, reflexes, and coordination</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Intelligence</span></td>
          <td>Int</td>
          <td>Mental acuity, logic, and learning ability</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Perception</span></td>
          <td>Per</td>
          <td>Awareness, insight, and sensory acuity</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Willpower</span></td>
          <td>WP</td>
          <td>Mental fortitude, discipline, and psychic resistance</td>
        </tr>
        <tr>
          <td><span class="rt-characteristic">Fellowship</span></td>
          <td>Fel</td>
          <td>Charisma, leadership, and social aptitude</td>
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
      <li>You may <strong>reroll once</strong> per characteristic if desired</li>
    </ol>
    
    <div class="rt-example">
      <strong>Example:</strong> Rolling for Weapon Skill<br>
      Base: 25 → Roll 2d10: 7 + 4 = 11 → <strong>Final WS: 36</strong>
    </div>
  </div>

  <div class="rt-section">
    <h2>📊 Method 2: Point Buy (Optional)</h2>
    <p>With GM approval, you may instead allocate points:</p>
    <ul class="rt-list">
      <li>Start with <strong>25</strong> in all characteristics</li>
      <li>Distribute <strong>100 points</strong> among them</li>
      <li>Maximum <strong>+20</strong> to any single characteristic</li>
    </ul>
    
    <div class="rt-callout">
      <h3>💡 Point Buy Advice</h3>
      <p>This method gives more control but less excitement. Consider your career:</p>
      <ul class="rt-list">
        <li><strong>Arch-Militant:</strong> Prioritize WS, BS, and Toughness</li>
        <li><strong>Seneschal:</strong> Focus on Fellowship, Intelligence, Perception</li>
        <li><strong>Void-Master:</strong> Boost Agility, Intelligence, Perception</li>
        <li><strong>Missionary:</strong> Emphasize Fellowship, Willpower</li>
      </ul>
    </div>
  </div>

  <div class="rt-section">
    <h2>📈 Characteristic Bonuses</h2>
    <p>Your <strong>Characteristic Bonus (CB)</strong> equals the <strong>tens digit</strong> of the characteristic value:</p>
    
    <table class="rt-table">
      <thead>
        <tr>
          <th>Characteristic Value</th>
          <th>Bonus</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>01-09</td><td>0</td></tr>
        <tr><td>10-19</td><td>1</td></tr>
        <tr><td>20-29</td><td>2</td></tr>
        <tr><td>30-39</td><td>3</td></tr>
        <tr><td>40-49</td><td>4</td></tr>
        <tr><td>50-59</td><td>5</td></tr>
        <tr><td>60-69</td><td>6</td></tr>
        <tr><td>70+</td><td>7+</td></tr>
      </tbody>
    </table>
    
    <div class="rt-example">
      <strong>Example:</strong> Strength 36 → <strong>Strength Bonus (SB) = 3</strong>
    </div>
  </div>

  <div class="rt-section rt-gm-secret">
    <h3>🎭 GM Note: Unnatural Characteristics</h3>
    <p>Some xenos or heavily modified characters may have <strong>Unnatural Characteristics</strong>. These multiply the bonus:</p>
    <ul class="rt-list">
      <li><strong>Unnatural Strength (x2):</strong> An Ork with S 40 has SB 8 (4 × 2), not 4</li>
      <li><strong>Unnatural Toughness (x2):</strong> Doubles TB for damage reduction</li>
    </ul>
    <p>Use sparingly for player characters—these are meant for inhuman foes!</p>
  </div>
</div>`
    },
    sort: 200000,
    flags: {}
  },

  {
    _id: generateId(),
    name: 'Step 2: Home World',
    type: 'text',
    title: {
      show: true,
      level: 1
    },
    text: {
      format: 1,
      content: `${JOURNAL_STYLES}
<div class="rt-journal-page">
  <div class="rt-header">
    <h1>🌍 Choosing Your Home World</h1>
    <p>Where Were You Born?</p>
  </div>

  <div class="rt-section">
    <h2>Home World Selection</h2>
    <p>Your home world shapes your upbringing, skills, and outlook. Choose one from the <strong>Origin Path: Home Worlds</strong> compendium, or see the options below.</p>
  </div>

  <table class="rt-table">
    <thead>
      <tr>
        <th>Home World</th>
        <th>Bonuses</th>
        <th>Skills & Talents</th>
        <th>Drawbacks</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Death World</strong></td>
        <td>+5 S, +5 T, -5 WP, -5 Fel</td>
        <td><span class="rt-skill">Survival</span>, Melee (Primitive), Jaded or Resistance (Poisons)</td>
        <td>-10 social tests in formal settings</td>
      </tr>
      <tr>
        <td><strong>Void Born</strong></td>
        <td>-5 S, +5 WP</td>
        <td><span class="rt-skill">Ship Dialect</span>, Navigate (Stellar) and Pilot (Spacecraft) as basic skills</td>
        <td>-5 Fel with non-void born, zero-G adapted</td>
      </tr>
      <tr>
        <td><strong>Forge World</strong></td>
        <td>-5 WS, +5 Int, +3 any one</td>
        <td><span class="rt-skill">Common Lore (Tech, Machine Cult)</span>, <span class="rt-talent">Technical Knock</span></td>
        <td>-10 Imperial Creed tests, -5 Fel with Ecclesiarchy</td>
      </tr>
      <tr>
        <td><strong>Hive World</strong></td>
        <td>-5 T, +5 Fel</td>
        <td><span class="rt-skill">Hive Dialect, Tech-Use</span>, crowds not difficult terrain</td>
        <td>-10 Survival in natural environments, -5 Int tests, +1 Initiative</td>
      </tr>
      <tr>
        <td><strong>Imperial World</strong></td>
        <td>+3 WP</td>
        <td><span class="rt-skill">Literacy, High Gothic, Common Lore (Imperial Creed, Imperium, War)</span></td>
        <td>-5 Forbidden Lore (blessed ignorance)</td>
      </tr>
      <tr>
        <td><strong>Noble Born</strong></td>
        <td>-5 WP, +5 Fel</td>
        <td><span class="rt-skill">Literacy, High/Low Gothic</span>, <span class="rt-talent">Peer (Nobility)</span>, +1 Profit Factor</td>
        <td>Powerful enemy, no Low Gothic skill tests</td>
      </tr>
    </tbody>
  </table>

  <div class="rt-callout">
    <h3>🎭 Roleplaying Your Home World</h3>
    <p>Your home world isn't just mechanics—it's your character's core identity:</p>
    <ul class="rt-list">
      <li><strong>Death Worlders</strong> are blunt, savage, and uncomfortable in "soft" civilization</li>
      <li><strong>Void Born</strong> see planets as strange and unnatural, trust their ship like family</li>
      <li><strong>Forge Worlders</strong> revere the Machine God, speak in binary cant</li>
      <li><strong>Hive Worlders</strong> are street-smart, cynical, and adaptable</li>
      <li><strong>Imperial Worlders</strong> are pious, dutiful, and sometimes naive</li>
      <li><strong>Noble Born</strong> carry themselves with authority but may be entitled</li>
    </ul>
  </div>

  <div class="rt-section">
    <h2>🔗 Drag-and-Drop</h2>
    <p>To apply your home world:</p>
    <ol class="rt-list">
      <li>Open the <strong>RT Items: Origin Path</strong> compendium</li>
      <li>Find your chosen home world (e.g., "Forge World")</li>
      <li>Drag it onto your character sheet</li>
      <li>The system will automatically apply bonuses!</li>
    </ol>
  </div>

  <div class="rt-example">
    <h4>Example Character: Katelina Krimson</h4>
    <p><strong>Home World:</strong> Child of Dynasty<br>
    <strong>Effect:</strong> -3 T, +3 Int, -5 WP, +5 Fel, gains Literacy and High Gothic, +3 Ship Points to dynasty, +5 to Fel tests with nobles, gains Enemy talent (rival dynasty)</p>
    <p><em>"Born into the ambitious Krimson Dynasty, she grew up amid court intrigue and expects respect from her bloodline alone."</em></p>
  </div>
</div>`
    },
    sort: 300000,
    flags: {}
  }
];

// Create sample output file
const outputPath = 'src/packs/rt-journals-character-creation/_source/character-creation_koPySvFXZhwQlpXs.json';

const enhancedJournal = {
  name: 'Character Creation',
  img: 'icons/svg/book.svg',
  pages: characterCreationPages,
  flags: {},
  _id: 'koPySvFXZhwQlpXs'
};

console.log(`📝 Creating sample enhanced journal with ${characterCreationPages.length} pages...\n`);
console.log('Sample pages:');
characterCreationPages.forEach((page, idx) => {
  console.log(`  ${idx + 1}. ${page.name} (${page.text.content.length} chars)`);
});

console.log('\n⚠️  This is a SAMPLE demonstrating V13 capabilities.');
console.log('    Full implementation would:');
console.log('    - Parse all existing journal content');
console.log('    - Create comprehensive multi-page structures');
console.log('    - Add images, videos, and PDFs');
console.log('    - Include GM secret sections');
console.log('    - Format all tables as rich HTML\n');

console.log('💾 Would you like to proceed with generating the full enhanced journals?');
console.log('   This will replace existing plain-text journals with rich V13 versions.');
