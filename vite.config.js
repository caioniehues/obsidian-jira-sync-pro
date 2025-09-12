import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['cjs'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external: [
        'obsidian',
        'electron',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`)
      ],
      output: {
        inlineDynamicImports: true,
        format: 'cjs',
        assetFileNames: 'styles.css',
        entryFileNames: 'main.js'
      }
    },
    outDir: '.',
    emptyOutDir: false,
    sourcemap: 'inline',
    minify: process.env.NODE_ENV === 'production'
  }
});