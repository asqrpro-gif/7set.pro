/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./views/**/*.ejs",
    "./public/**/*.js"
  ],
  darkMode: 'class', 
  theme: { 
    extend: { 
      colors: { brand: '#0077FF', surface: '#F5F5F7' },
      animation: { 'shimmer': 'shimmer 2.5s infinite' },
      keyframes: { 
        shimmer: { 
          '0%': { transform: 'translateX(-100%)' }, 
          '100%': { transform: 'translateX(100%)' } 
        } 
      }
    } 
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
