/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          400: '#60a5fa', 500: '#3B82F6', 600: '#2563EB',
        },
      },
    },
  },
  plugins: [],
}
