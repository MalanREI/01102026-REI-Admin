import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: '#0f172a',
        surface: '#1e293b',
        elevated: '#334155',
        accent: {
          DEFAULT: '#10b981',
          hover: '#059669',
          light: '#34d399',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
