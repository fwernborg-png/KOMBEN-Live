import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/atg-api": {
        target: "https://www.atg.se",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/atg-api/, "/services/racinginfo/v1/api"),
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
})
