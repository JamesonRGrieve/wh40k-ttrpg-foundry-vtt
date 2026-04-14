import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PDF_ROOT = path.resolve(ROOT, '..', '.pdf');
const PACK_ROOT = path.join(ROOT, 'src', 'packs');
const SYSTEM_JSON_PATH = path.join(ROOT, 'src', 'system.json');

const PACK_OWNERSHIP = {
  PLAYER: 'OBSERVER',
  ASSISTANT: 'OWNER',
};

const BOOKS = [
  {
    code: 'dw-achilus',
    groupDir: 'deathwatch',
    family: 'Deathwatch',
    folderName: 'The Achilus Assault',
    title: 'The Achilus Assault',
    sourceLabel: 'DW: The Achilus Assault',
    pdfPath: '/home/jameson/Documents/pdfs/dw/achilus.pdf',
    markdownPath: path.join(PDF_ROOT, 'dw', 'achilus', 'achilus.md'),
    create: { journals: true, npc: true },
  },
  {
    code: 'dw-chosen',
    groupDir: 'deathwatch',
    family: 'Deathwatch',
    folderName: "The Emperor's Chosen",
    title: "The Emperor's Chosen",
    sourceLabel: "DW: The Emperor's Chosen",
    pdfPath: '/home/jameson/Documents/pdfs/dw/chosen.pdf',
    markdownPath: path.join(PDF_ROOT, 'dw', 'chosen', 'chosen.md'),
    create: { journals: true },
  },
  {
    code: 'dw-jericho',
    groupDir: 'deathwatch',
    family: 'Deathwatch',
    folderName: 'The Jericho Reach',
    title: 'The Jericho Reach',
    sourceLabel: 'DW: The Jericho Reach',
    pdfPath: '/home/jameson/Documents/pdfs/dw/jericho.pdf',
    markdownPath: path.join(PDF_ROOT, 'dw', 'jericho', 'jericho.md'),
    create: { journals: true, npc: true },
  },
  {
    code: 'dw-outer',
    groupDir: 'deathwatch',
    family: 'Deathwatch',
    folderName: 'The Outer Reach',
    title: 'The Outer Reach',
    sourceLabel: 'DW: The Outer Reach',
    pdfPath: '/home/jameson/Documents/pdfs/dw/outer.pdf',
    markdownPath: path.join(PDF_ROOT, 'dw', 'outer', 'outer.md'),
    create: { journals: true, npc: true, vehicle: true },
  },
  {
    code: 'ow-enemies',
    groupDir: 'only-war',
    family: 'Only War',
    folderName: 'Enemies of the Imperium',
    title: 'Enemies of the Imperium',
    sourceLabel: 'OW: Enemies of the Imperium',
    pdfPath: '/home/jameson/Documents/pdfs/ow/enemies.pdf',
    markdownPath: path.join(PDF_ROOT, 'ow', 'enemies', 'enemies.md'),
    create: { journals: true, npc: true, vehicle: true },
  },
  {
    code: 'ow-surrender',
    groupDir: 'only-war',
    family: 'Only War',
    folderName: 'No Surrender',
    title: 'No Surrender',
    sourceLabel: 'OW: No Surrender',
    pdfPath: '/home/jameson/Documents/pdfs/ow/surrender.pdf',
    markdownPath: path.join(PDF_ROOT, 'ow', 'surrender', 'surrender.md'),
    create: { journals: true },
  },
  {
    code: 'rt-abyss',
    groupDir: 'rogue-trader',
    family: 'Rogue Trader',
    folderName: 'Edge of the Abyss',
    title: 'Edge of the Abyss',
    sourceLabel: 'RT: Edge of the Abyss',
    pdfPath: '/home/jameson/Documents/pdfs/rt/abyss.pdf',
    markdownPath: path.join(PDF_ROOT, 'rt', 'abyss', 'abyss.md'),
    create: { journals: true, npc: true, vehicle: true, ship: true },
  },
  {
    code: 'rt-koronus',
    groupDir: 'rogue-trader',
    family: 'Rogue Trader',
    folderName: 'Koronus Bestiary',
    title: 'Koronus Bestiary',
    sourceLabel: 'RT: Koronus Bestiary',
    pdfPath: '/home/jameson/Documents/pdfs/rt/bestiary.pdf',
    markdownPath: path.join(PDF_ROOT, 'rt', 'bestiary', 'bestiary.md'),
    create: { journals: true, npc: true },
  },
  {
    code: 'rt-kin',
    groupDir: 'rogue-trader',
    family: 'Rogue Trader',
    folderName: 'The Dark Kin',
    title: 'The Dark Kin',
    sourceLabel: 'RT: The Dark Kin',
    pdfPath: '/home/jameson/Documents/pdfs/rt/kin.pdf',
    markdownPath: path.join(PDF_ROOT, 'rt', 'kin', 'kin.md'),
    create: { journals: true },
  },
];

const PACK_DEFS = [
  ['journals', 'JournalEntry', 'Reference', 'icons/svg/book.svg'],
  ['npc', 'Actor', 'Bestiary', 'icons/svg/mystery-man.svg'],
  ['vehicle', 'Actor', 'Vehicles', 'icons/svg/car.svg'],
  ['ship', 'Actor', 'Ships', 'icons/svg/ship.svg'],
];

