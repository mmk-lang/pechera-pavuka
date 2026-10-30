import { defineConfig } from 'vitest/config';

// Налаштування Vite (dev-сервер і збірка) та Vitest (тести)
export default defineConfig({
  // відносні шляхи, щоб гру можна було викласти будь-куди (наприклад, на GitHub Pages)
  base: './',
  // Three.js сам важить ~550 КБ — це нормально, тож не попереджаємо про великий файл
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
