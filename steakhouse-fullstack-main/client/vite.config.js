import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000', // force IPv4 to avoid ::1 issues
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
