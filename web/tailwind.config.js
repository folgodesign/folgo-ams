/** @type {import('tailwindcss').Config} */
// Folgo Pulse design tokens — PRD §7.2 (brand) and §14.2 (status colours).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        folgo: {
          orange: '#EB5E29',
          ivory: '#F0ECE3',
          espresso: '#2D2324',
          black: '#000000',
        },
        bg: {
          base: '#0A0808',
          surface: '#171213',
          raised: '#2D2324',
          hover: '#3A2E2F',
        },
        border: {
          subtle: '#3A2E2F',
          strong: '#524244',
        },
        text: {
          primary: '#F0ECE3',
          secondary: '#B5ADA6',
          muted: '#7D7570',
        },
        accent: {
          DEFAULT: '#EB5E29',
          hover: '#F4713F',
          pressed: '#C94B1D',
        },
        status: {
          working: '#3DD68C',
          meeting: '#5B9DFF',
          focus: '#B08CFF',
          break: '#F5C542',
          away: '#8A817C',
          out: '#524244',
          leave: '#6B8A9E',
        },
      },
      fontFamily: {
        // Neue Montreal is a paid face (PRD §14.3); Inter is the open fallback.
        sans: ['"Neue Montreal"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      fontSize: {
        display: ['40px', { lineHeight: '44px', fontWeight: '700' }],
        h1: ['28px', { lineHeight: '34px', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '26px', fontWeight: '500' }],
        body: ['15px', { lineHeight: '22px' }],
        sm: ['13px', { lineHeight: '18px' }],
        caption: ['11px', { lineHeight: '14px', letterSpacing: '0.04em' }],
      },
      keyframes: {
        pulseBorder: {
          '0%': { boxShadow: '0 0 0 0 rgba(235,94,41,0.5)' },
          '100%': { boxShadow: '0 0 0 8px rgba(235,94,41,0)' },
        },
        slideIn: {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        pulseBorder: 'pulseBorder 0.8s ease-out',
        slideIn: 'slideIn 0.22s ease-out',
      },
    },
  },
  plugins: [],
};
