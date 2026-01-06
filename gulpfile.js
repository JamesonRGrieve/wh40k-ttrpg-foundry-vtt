const gulp = require('gulp');
const prefix = require('gulp-autoprefixer');
const through2 = require("through2");
const yaml = require("js-yaml");
const merge = require("merge-stream");
const clean = require("gulp-clean");
const sass = require('gulp-sass')(require('sass'));
const fs = require("fs");
const path = require("path");
const zip = require("gulp-zip");
const { ClassicLevel } = require("classic-level");

const util = require('util');
if (!util.isDate) {
  util.isDate = (d) => Object.prototype.toString.call(d) === '[object Date]';
}

const SYSTEM = JSON.parse(fs.readFileSync("src/system.json"));
const SYSTEM_SCSS = ["src/scss/**/*.scss"];
const STATIC_FILES = [
  "src/icons/**/*",
  "src/module/**/*",
  "!src/module/foundry-core/**",
  "src/templates/**/*",
  "src/images/**/*",
  "src/lang/**/*",
  "src/*.json"
];
const PACK_SRC = "src/packs";
const BUILD_DIR = "/mnt/c/Users/Dreski-PC/AppData/Local/FoundryVTT/Data/systems/rogue-trader";

/* ----------------------------------------- */
/*  Compile Packs (V13 LevelDB Format)
/* ----------------------------------------- */

/**
 * Compile packs into Foundry V13 LevelDB format.
 * V13 uses folder-based LevelDB databases instead of .db files.
 */
async function compilePacks() {
  // Determine the source folders to process
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  const packsDir = path.resolve(__dirname, BUILD_DIR, "packs");
  
  // Ensure packs directory exists
  if (!fs.existsSync(packsDir)) {
    fs.mkdirSync(packsDir, { recursive: true });
  }

  // Process each folder into a LevelDB compendium
  for (const folder of folders) {
    const sourceDir = path.join(PACK_SRC, folder, "_source");
    
    // Skip if no _source directory (contains JSON files)
    if (!fs.existsSync(sourceDir)) {
      continue;
    }

    const dbPath = path.join(packsDir, folder);
    
    // Remove existing database folder if it exists
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { recursive: true, force: true });
    }

    // Create the LevelDB database
    const db = new ClassicLevel(dbPath, { valueEncoding: 'json' });
    
    // Determine the document collection type from the folder name
    let collectionType = 'items'; // default
    if (folder.startsWith('rt-actors-')) {
      collectionType = 'actors';
    } else if (folder.startsWith('rt-items-')) {
      collectionType = 'items';
    } else if (folder.startsWith('rt-journals-')) {
      collectionType = 'journal';
    } else if (folder.startsWith('rt-rolltables-')) {
      collectionType = 'tables';
    }
    
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
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
          const doc = JSON.parse(content);
          
          // For origin-path items, assign to appropriate folder based on stepIndex
          if (folder === 'rt-items-origin-path' && doc.flags?.rt?.stepIndex) {
            const stepIndex = doc.flags.rt.stepIndex;
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
/*  Compile Sass
/* ----------------------------------------- */

// Small error handler helper function.
function handleError(err) {
  console.log(err.toString());
  this.emit('end');
}

function compileScss() {
  // Configure options for sass output. For example, 'expanded' or 'nested'
  let options = {
    outputStyle: 'expanded'
  };
  return gulp.src(SYSTEM_SCSS)
    .pipe(
      sass(options)
        .on('error', handleError)
    )
    .pipe(prefix({
      cascade: false
    }))
    .pipe(gulp.dest(BUILD_DIR + "/css"))
}
const css = gulp.series(compileScss);

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
  return gulp.watch(STATIC_FILES, gulp.series(cleanBuild, compileScss, compilePacks, copyFiles));
}

function watchCopy() {
  return gulp.watch(STATIC_FILES, gulp.series(copyFiles));
}

function createArchive() {
  return gulp.src(`${BUILD_DIR}/**`)
      .pipe(zip(`rogue-trader-${SYSTEM.version}.zip`))
      .pipe(gulp.dest('./archive'));
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.clean = gulp.series(cleanBuild);
exports.scss = gulp.series(compileScss);
exports.packs = gulp.series(compilePacks);
exports.copy = gulp.series(copyFiles, watchCopy);
exports.build = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks, createArchive);
exports.default = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks, watchUpdates);
