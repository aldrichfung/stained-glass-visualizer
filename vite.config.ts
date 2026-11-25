import path from "path"
import fs from "node:fs"
import { execSync } from "node:child_process"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// visible build stamp: settle "am I on the new build?" at a glance.
// Local builds stamp the git sha; the deployment platform builds from a
// source snapshot WITHOUT .git, so fall back to the committed version
// marker (bumped every ship) instead of a useless "unknown".
let buildSha = 'unknown'
try {
  buildSha = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  try {
    const marker = fs.readFileSync(path.resolve(__dirname, 'public/deploy-marker.txt'), 'utf8').trim()
    buildSha = marker.split(/\s+/).slice(0, 2).join('-') || 'unknown' // e.g. "v34-shapes"
  } catch {
    // no marker either
  }
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
