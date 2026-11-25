import path from "path"
import { execSync } from "node:child_process"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// visible build stamp: settle "am I on the new build?" at a glance
let buildSha = 'unknown'
try {
  buildSha = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // not a git checkout (e.g. deployed artifact built elsewhere)
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
