/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        mars: {
          navy:        '#003087',   // MARS corporate blue – headers, section bars, active nav
          'navy-dark': '#002070',   // Deeper navy – hover on navy
          blue:        '#4472C4',   // Mid-blue – accent bars, primary buttons
          'blue-hover':'#3560B0',   // Darker blue for hover
          'blue-light':'#BDD7EE',   // Pale blue – chip backgrounds, alt rows
          'blue-pale': '#E8EDF7',   // Very pale blue – page background
          orange:      '#ED7D31',   // Orange – past-period bars, warning highlights
          gold:        '#FFC000',   // Gold/Amber – current period, neutral badges
          'gold-light':'#FFF2CC',   // Light gold – cell highlight background
          'orange-light':'#FCE4D6', // Light orange – cell highlight background
        },
      },
    },
  },
  plugins: [],
}
