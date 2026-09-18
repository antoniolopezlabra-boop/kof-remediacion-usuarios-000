import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// BASE_PATH lo define el workflow de GitHub Pages (p. ej. /kof-usuarios-000/)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
})
