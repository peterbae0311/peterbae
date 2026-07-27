import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        glass: '0 8px 30px rgba(0, 0, 0, 0.06)',
        'glass-lg': '0 20px 50px rgba(0, 0, 0, 0.14)',
        'glow-dark': '0 8px 20px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #171717 0%, #404040 100%)',
      },
    },
  },
  plugins: [],
};

export default config;
