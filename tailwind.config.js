/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    { pattern: /^(bg|text|border)-(red|amber|green|slate|blue|purple|emerald|cyan|fuchsia|zinc)-(300|400|500|800|900|950)$/ },
    { pattern: /^(bg)-(red|amber|green|slate|blue|purple|emerald|cyan|fuchsia|zinc)-900\/(10|20|40|50)$/ }
  ],
  theme: {
    extend: {
      colors: {
        background: '#09090b', // zinc-950
      }
    },
  },
  plugins: [],
}