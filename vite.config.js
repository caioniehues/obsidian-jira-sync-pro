import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'JiraSyncPro',
      fileName: () => 'main.js',
      formats: ['cjs']
    },
    rollupOptions: {
      external: ['obsidian'],
      output: {
        dir: '.',
        format: 'cjs',
        exports: 'default',
        globals: {
          obsidian: 'obsidian'
        }
      }
    },
    sourcemap: 'inline',
    minify: false,
    emptyOutDir: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
});