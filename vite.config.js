// see: https://vite.dev/config/
import {defineConfig} from "vite";

export default defineConfig({
    base: '/swarm-webgpu/',
    build: {
        target: 'esnext'
    }
})
