import express from 'express';
import cors from 'cors';
import { apiRouter } from './api/routes.js';
import { startMcpServer } from './mcp/server.js';

const app = express();
app.use(cors());
app.use(express.json());

// Montar la API REST de ElevenLabs en /api
app.use('/api', apiRouter);

// Ruta de validación para Vercel
app.get('/', (req, res) => {
  res.send('Hipermaxi Backend API (Express & MCP Ready)');
});

// Detectar cómo se ejecuta (CLI stdio o Servidor Web)
// Si se corre como un script normal, levanta HTTP y MCP stdio
if (process.argv.includes('--mcp')) {
  // Solo MCP (para Cursor, Claude, etc)
  startMcpServer().catch(console.error);
} else {
  // Modo Express (Para ElevenLabs Webhooks y Vercel)
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.error(`Express server running on port ${PORT}`);
  });
}

// Exportar para Vercel Serverless Functions
export default app;
