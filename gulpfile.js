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
const BUILD_DIR = "build/rogue-trader";

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
    
    try {
      // Read all JSON files from _source directory
      const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
      
      for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
          const doc = JSON.parse(content);
          
          // Use the document's _id as the key, prefixed with "!" for Foundry format
          if (doc._id) {
            const key = `!${folder}.${doc._id}`;
            await db.put(key, doc);
          }
        } catch (parseErr) {
          console.error(`Error parsing ${filePath}:`, parseErr);
        }
      }
      
      console.log(`Compiled pack: ${folder} (${files.length} documents)`);
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
