import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // xlsx-js-style (used for the Excel export) references Node's
    // "stream", "buffer", and "util" modules internally even though our
    // usage never hits those code paths in the browser. Without this,
    // Vite prints a "Module '<name>' has been externalized" warning on
    // load for each one. This polyfills the handful of Node built-ins
    // libraries like this expect.
    nodePolyfills({ include: ['stream', 'buffer', 'util'] }),
  ],
})
