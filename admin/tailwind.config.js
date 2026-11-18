/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#07090e',
        surface: '#0d111a',
        'surface-elevated': '#141a29',
        cyan: {
          DEFAULT: '#00f0ff',
          hover: '#33f3ff'
        },
        pink: {
          DEFAULT: '#ff2a85',
          hover: '#ff4d9d'
        },
        neonGreen: '#00ff88',
        neonAmber: '#ffaa00'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Teko', 'sans-serif']
      }
    },
  },
  plugins: [],
}
