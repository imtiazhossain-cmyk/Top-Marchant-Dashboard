/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bee: '#FFCC00', beeink: '#1A1606',
        char: '#15171C', char2: '#1D2026', charline: '#2A2E37', charmut: '#8A8F99', charmut2: '#5C616D',
        ink: '#181B21', ink2: '#5C636F', ink3: '#959CA8',
        page: '#F6F7F9', card: '#FFFFFF', line: '#E8EAEE', line2: '#EFF1F4',
        ok: '#13935A', okbg: '#E6F5ED', warn: '#C9810A', warnbg: '#FBF0DA',
        bad: '#D93B36', badbg: '#FBE8E7', info: '#2E6CE4', infobg: '#E8F0FD',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '13px' },
    },
  },
  plugins: [],
};