const SIZE_MAP = {
  puny: 2,
  scrawny: 3,
  average: 4,
  hulking: 5,
  massive: 6,
  enormous: 7,
  monumental: 8,
};

const REJECTED_NAMES = [
  /^\d+$/i,
  /^front matter$/i,
  /^monster$/i,
  /^sergeant$/i,
  /^killing machines$/i,
  /^special rules$/i,
  /^strategy$/i,
  /^engagement$/i,
  /^tactics$/i,
  /^combat tactics$/i,
  /^history and culture$/i,
  /^weapons$/i,
  /^gm advice/i,
  /^chemical enhancement$/i,
  /^profiles and equipment$/i,
  /^below is\b/i,
  /^this base\b/i,
  /^few planets\b/i,
  /^since then\b/i,
  /^many of these\b/i,
  /^one unusual\b/i,
  /^it is rare\b/i,
  /^in battle\b/i,
  /^on ork ships\b/i,
  /^the beasts\b/i,
  /^the following$/i,
  /^the battle of feldarra prime$/i,
  /^rumoured activities$/i,
  /^the chorda trade dynasty$/i,
  /^universal sorcery rules$/i,
  /^winterscale dynasty$/i,
  /^adventures on cuyavale$/i,
  /^strategies$/i,
  /^gmadvice/i,
  /^deathly silence$/i,
  /^desert treasures$/i,
  /^eaters of the dead$/i,
  /^evolved to hunt$/i,
  /^flesh and crystal$/i,
  /^glacial predation$/i,
  /^guardian of the dead$/i,
  /^hidden masters$/i,
  /^humanoid but no longer human$/i,
  /^nightmare hunters$/i,
  /^razorwing sightings$/i,
  /^stalker in the heights$/i,
  /^stalkers on other worlds$/i,
  /^tales from vaporius$/i,
  /^the shipbreaker run$/i,
  /^unending thirst$/i,
  /^xenos base$/i,
];

const EXCLUDED_DOC_SLUGS = {
  'ow-enemies:npc': new Set([
    'adventures-on-cuyavale',
    'gmadvice-using-chaos-spawn',
    'strategies',
  ]),
  'rt-koronus:npc': new Set([
    'eaters-of-the-dead',
    'evolved-to-hunt',
    'flesh-and-crystal',
    'glacial-predation',
    'guardian-of-the-dead',
    'stalker-in-the-heights',
    'the-shipbreaker-run',
    'unending-thirst',
    'xenos-base',
  ]),
};

