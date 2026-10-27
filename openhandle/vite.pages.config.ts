import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({base:(process.env.NEXT_PUBLIC_BASE_PATH || "")+"/sites/hawk/openhandle/",root:path.join(root,"pages"),publicDir:false,css:{postcss:{plugins:[tailwindcss()]}},plugins:[react()],resolve:{alias:{"@":root,"next/image":path.join(root,"pages/next-image.tsx")}},build:{outDir:path.join(root,"pages-dist"),emptyOutDir:true}});
