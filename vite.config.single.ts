import { defineConfig } from 'vite';

/**
 * Configuration for the single file build.
 *
 * Everything (JavaScript, CSS, textures) is inlined into one HTML document
 * that can be opened directly from a file system or hosted anywhere.
 */
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    outDir: 'dist-single',
    emptyOutDir: true,
    assetsInlineLimit: 1000000000,
    cssCodeSplit: false,
    modulePreload: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 2000,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // a classic script works from file:// on every browser
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
