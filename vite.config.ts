import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    target: 'esnext',
    lib: {
      entry: 'src/index.ts',
      name: 'URLGenerator',
      fileName: (format) => (format === 'es' ? 'url-generator.js' : 'url-generator.cjs'),
      formats: ['es', 'cjs'],
    },
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        exports: 'named',
      },
    },
  },
  plugins: [
    dts({
      tsconfigPath: 'tsconfig.build.json',
      entryRoot: 'src',
      outDir: 'dist/types',
      insertTypesEntry: true,
    }),
  ],
});
