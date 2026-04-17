import type { Config } from "tailwindcss";
export default {
	content: [
		"./app/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./lib/**/*.{ts,tsx}",
		"../../packages/ui/src/**/*.{ts,tsx}"
	],
	theme: { extend: {} },
	plugins: []
} satisfies Config;
