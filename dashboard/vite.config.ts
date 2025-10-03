import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 1000, // Increase warning limit to 1MB
    rollupOptions: {
      input: {
        main: 'index.html',
      },
      external: [],
      output: {
        manualChunks: {
          // Vendor chunks - separate major libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-mantine-core': ['@mantine/core', '@mantine/hooks'],
          'vendor-mantine-ui': [
            '@mantine/dates',
            '@mantine/form', 
            '@mantine/modals',
            '@mantine/notifications',
            '@mantine/nprogress',
            '@mantine/spotlight'
          ],
          'vendor-mantine-datatable': ['mantine-datatable'],
          'vendor-mantine-contextmenu': ['mantine-contextmenu'],
          'vendor-icons': ['@tabler/icons-react'],
          'vendor-utils': ['uuid'],
        },
        // Optimize chunk naming
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // Enable source maps for debugging
    sourcemap: false,
    // Optimize dependencies
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  server: {
    port: 5178,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
    '__dirname': 'undefined',
    '__filename': 'undefined',
  },
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@mantine/core',
      '@mantine/hooks',
      '@mantine/dates',
      '@mantine/form',
      '@mantine/modals',
      '@mantine/notifications',
      '@mantine/nprogress',
      '@mantine/spotlight',
      'mantine-datatable',
      'mantine-contextmenu',
      '@tabler/icons-react',
      'clsx',
    ],
    force: true,
    esbuildOptions: {
      target: 'es2020',
    },
  },
})
