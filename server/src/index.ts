import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ticketRoutes } from './routes/tickets.js';
import { linearRoutes } from './routes/linear.js';
import { slackRoutes } from './routes/slack.js';
import { createProactiveWatcher } from './services/proactive.js';

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// Health check endpoint
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register routes
await fastify.register(ticketRoutes);
await fastify.register(linearRoutes);
await fastify.register(slackRoutes);

const watcher = process.env.GANDALF_PROACTIVE_ENABLED === 'true' ? createProactiveWatcher() : null;
if (watcher) fastify.addHook('onClose', async () => watcher.stop());

// Start server
const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

try {
  await fastify.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
  watcher?.start();
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
