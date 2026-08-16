import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages のプロジェクトサイトは https://<user>.github.io/game-claude/ 配下に
  // 配信されるため、本番ビルドのみアセットパスをリポジトリ名でプレフィックスする。
  base: command === 'build' ? '/game-claude/' : '/',
  plugins: [react()],
}))
