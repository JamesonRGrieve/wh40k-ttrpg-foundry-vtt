const gulp = require('gulp');
const postcss = require('gulp-postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const through2 = require("through2");
const yaml = require("js-yaml");
const merge = require("merge-stream");
const clean = require("gulp-clean");
const postcssImport = require('postcss-import');
const postcssNested = require('postcss-nested');
const postcssScss = require('postcss-scss');
const fs = require("fs");
const path = require("path");
const zip = require("gulp-zip");
const { ClassicLevel } = require("classic-level");
const { exec } = require("child_process");

const util = require('util');
if (!util.isDate) {
  util.isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
}

const SYSTEM = JSON.parse(fs.readFileSync("src/system.json"));
const SYSTEM_CSS = ["src/css/wh40k-rpg.css"];
const STATIC_FILES = [
  "src/icons/**/*",
  "src/module/**/*",
  "!src/module/**/*.ts",
  "!src/module/foundry-core/**",
  "src/templates/**/*",
  "src/images/**/*",
  "src/lang/**/*",
  "src/*.json"
];
const PACK_SRC = "src/packs";
const BUILD_DIR = "dist";

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isReferenceStub(doc) {
  return (
    doc &&
    typeof doc === 'object' &&
    !Array.isArray(doc) &&
    typeof doc.reference === 'string' &&
    Object.keys(doc).length === 1
  );
}

function resolveReferencePath(reference, fromFile) {
  if (path.isAbsolute(reference)) return reference;
  if (reference.startsWith('src/')) return path.resolve(__dirname, reference);
  if (reference.startsWith('packs/')) return path.resolve(__dirname, 'src', reference);
  return path.resolve(path.dirname(fromFile), reference);
}

function resolvePackSourceDocument(filePath, seen = new Set()) {
  const normalizedPath = path.resolve(filePath);
  if (seen.has(normalizedPath)) {
    throw new Error(`Circular pack reference detected: ${[...seen, normalizedPath].join(' -> ')}`);
  }

  const doc = readJsonFile(normalizedPath);
  if (!isReferenceStub(doc)) return doc;

  seen.add(normalizedPath);
  const targetPath = resolveReferencePath(doc.reference, normalizedPath);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Pack reference target not found: ${doc.reference} (from ${normalizedPath})`);
  }
  return resolvePackSourceDocument(targetPath, seen);
}

function detectCollectionType(folder) {
  const segment = (name) => new RegExp(`(^|-)${name}(-|$)`).test(folder);

  if (segment('actors')) return 'actors';
  if (segment('items')) return 'items';
  if (segment('journals')) return 'journal';
  if (segment('rolltables')) return 'tables';
  return 'items';
}

/* ----------------------------------------- */
/*  Compile Packs (V13 LevelDB Format)
/* ----------------------------------------- */

/**
 * Compile packs into Foundry V13 LevelDB format.
 * V13 uses folder-based LevelDB databases instead of .db files.
 */
async function compilePacks() {
  // Collect all pack directories: src/packs/{group}/{pack-name}/_source
  const packEntries = [];
  for (const group of fs.readdirSync(PACK_SRC)) {
    const groupPath = path.join(PACK_SRC, group);
    if (!fs.statSync(groupPath).isDirectory()) continue;
    for (const pack of fs.readdirSync(groupPath)) {
      const packPath = path.join(groupPath, pack);
      if (!fs.statSync(packPath).isDirectory()) continue;
      const sourceDir = path.join(packPath, "_source");
      if (fs.existsSync(sourceDir)) {
        packEntries.push({ group, pack, sourceDir, relPath: path.join(group, pack) });
      }
    }
  }

  const packsDir = path.resolve(__dirname, BUILD_DIR, "packs");

  // Ensure packs directory exists
  if (!fs.existsSync(packsDir)) {
    fs.mkdirSync(packsDir, { recursive: true });
  }

  // Process each pack into a LevelDB compendium
  for (const { pack: folder, sourceDir, relPath } of packEntries) {
    const dbPath = path.join(packsDir, relPath);
    
    // Remove existing database folder if it exists
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
    }

    // Create the LevelDB database
    const db = new ClassicLevel(dbPath, { valueEncoding: 'json' });
    
    // Determine the document collection type from the folder name.
    // Some packs end with the segment (e.g. dh2-core-rolltables), so
    // matching only *-type-* misclassifies them as items.
    const collectionType = detectCollectionType(folder);
    
    try {
      // Special handling for origin-path pack - create folders for each step
      const originPathFolders = {};
      if (folder === 'rt-items-origin-path') {
        // Foundry V13 requires exactly 16 alphanumeric characters for IDs
        const steps = [
          { id: 'ORGNfolder000001', name: '1. Home World', sort: 100000 },
          { id: 'ORGNfolder000002', name: '2. Birthright', sort: 200000 },
          { id: 'ORGNfolder000003', name: '3. Lure of the Void', sort: 300000 },
          { id: 'ORGNfolder000004', name: '4. Trials and Travails', sort: 400000 },
          { id: 'ORGNfolder000005', name: '5. Motivation', sort: 500000 },
          { id: 'ORGNfolder000006', name: '6. Career', sort: 600000 }
        ];
        
        for (const step of steps) {
          originPathFolders[step.sort / 100000] = step.id;
          const folderDoc = {
            _id: step.id,
            name: step.name,
            type: 'Item',
            sort: step.sort,
            color: null,
            flags: {}
          };
          await db.put(`!folders!${step.id}`, folderDoc);
        }
      }
      
      // Read all JSON files from _source directory
      const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        
        try {
          const doc = resolvePackSourceDocument(filePath);
          
          // For origin-path items, assign to appropriate folder based on stepIndex
          if (folder === 'rt-items-origin-path' && doc.flags?.wh40k?.stepIndex) {
            const stepIndex = doc.flags.wh40k.stepIndex;
            if (originPathFolders[stepIndex]) {
              doc.folder = originPathFolders[stepIndex];
            }
          }
          
          // Use the Foundry V13 key format: !{collectionType}!{id}
          if (doc._id) {
            const key = `!${collectionType}!${doc._id}`;
            await db.put(key, doc);
          }
        } catch (parseErr) {
          console.error(`Error parsing ${filePath}:`, parseErr);
        }
      }
      
      const folderCount = folder === 'rt-items-origin-path' ? ' + 6 folders' : '';
      console.log(`Compiled pack: ${folder} (${files.length} documents${folderCount})`);
    } finally {
      await db.close();
    }
  }
  
  return Promise.resolve();
}

/* ----------------------------------------- */
/*  Compile TypeScript
/* ----------------------------------------- */

function compileTypeScript(done) {
  exec('pnpm exec tsc', (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    done();
  });
}

/* ----------------------------------------- */
/*  Compile CSS (PostCSS pipeline)
/* ----------------------------------------- */

function compileCss() {
  return gulp.src(SYSTEM_CSS)
    .pipe(postcss([
      postcssImport,
      postcssNested,
      tailwindcss,
      autoprefixer({ cascade: false }),
      cssnano({ preset: 'default' }),
    ], { syntax: postcssScss }))
    .pipe(gulp.dest(BUILD_DIR + "/css"))
}

// Watch-safe variant that logs errors without crashing
function compileCssWatch() {
  return gulp.src(SYSTEM_CSS)
    .pipe(postcss([
      postcssImport,
      postcssNested,
      tailwindcss,
      autoprefixer({ cascade: false }),
    ], { syntax: postcssScss }))
    .pipe(gulp.dest(BUILD_DIR + "/css"))
}
const css = gulp.series(compileCss);

/* ----------------------------------------- */
/*  Copy Static
/* ----------------------------------------- */

function copyFiles() {
  return gulp.src(STATIC_FILES, {base: "src",}).pipe(gulp.dest(BUILD_DIR));
}

/* ----------------------------------------- */
/*  Other
/* ----------------------------------------- */

function cleanBuild() {
  return gulp.src(`${BUILD_DIR}`, { allowEmpty: true }, { read: false }).pipe(clean({force: true}));
}

function watchUpdates() {
  gulp.watch('src/module/**/*.ts', gulp.series(compileTypeScript));
  gulp.watch('src/css/**/*.css', gulp.series(compileCssWatch));
  return gulp.watch(STATIC_FILES, gulp.series(cleanBuild, compileCssWatch, compilePacks, copyFiles));
}

function watchCopy() {
  return gulp.watch(STATIC_FILES, gulp.series(copyFiles));
}

function createArchive() {
  return gulp.src(`${BUILD_DIR}/**`)
      .pipe(zip(`wh40k-rpg-${SYSTEM.version}.zip`))
      .pipe(gulp.dest('./archive'));
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.clean = gulp.series(cleanBuild);
exports.css = gulp.series(compileCss);
exports.packs = gulp.series(compilePacks);
exports.copy = gulp.series(copyFiles, watchCopy);
exports.build = gulp.series(cleanBuild, compileCss, compileTypeScript, copyFiles, compilePacks, createArchive);
exports.default = gulp.series(cleanBuild, compileCss, compileTypeScript, copyFiles, compilePacks, watchUpdates);
