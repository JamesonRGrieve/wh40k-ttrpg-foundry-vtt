const gulp = require('gulp');
const prefix = require('gulp-autoprefixer');
const through2 = require("through2");
const yaml = require("js-yaml");
const Datastore = require("nedb");
const cb = require("cb");
const merge = require("merge-stream");
const clean = require("gulp-clean");
const sourcemaps = require('gulp-sourcemaps');
const sass = require('gulp-sass')(require('sass'));
const fs = require("fs");
const path = require("path");

const SYSTEM = JSON.parse(fs.readFileSync("src/system.json"));
const SYSTEM_SCSS = ["src/scss/**/*.scss"];
const STATIC_FILES = [
  "src/icons/**/*",
  "src/lang/**/*",
  "src/module/**/*",
  "src/templates/**/*",
  "src/images/**/*",
  "src/*.json"
];
const PACK_SRC = "src/packs";
const BUILD_DIR = "/Users/***REMOVED***/Library/Application Support/FoundryVTT/Data/systems/dark-heresy-2nd";

/* ----------------------------------------- */
/*  Compile Packs
/* ----------------------------------------- */

function compilePacks() {
  // determine the source folders to process
  const folders = fs.readdirSync(PACK_SRC).filter((file) => {
    return fs.statSync(path.join(PACK_SRC, file)).isDirectory();
  });

  // process each folder into a compendium db
  const packs = folders.map((folder) => {
    const db = new Datastore({ filename: path.resolve(__dirname, BUILD_DIR, "packs", `${folder}.db`), autoload: true });
    return gulp.src(path.join(PACK_SRC, folder, "/**/*.yml")).pipe(
        through2.obj((file, enc, cb) => {
          let json = yaml.loadAll(file.contents.toString());
          db.insert(json);
          cb(null, file);
        })
    );
  });
  return merge.call(null, packs);
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
  gulp.watch("src/**/*", gulp.series(cleanBuild, compileScss, compilePacks, copyFiles));
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.clean = gulp.series(cleanBuild);
exports.scss = gulp.series(compileScss);
exports.packs = gulp.series(compilePacks);
exports.copy = gulp.series(copyFiles);
exports.build = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks);
exports.default = gulp.series(cleanBuild, compileScss, copyFiles, compilePacks, watchUpdates);
