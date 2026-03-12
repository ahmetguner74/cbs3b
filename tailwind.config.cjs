/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './app/**/*.html',
    './app/**/*.js'
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        'primary-hover': '#60A5FA',
        accent: '#4ADE80',
        'accent-hover': '#86EFAC',
        'background-light': '#f8fafc',
        'background-dark': '#0b0f19',
        'panel-bg': '#111827',
        'panel-elevated': '#1e293b',
        'border-dark': '#334155',
        'border-subtle': '#1e293b'
      },
      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px)' },
          '50%': { transform: 'translateX(4px)' },
          '75%': { transform: 'translateX(-4px)' }
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        shake: 'shake 0.3s ease-in-out',
        fadeIn: 'fadeIn 0.3s ease-out'
      },
      fontFamily: {
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.625rem',
        xl: '0.875rem',
        '2xl': '1rem',
        full: '9999px'
      }
    }
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/container-queries')
  ]
};
