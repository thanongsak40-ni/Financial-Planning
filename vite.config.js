import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // แยก vendor ก้อนใหญ่ออกจากโค้ดแอป เพื่อให้ browser แคชได้ยาว
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router') || id.includes('/react/') || id.includes('react-dom')) return 'react'
        },
      },
    },
  },
})
