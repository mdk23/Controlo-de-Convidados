import { Figtree, JetBrains_Mono, Young_Serif } from "next/font/google";

export const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--font-display" });
export const body = Figtree({ weight: ["400", "500", "600", "700"], subsets: ["latin"], variable: "--font-body" });
export const mono = JetBrains_Mono({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-mono" });
