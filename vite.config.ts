import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages 는 https://<user>.github.io/<repo>/ 아래에서 열리므로 배포 빌드만 경로를 붙인다 (BASE_PATH 는 Actions 에서 넣음).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
})