function hashId(seed, length = 16) {
  return crypto.createHash('sha1').update(seed).digest('hex').slice(0, length);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function stripMarkdown(value) {
  return String(value)
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/<span[^>]*>.*?<\/span>/g, '')
    .replace(/<sup[^>]*>(.*?)<\/sup>/g, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/[*_`>#]/g, ' ')
    .replace(/\[[^\]]+]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSourceText(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ')
    .replace(/\uFFFD/g, '')
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2212/g, '-');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<pre[^>]*>/gi, '')
    .replace(/<\/pre>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(value) {
  return String(value)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function emptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDir(dirPath);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function splitTopLevel(input, separator = ',') {
  const parts = [];
  let current = '';
  let depth = 0;
  for (const char of input) {
    if (char === '(' || char === '[') depth += 1;
    if (char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitJournalSections(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = { title: 'Front Matter', lines: [] };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,2})\s+(.+)$/);
    if (headingMatch) {
      if (current.lines.length) sections.push(current);
      current = {
        title: stripMarkdown(headingMatch[2]) || 'Section',
        lines: [line],
      };
      continue;
    }
    current.lines.push(line);
  }

  if (current.lines.length) sections.push(current);

  const pages = [];
  for (const section of sections) {
    const content = section.lines.join('\n').trim();
    if (!content) continue;

    if (content.length <= 24000) {
      pages.push({
        title: section.title,
        content,
      });
      continue;
    }

    const subparts = [];
    let chunk = { title: section.title, lines: [] };
    for (const line of section.lines) {
      const subheadingMatch = line.match(/^#{3,6}\s+(.+)$/);
      if (subheadingMatch && chunk.lines.length && chunk.lines.join('\n').length > 12000) {
        subparts.push(chunk);
        chunk = {
          title: `${section.title}: ${stripMarkdown(subheadingMatch[1]) || 'Part'}`,
          lines: [line],
        };
        continue;
      }
      chunk.lines.push(line);
    }
    if (chunk.lines.length) subparts.push(chunk);

    let splitIndex = 1;
    for (const part of subparts) {
      const partContent = part.lines.join('\n').trim();
      if (!partContent) continue;
      if (partContent.length <= 24000) {
        pages.push({ title: part.title, content: partContent });
        continue;
      }
      for (let offset = 0; offset < part.lines.length; offset += 220) {
        const slice = part.lines.slice(offset, offset + 220).join('\n').trim();
        if (!slice) continue;
        pages.push({
          title: `${part.title} (${splitIndex})`,
          content: slice,
        });
        splitIndex += 1;
      }
    }
  }

  return pages;
}

function cleanCandidateName(value) {
  return stripMarkdown(value)
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\|+/, '')
    .replace(/\|+$/, '')
    .replace(/\b(?:base\s+)?profile\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGenericName(name) {
  if (!name) return true;
  if (name.length > 72) return true;
  if (/[.!?]/.test(name)) return true;
  if (name.split(/\s+/).length > 10) return true;
  return REJECTED_NAMES.some((pattern) => pattern.test(name));
}

function isNameCandidateLine(rawLine) {
  return extractNameCandidates(rawLine).length > 0;
}

function findNearestNameStart(lines, index, lookback = 40) {
  const minimum = Math.max(0, index - lookback);
  for (let cursor = index; cursor >= minimum; cursor -= 1) {
    if (isNameCandidateLine(lines[cursor])) {
      return cursor;
    }
  }
  return Math.max(0, index - 6);
}

function findNextHeading(lines, start, maxForward = 80) {
  const limit = Math.min(lines.length, start + maxForward);
  for (let cursor = start + 1; cursor < limit; cursor += 1) {
    if (/^#{1,6}\s+/.test(lines[cursor].trim()) && isNameCandidateLine(lines[cursor])) {
      return cursor;
    }
  }
  return Math.min(lines.length, start + 20);
}

function buildJournal(book, markdown) {
  const journalId = hashId(`${book.code}:journal`);
  const pages = splitJournalSections(markdown).map((section, index) => ({
    _id: hashId(`${book.code}:page:${index}`),
    name: section.title || `Page ${index + 1}`,
    type: 'text',
    title: { show: true, level: 1 },
    text: {
      format: 1,
      content: `<pre style="white-space: pre-wrap;">${escapeHtml(section.content)}</pre>`,
    },
    sort: (index + 1) * 100000,
    flags: {},
  }));

  return {
    name: `${book.title} Reference`,
    img: 'icons/svg/book.svg',
    pages,
    flags: {},
    _id: journalId,
  };
}

function deriveName(lines) {
  const candidates = lines
    .slice(0, 12)
    .flatMap((line) => extractNameCandidates(line))
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.name || '';
}

function splitStructuredLine(rawLine) {
  const line = String(rawLine || '').trimEnd();
  if (!line.trim()) return [''];

  const splitOnKeywords = (value) =>
    value
      .split(/\s{5,}(?=(?:WS\b|Movement:|Armou?r:|Skills:|Talents:|Traits:|Weapons:|Gear:|Type:|Tactical Speed:|Cruising Speed:|Manoeuvrability:|Structural Integrity:|Speed:|Void Shields:|Turret Rating:|Class:|Dimensions:|Mass:|Crew:|Accel\.?:|Special Rules\b))/)
      .map((entry) => entry.trim())
      .filter(Boolean);

  const parts = line
    .split(/\s{18,}/)
    .flatMap((entry) => splitOnKeywords(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);

  return parts.length ? parts : [line.trim()];
}

function getLogicalLines(markdown) {
  return normalizeSourceText(markdown)
    .split('\n')
    .flatMap((line) => splitStructuredLine(line));
}

function toTitleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function scoreNameCandidate(rawSegment) {
  const line = String(rawSegment || '').trim();
  if (!line || line.startsWith('![')) return null;
  const name = cleanCandidateName(line);
  if (isGenericName(name)) return null;
  if (/\b(?:Movement|Wounds|Armou?r|Skills|Talents|Traits|Weapons|Gear|Type|Tactical Speed|Cruising Speed|Manoeuvrability|Structural Integrity|Speed|Void Shields|Hull Integrity)\b/i.test(line)) {
    return null;
  }

  let score = 0;
  if (/\((Master|Elite|Troop|Minion|Vehicle)\)/i.test(line)) score += 120;
  if (/\bProfile\b/i.test(line)) score += 90;
  if (/^#{1,6}\s+/.test(line)) score += 50;
  if (/^\*{0,2}[A-Z0-9][A-Z0-9' ,\-()/]+?\*{0,2}$/.test(line)) score += 35;
  if (/^[A-Z][A-Za-z0-9'’\-]+(?: [A-Z][A-Za-z0-9'’\-(),]+){0,7}$/.test(line)) score += 30;
  if (line === line.toUpperCase() && line.split(/\s+/).length <= 6) score += 15;
  if (/[:,;]/.test(line) && !/\bProfile\b/i.test(line)) score -= 20;

  return score > 0 ? { name, score } : null;
}

function extractNameCandidates(rawLine) {
  const seen = new Set();
  const candidates = [];
  for (const segment of splitStructuredLine(rawLine)) {
    const candidate = scoreNameCandidate(segment);
    if (!candidate) continue;
    const key = slugify(candidate.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

function findBestNameAround(lines, anchorIndex, lookback = 20, lookahead = 4) {
  let best = null;
  const minimum = Math.max(0, anchorIndex - lookback);
  const maximum = Math.min(lines.length - 1, anchorIndex + lookahead);

  for (let cursor = minimum; cursor <= maximum; cursor += 1) {
    for (const candidate of extractNameCandidates(lines[cursor])) {
      const distance = Math.abs(anchorIndex - cursor);
      let score = candidate.score - (distance * 6);
      if (cursor <= anchorIndex) score += 10;
      if (cursor > anchorIndex) score -= 10;
      if (!best || score > best.score) {
        best = { ...candidate, score, index: cursor };
      }
    }
  }

  return best;
}

function isStrongHeadingLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return false;
  if (/\((Master|Elite|Troop|Minion|Vehicle)\)/i.test(line)) return true;
  if (/\bProfile\b/i.test(line)) return true;

  const cleaned = cleanCandidateName(line);
  if (isGenericName(cleaned)) return false;
  const words = cleaned.split(/\s+/);
  return words.length >= 2 && words.length <= 8 && cleaned === cleaned.toUpperCase();
}

function findSection(block, label, nextLabels = []) {
  const normalized = block.replace(/\r/g, '');
  const labels = nextLabels.length ? `(?=${nextLabels.map((entry) => `(?:\\*\\*)?${entry}`).join('|')}|$)` : '(?=$)';
  const regex = new RegExp(`(?:\\*\\*)?${label}(?:\\*\\*)?\\s*:?\\s*([\\s\\S]*?)${labels}`, 'i');
  const match = normalized.match(regex);
  return match ? normalizeText(match[1]) : '';
}

function parseWeaponEntry(entry) {
  const cleaned = normalizeText(entry)
    .replace(/\s+or\s+/gi, ' or ')
    .replace(/\bRld\b/gi, 'Reload');

  const match = cleaned.match(/^(.+?)\s*\((.+)\)$/);
  if (!match) {
    return {
      name: cleaned.slice(0, 80) || 'Weapon',
      range: cleaned,
      rof: null,
      damage: null,
      pen: null,
      clip: null,
      reload: null,
      qualities: null,
    };
  }

  const name = match[1].trim();
  const detail = match[2].trim();
  const parts = splitTopLevel(detail, ';');
  let range = 'Melee';
  let rof = '-';
  let damage = '-';
  let pen = 0;
  let clip = '-';
  let reload = '-';
  const qualities = [];

  for (const part of parts) {
    if (/\d+\s*m/i.test(part)) {
      range = part.replace(/\s+/g, '');
      continue;
    }
    if (/[SBF\-]\s*\/\s*[0-9\-–]+\s*\/\s*[0-9\-–]+/i.test(part)) {
      rof = part.replace(/\s+/g, '');
      continue;
    }
    if (/\d+d\d+/i.test(part)) {
      damage = part.trim();
      continue;
    }
    if (/^Pen\b/i.test(part)) {
      const penMatch = part.match(/Pen\s*([0-9]+)/i);
      pen = penMatch ? Number(penMatch[1]) : 0;
      continue;
    }
    if (/^Clip\b/i.test(part)) {
      clip = part.replace(/^Clip\s*/i, '').trim();
      continue;
    }
    if (/^Reload\b/i.test(part)) {
      reload = part.replace(/^Reload\s*/i, '').trim();
      continue;
    }
    qualities.push(part.trim());
  }

  return {
    name,
    range,
    rof,
    damage,
    pen,
    clip,
    reload,
    qualities: qualities.join(', ') || null,
  };
}

function parseWeapons(sectionText) {
  if (!sectionText) return [];
  const flat = sectionText
    .replace(/\s+\*\s+or\s+\*\s+/gi, ', ')
    .replace(/\s+or\s+/gi, ', ')
    .replace(/\n-/g, '\n');
  const parts = splitTopLevel(flat, ',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^Gear\b/i.test(part));
  return parts.slice(0, 12).map(parseWeaponEntry);
}

function parseCharacteristics(block) {
  const lines = block.split('\n');
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = normalizeText(lines[index]);
    if (!/\bWS\b.*\bBS\b.*\bS\b.*\bT\b.*\bAg\b.*\bInt\b.*\bPer\b.*\bWP\b.*\bFel\b/i.test(header)) continue;
    const statsWindow = lines
      .slice(index + 1, Math.min(lines.length, index + 7))
      .join(' ');
    const tokens = normalizeText(statsWindow).match(/-+|\d+/g) || [];
    if (tokens.length >= 9) {
      const values = tokens.slice(-9);
      return {
        ws: values[0],
        bs: values[1],
        s: values[2],
        t: values[3],
        ag: values[4],
        int: values[5],
        per: values[6],
        wp: values[7],
        fel: values[8],
      };
    }
  }

  const tableRows = lines.filter((line) => line.trim().startsWith('|'));
  for (let index = 0; index < tableRows.length - 1; index += 1) {
    const header = normalizeText(tableRows[index]);
    if (!/\bWS\b.*\bBS\b.*\bS\b.*\bT\b.*\bAg\b.*\bInt\b.*\bPer\b.*\bWP\b.*\bFel\b/i.test(header)) continue;
    const valuesRow = tableRows[index + 1]
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    if (valuesRow.length >= 9) {
      const values = valuesRow.slice(-9).map((cell) => {
        const digits = cell.match(/-+|\d+/g);
        return digits ? digits[digits.length - 1] : '-';
      });
      return {
        ws: values[0],
        bs: values[1],
        s: values[2],
        t: values[3],
        ag: values[4],
        int: values[5],
        per: values[6],
        wp: values[7],
        fel: values[8],
      };
    }
  }

  const compact = normalizeText(block);
  const inline = compact.match(/\bWS\b.*?\bFel\b\s+(.+?)(?=\bMove(?:ment)?\b|\bWounds\b)/i);
  if (inline) {
    const tokens = inline[1].match(/-+|\d+/g) || [];
    if (tokens.length >= 9) {
      const values = tokens.slice(-9);
      return {
        ws: values[0],
        bs: values[1],
        s: values[2],
        t: values[3],
        ag: values[4],
        int: values[5],
        per: values[6],
        wp: values[7],
        fel: values[8],
      };
    }
  }

  return null;
}

function parseMoveAndWounds(block) {
  const compact = normalizeText(block);
  const moveMatch = compact.match(/\bMove(?:ment)?\b\s*:?[\s]*([0-9\/\-]+)/i);
  const woundsMatch = compact.match(/\bWounds\b\s*:?[\s]*([0-9\-]+)/i);
  return {
    move: moveMatch ? moveMatch[1] : '',
    wounds: woundsMatch ? woundsMatch[1] : '',
  };
}

function parseSize(block) {
  const compact = normalizeText(block);
  const traitMatch = compact.match(/\bSize\b\s*\(?([A-Za-z]+|\d+)\)?/i);
  return traitMatch ? traitMatch[1] : 'Average';
}

function buildNpcDoc(book, name, block, index) {
  const characteristics = parseCharacteristics(block);
  const { move, wounds } = parseMoveAndWounds(block);
  if (!characteristics || !move || !wounds) return null;

  const skills = findSection(block, 'Skills', ['Talents', 'Traits', 'Weapons', 'Armour', 'Gear', 'Special Rules']);
  const talents = findSection(block, 'Talents', ['Traits', 'Weapons', 'Armour', 'Gear', 'Special Rules']);
  const traits = findSection(block, 'Traits', ['Weapons', 'Armour', 'Gear', 'Special Rules']);
  const armour = findSection(block, 'Armour', ['Gear', 'Weapons', 'Special Rules']) || findSection(block, 'Armour (Machine)', ['Gear', 'Weapons', 'Special Rules']);
  const weaponsText = findSection(block, 'Weapons', ['Gear', 'Special Rules', 'Horde', 'Optional Weapons']);
  const gear = findSection(block, 'Gear', ['Special Rules', 'Strategy', 'Engagement', 'Combat Tactics']);
  const size = parseSize(block);
  const talentsTraits = [talents, traits].filter(Boolean).join(' | ');
  const weapons = parseWeapons(weaponsText);

  return {
    name,
    type: 'npc',
    img: 'icons/svg/mystery-man.svg',
    system: {
      characteristics,
      wounds,
      armourPoints: armour || '',
      move,
      size,
      weapons: weapons.length ? weapons : [],
      skills,
      training: '',
      talents_traits: talentsTraits,
      description: {
        value: `<p><strong>Source:</strong> ${escapeHtml(book.sourceLabel)}</p><pre style="white-space: pre-wrap;">${escapeHtml(block.trim())}</pre>`,
      },
      gameSystems: ['rt'],
    },
    effects: [],
    items: [],
    flags: {},
    _id: hashId(`${book.code}:npc:${index}:${name}`),
  };
}

function extractNpcBlocks(markdown) {
  const lines = getLogicalLines(markdown);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!isStrongHeadingLine(lines[index])) continue;

    const nameInfo = extractNameCandidates(lines[index]).sort((left, right) => right.score - left.score)[0];
    if (!nameInfo || isGenericName(nameInfo.name)) continue;

    const window = lines.slice(index, Math.min(lines.length, index + 45)).join(' ');
    const normalized = normalizeText(window);
    if (!/\bMove(?:ment)?\b.*\bWounds\b/i.test(normalized)) continue;
    if (!/\bWS\b.*\bBS\b.*\bS\b.*\bT\b.*\bAg\b.*\bInt\b.*\bPer\b.*\bWP\b.*\bFel\b/i.test(normalized)) continue;

    const blockStart = index;
    const blockEnd = Math.min(lines.length, index + 45);
    const slice = lines.slice(blockStart, blockEnd);
    const block = slice.join('\n');

    if (!/\bWeapons?\b/i.test(block)) continue;
    if (!/\bWS\b|\bBallistic Skill\b/i.test(block) && !/\|\s*WS\s*\|/i.test(block)) continue;

    const name = nameInfo.name || deriveName(slice);
    if (isGenericName(name)) continue;
    blocks.push({ name, block });
  }

  const deduped = [];
  const seen = new Set();
  for (const entry of blocks) {
    const key = slugify(entry.name);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }
  return deduped;
}

function parseVehicleBlock(book, name, block, index) {
  const compact = normalizeText(block);
  const tactical = compact.match(/Tactical Speed\s*:?[\s]*([0-9]+)/i);
  const cruising = compact.match(/Cruising Speed\s*:?[\s]*([0-9]+)/i);
  const manoeuverability = compact.match(/Manoeuvrability\s*:?[\s]*([+\-0-9/NAna]+)/i);
  const integrity = compact.match(/Structural Integrity\s*:?[\s]*([0-9]+)/i);
  const sizeText = compact.match(/Size\s*:?[\s]*([A-Za-z]+)/i);
  const armour = compact.match(/Armou?r\s*:?[\s]*Front\s*([0-9]+).*?Side\s*([0-9]+).*?Rear\s*([0-9]+)/i);
  const crew = compact.match(/Crew\s*:?[\s]*([^*]+?)(?=\bCarry|Weapons|Special Rules|$)/i);
  const carryingCapacity = compact.match(/Carry(?:ing)? Capacity\s*:?[\s]*([0-9]+)/i);
  const weapons = compact.match(/Weapons\s*:?[\s]*([^*]+?)(?=\bSpecial Rules\b|$)/i);
  if (!tactical || !cruising || !integrity || !armour) return null;

  const specialRulesSection = block.includes('Special Rules')
    ? block.slice(block.indexOf('Special Rules'))
    : '';

  const sizeDescriptor = sizeText ? sizeText[1] : 'Massive';
  const manoeuverabilityValue = manoeuverability ? Number(String(manoeuverability[1]).replace(/[^\-0-9]/g, '') || 0) : 0;

  return {
    name,
    type: 'vehicle',
    img: 'icons/svg/car.svg',
    system: {
      vehicleClass: 'ground',
      size: SIZE_MAP[sizeDescriptor.toLowerCase()] || 5,
      sizeDescriptor,
      faction: '',
      subfaction: '',
      type: 'vehicle',
      threatLevel: 0,
      armour: {
        front: { value: Number(armour[1]), descriptor: '' },
        side: { value: Number(armour[2]), descriptor: '' },
        rear: { value: Number(armour[3]), descriptor: '' },
      },
      speed: {
        cruising: Number(cruising[1]),
        tactical: Number(tactical[1]),
        notes: '',
      },
      crew: {
        required: 1,
        notes: crew ? crew[1].trim() : '',
      },
      passengers: carryingCapacity ? Number(carryingCapacity[1]) : 0,
      manoeuverability: manoeuverabilityValue,
      carryingCapacity: carryingCapacity ? Number(carryingCapacity[1]) : 0,
      integrity: {
        max: Number(integrity[1]),
        value: Number(integrity[1]),
        critical: 0,
      },
      weapons: weapons ? weapons[1].trim() : '',
      specialRules: normalizeText(specialRulesSection),
      traitsText: compact.match(/Type\s*:?[\s]*([A-Za-z ]+)/i)?.[1]?.trim() || '',
      source: book.sourceLabel,
      gameSystems: ['rt'],
      parts: [],
    },
    effects: [],
    items: [],
    flags: {},
    _id: hashId(`${book.code}:vehicle:${index}:${name}`),
  };
}

function extractVehicleBlocks(markdown) {
  const lines = getLogicalLines(markdown);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!isStrongHeadingLine(lines[index])) continue;
    const nameInfo = extractNameCandidates(lines[index]).sort((left, right) => right.score - left.score)[0];
    if (!nameInfo || isGenericName(nameInfo.name)) continue;

    const window = lines.slice(index, Math.min(lines.length, index + 30)).join(' ');
    const normalized = normalizeText(window);
    if (!/\bTactical Speed\b/i.test(normalized)) continue;
    if (!/\bStructural Integrity\b/i.test(normalized)) continue;
    if (!/\bType\b/i.test(normalized)) continue;

    const start = index;
    const end = Math.min(lines.length, index + 30);
    const slice = lines.slice(start, end);
    const name = nameInfo.name || deriveName(slice);
    if (isGenericName(name)) continue;
    blocks.push({ name, block: slice.join('\n') });
  }
  return blocks;
}

function parseShipBlock(book, name, block, index) {
  const compact = normalizeText(block);
  const speed = compact.match(/\bSpeed\b\s*:?[\s]*([0-9]+)/i);
  const manoeuverability = compact.match(/\bManoeuvrability\b\s*:?[\s]*([+\-0-9]+)/i);
  const detection = compact.match(/\bDetection\b\s*:?[\s]*([+\-0-9]+)/i);
  const armour = compact.match(/\bArmou?r\b\s*:?[\s]*([0-9]+)/i);
  const hull = compact.match(/\bHull Integrity\b\s*:?[\s]*([0-9]+)/i);
  const crewPopulation = compact.match(/\bCrew Population\b\s*:?[\s]*([0-9]+)/i);
  const shields = compact.match(/\bVoid Shields\b\s*:?[\s]*([0-9\-]+)/i);
  if (!speed || !manoeuverability || !detection || !armour || !hull) return null;

  return {
    name,
    type: 'starship',
    img: 'icons/svg/ship.svg',
    system: {
      shipType: 'Starship',
      size: '',
      crew: crewPopulation ? Number(crewPopulation[1]) : 0,
      speed: Number(speed[1]),
      manoeuvrability: Number(manoeuverability[1]),
      detection: Number(detection[1]),
      hull: Number(hull[1]),
      armour: Number(armour[1]),
      turrets: shields && shields[1] !== '-' ? Number(shields[1]) : 0,
      space: 0,
      shipPoints: 0,
      weaponCapacity: '',
      notes: '',
      source: book.sourceLabel,
      description: {
        value: `<pre style="white-space: pre-wrap;">${escapeHtml(block.trim())}</pre>`,
      },
    },
    effects: [],
    items: [],
    flags: {},
    _id: hashId(`${book.code}:ship:${index}:${name}`),
  };
}

function extractShipBlocks(markdown) {
  const lines = getLogicalLines(markdown);
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!isStrongHeadingLine(lines[index])) continue;
    const nameInfo = extractNameCandidates(lines[index]).sort((left, right) => right.score - left.score)[0];
    if (!nameInfo || isGenericName(nameInfo.name)) continue;

    const window = lines.slice(index, Math.min(lines.length, index + 36)).join(' ');
    const normalized = normalizeText(window);
    if (!/\bSpeed\b.*\bManoeuvrability\b.*\bDetection\b/i.test(normalized)) continue;
    if (!/\bHull Integrity\b/i.test(normalized)) continue;
    if (!/\bClass\b|\bDimensions\b|\bWeapon Capacity\b/i.test(normalized)) continue;

    const start = index;
    const end = Math.min(lines.length, index + 36);
    const slice = lines.slice(start, end);
    const name = nameInfo.name || deriveName(slice);
    if (isGenericName(name)) continue;
    blocks.push({ name, block: slice.join('\n') });
  }
  return blocks;
}

function buildPackEntry(packName, groupDir, label, type) {
  return {
    name: packName,
    label,
    path: `packs/${groupDir}/${packName}`,
    system: 'wh40k-rpg',
    type,
    ownership: PACK_OWNERSHIP,
    flags: {},
  };
}

function getDocSourceText(doc) {
  const description = doc?.system?.description?.value || '';
  const specialRules = doc?.system?.specialRules || '';
  return normalizeSourceText(stripHtml(`${description}\n${specialRules}`)).trim();
}

function extractExplicitNamesFromText(text) {
  const candidates = [];
  const seen = new Set();
  const source = normalizeSourceText(text);
  const patterns = [
    /([A-Z][A-Za-z0-9'’,\-]+(?: [A-Z][A-Za-z0-9'’,\-()]+){0,8} \((?:Master|Elite|Troop|Troops|Minion|Vehicle)\))/g,
    /([A-Z][A-Za-z0-9'’,\-]+(?: [A-Z][A-Za-z0-9'’,\-()]+){0,8}) Profile/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = cleanCandidateName(match[1]);
      const key = slugify(name);
      if (!key || seen.has(key) || isGenericName(name)) continue;
      seen.add(key);
      candidates.push(name);
    }
  }

  return candidates;
}

function getFirstHeadingFromText(text) {
  const lines = normalizeSourceText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^source:/i.test(line)) continue;
    if (/^(WS|Movement:|Armou?r:|Skills:|Talents:|Traits:|Weapons:|Gear:|Type:|Speed:|Tactical Speed:|Cruising Speed:)/i.test(line)) continue;
    return cleanCandidateName(line);
  }
  return '';
}

function isSuspiciousDocName(name) {
  const value = String(name || '').trim();
  if (!value) return true;
  if (isGenericName(value)) return true;
  if (/^\(?\d+(?: \(\d+\))*\)?$/i.test(value)) return true;
  if (/^[a-z]/.test(value)) return true;
  if (/\b(?:AND|OF|THE|A)$/i.test(value)) return true;
  if (/,$/.test(value)) return true;
  return false;
}

function canonicalizeDocName(kind, doc) {
  const sourceText = getDocSourceText(doc);
  const explicitNames = extractExplicitNamesFromText(sourceText);
  let name = normalizeSourceText(doc.name);

  if ((kind === 'vehicle' || kind === 'ship') && sourceText) {
    const firstHeading = getFirstHeadingFromText(sourceText);
    if (firstHeading && !isGenericName(firstHeading)) {
      name = firstHeading
        .replace(/\s+Hull:.*$/i, '')
        .replace(/[—-]\s+FLAGSHIP.*$/i, '')
        .trim();
    }
  }

  if (explicitNames.length) {
    const roleName = explicitNames.find((entry) => /\((Master|Elite|Troop|Troops|Minion|Vehicle)\)/i.test(entry));
    const preferred = roleName || explicitNames[0];
    if (isSuspiciousDocName(name) || !/\((Master|Elite|Troop|Troops|Minion|Vehicle)\)/i.test(name)) {
      name = preferred;
    }
  } else if (isSuspiciousDocName(name)) {
    const firstHeading = getFirstHeadingFromText(sourceText);
    if (firstHeading && !isGenericName(firstHeading)) {
      name = firstHeading;
    }
  }

  if (/^[A-Z0-9' ,\-()]+$/.test(name) && !/\((Master|Elite|Troop|Troops|Minion|Vehicle)\)/i.test(name)) {
    name = toTitleCase(name);
  }

  return cleanCandidateName(name)
    .replace(/\(Troops\)/i, '(Troop)')
    .trim();
}

function dedupeAndSanitizeDocs(kind, docs) {
  const bySlug = new Map();

  for (const doc of docs) {
    doc.name = canonicalizeDocName(kind, doc);
    if (isSuspiciousDocName(doc.name)) continue;

    const key = slugify(doc.name);
    if (!key) continue;

    const current = bySlug.get(key);
    const currentScore = current ? getDocSourceText(current).length : -1;
    const nextScore = getDocSourceText(doc).length;
    if (!current || nextScore > currentScore) {
      bySlug.set(key, doc);
    }
  }

  return [...bySlug.values()];
}

function getPackName(book, kind) {
  if (kind === 'journals') return `${book.code}-journals`;
  if (kind === 'npc') return `${book.code}-actors-bestiary`;
  if (kind === 'vehicle') return `${book.code}-actors-vehicles`;
  if (kind === 'ship') return `${book.code}-actors-ships`;
  throw new Error(`Unknown pack kind: ${kind}`);
}

function getPackLabel(book, suffix) {
  return `${book.title} ${suffix}`;
}

function writePackDocs(book, kind, docs) {
  const sanitizedDocs = dedupeAndSanitizeDocs(kind, docs);
  const packName = getPackName(book, kind);
  const packDir = path.join(PACK_ROOT, book.groupDir, packName, '_source');
  const excluded = EXCLUDED_DOC_SLUGS[`${book.code}:${kind}`] || new Set();
  emptyDir(packDir);
  for (const doc of sanitizedDocs) {
    if (excluded.has(slugify(doc.name))) continue;
    const fileName = `${slugify(doc.name || packName)}_${doc._id}.json`;
    writeJson(path.join(packDir, fileName), doc);
  }
  return packName;
}

function ensurePackFolder(systemData, familyName, folderName, packNames) {
  const family = systemData.packFolders.find((entry) => entry.name === familyName);
  if (!family) {
    throw new Error(`Pack family "${familyName}" not found in system.json`);
  }

  let folder = family.folders.find((entry) => entry.name === folderName);
  if (!folder) {
    folder = { name: folderName, packs: [] };
    family.folders.push(folder);
  }

  for (const packName of packNames) {
    if (!folder.packs.includes(packName)) {
      folder.packs.push(packName);
    }
  }
}

function upsertPackEntry(systemData, packEntry, insertAfterName) {
  const existingIndex = systemData.packs.findIndex((entry) => entry.name === packEntry.name);
  if (existingIndex >= 0) {
    systemData.packs[existingIndex] = packEntry;
    return;
  }

  const insertAfterIndex = systemData.packs.findIndex((entry) => entry.name === insertAfterName);
  if (insertAfterIndex >= 0) {
    systemData.packs.splice(insertAfterIndex + 1, 0, packEntry);
    return;
  }
  systemData.packs.push(packEntry);
}

function generateBookContent(book) {
  const markdown = normalizeSourceText(fs.readFileSync(book.markdownPath, 'utf8'));
  const createdPackNames = [];
  const shouldKeep = (kind, doc) => {
    const excluded = EXCLUDED_DOC_SLUGS[`${book.code}:${kind}`];
    return !excluded || !excluded.has(slugify(doc.name));
  };

  if (book.create.journals) {
    const journal = buildJournal(book, markdown);
    const packName = writePackDocs(book, 'journals', [journal]);
    createdPackNames.push(packName);
  }

  if (book.create.npc) {
    const npcDocs = extractNpcBlocks(markdown)
      .map((entry, index) => buildNpcDoc(book, entry.name, entry.block, index))
      .filter(Boolean)
      .filter((doc) => shouldKeep('npc', doc));
    if (npcDocs.length) {
      const packName = writePackDocs(book, 'npc', npcDocs);
      createdPackNames.push(packName);
    }
  }

  if (book.create.vehicle) {
    const vehicleDocs = extractVehicleBlocks(markdown)
      .map((entry, index) => parseVehicleBlock(book, entry.name, entry.block, index))
      .filter(Boolean)
      .filter((doc) => shouldKeep('vehicle', doc));
    if (vehicleDocs.length) {
      const packName = writePackDocs(book, 'vehicle', vehicleDocs);
      createdPackNames.push(packName);
    }
  }

  if (book.create.ship) {
    const shipDocs = extractShipBlocks(markdown)
      .map((entry, index) => parseShipBlock(book, entry.name, entry.block, index))
      .filter(Boolean)
      .filter((doc) => shouldKeep('ship', doc));
    if (shipDocs.length) {
      const packName = writePackDocs(book, 'ship', shipDocs);
      createdPackNames.push(packName);
    }
  }

  return createdPackNames;
}

function updateSystemJson(generatedPacksByBook) {
  const systemData = JSON.parse(fs.readFileSync(SYSTEM_JSON_PATH, 'utf8'));

  for (const book of BOOKS) {
    const createdPackNames = generatedPacksByBook.get(book.code) || [];
    const packDefsForBook = PACK_DEFS
      .filter(([kind]) => createdPackNames.includes(getPackName(book, kind)))
      .map(([kind, type, labelSuffix]) => ({
        name: getPackName(book, kind),
        label: getPackLabel(book, labelSuffix),
        type,
      }));

    for (const packDef of packDefsForBook) {
      const packEntry = buildPackEntry(packDef.name, book.groupDir, packDef.label, packDef.type);
      const existingRelated = systemData.packs.find((entry) => entry.name.startsWith(book.code) && entry.name !== packDef.name);
      const insertAfter = existingRelated?.name || systemData.packs.findLast?.((entry) => entry.path === `packs/${book.groupDir}/${book.code}`)?.name;
      upsertPackEntry(systemData, packEntry, insertAfter || '');
    }

    if (createdPackNames.length) {
      ensurePackFolder(systemData, book.family, book.folderName, createdPackNames);
    }
  }

  fs.writeFileSync(SYSTEM_JSON_PATH, JSON.stringify(systemData, null, 2) + '\n');
}

function main() {
  const generatedPacksByBook = new Map();

  for (const book of BOOKS) {
    const created = generateBookContent(book);
    generatedPacksByBook.set(book.code, created);
    const summary = created.length ? created.join(', ') : 'no packs generated';
    console.log(`${book.code}: ${summary}`);
  }

  updateSystemJson(generatedPacksByBook);
}

main();
