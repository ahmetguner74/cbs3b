import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';

export default defineConfig({
    plugins: [cesium()],
    root: './',
    base: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        open: true
    }
});
