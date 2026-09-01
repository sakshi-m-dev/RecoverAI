/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: '#F5B731',
        'gold-dim': '#C9961A',
        recovered: '#22C55E',
        'recovered-dim': '#16A34A',
        'at-risk': '#F59E0B',
        failed: '#EF4444',
        escalated: '#A855F7',
        recovering: '#3B82F6',
        bg: {
          primary: '#080809',
          secondary: '#0E0E11',
          card: '#131318',
          hover: '#1A1A22',
        },
        text: {
          primary: '#F1F1F3',
          secondary: '#9CA3AF',
          muted: '#6B7280',
        }
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      backgroundImage: {
        'card-gradient': 'linear-gradient(135deg, rgba(245,183,49,0.04) 0%, transparent 60%)',
      },
    },
  },
  plugins: [],
}
