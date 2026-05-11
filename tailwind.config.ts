import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        red: { team: "#fee2e2" },
        blue: { team: "#dbeafe" }
      }
    }
  },
  plugins: []
};

export default config;
