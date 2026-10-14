import { defineConfig } from 'vite';

export default defineConfig({
  base: '/portfolio/octal-games/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
