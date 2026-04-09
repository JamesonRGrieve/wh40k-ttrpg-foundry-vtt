/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/templates/**/*.hbs',
    './src/module/**/*.{ts,js}',
  ],
  prefix: 'tw-',
  corePlugins: {
    preflight: false, // Don't reset existing Foundry/system styles
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
