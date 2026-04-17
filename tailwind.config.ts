import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        status: {
          online: "#1f9d55",
          offline: "#dc2626",
          unknown: "#6b7280"
        }
      }
    }
  },
  plugins: []
};

export default config;
