import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRouter from './server/routes/api.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
  const app = express();

  // Request size limit configured for processing large CSV datasets
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Mount backend API routes
  app.use('/api', apiRouter);

  // Render provides PORT automatically
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV === 'production') {
    // Serve production build static files
    app.use(express.static(path.join(__dirname, 'dist')));

    // SPA fallback routing
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    // In development, run Vite as middleware
    const { createServer: createViteServer } = await import('vite');

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log('[Dev] Vite middleware mounted on Express app.');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log('\n==================================================');
    console.log(`🚀 [GrowEasy CRM] Server running on port ${port}`);
    console.log(`🌍 Mode: ${process.env.NODE_ENV || 'development'}`);
    console.log('==================================================\n');
  });
}

createServer().catch((err) => {
  console.error('FATAL: Failed to launch full stack server:', err);
  process.exit(1);
});