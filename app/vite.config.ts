import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react';
          }

          if (id.includes('node_modules/@tiptap') || id.includes('node_modules/prosemirror')) {
            return 'editor';
          }

          if (id.includes('node_modules/dexie') || id.includes('node_modules/zustand')) {
            return 'data';
          }

          if (id.includes('node_modules/lucide-react')) {
            return 'icons';
          }

          return undefined;
        },
      },
    },
  },
});
