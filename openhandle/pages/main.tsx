import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/app/globals.css";
import { Phase2Prototype } from "@/components/workflow/phase2-prototype";
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(<StrictMode><Phase2Prototype lean /></StrictMode>);
