import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Eliminamos 'base' para que use la raíz por defecto ('/')
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
