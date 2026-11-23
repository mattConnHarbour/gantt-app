import type { FastifyInstance } from 'fastify';
import { handleMention, verifySlackSignature } from '../services/gandalf.js';

export async function slackRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => done(null, body));
  const processing = new Map<string, number>();
  const channelQueues = new Map<string, Promise<void>>();
  fastify.post<{ Body: string }>('/api/slack/events', async (request, reply) => {
    const signature = request.headers['x-slack-signature'];
    const timestamp = request.headers['x-slack-request-timestamp'];
    if (typeof signature !== 'string' || typeof timestamp !== 'string' || !verifySlackSignature(request.body, timestamp, signature, process.env.SLACK_SIGNING_SECRET || '')) return reply.code(401).send({ error: 'Invalid signature' });
    let payload: any;
    try { payload = JSON.parse(request.body); } catch { return reply.code(400).send({ error: 'Invalid JSON' }); }
    if (payload.type === 'url_verification' && typeof payload.challenge === 'string') return { challenge: payload.challenge };
    const event = payload.event;
    const isMention = event?.type === 'app_mention';
    const isDirectMessage = event?.type === 'message' && event.channel_type === 'im' && !event.subtype;
    if (payload.type !== 'event_callback' || (!isMention && !isDirectMessage) || event.bot_id || !event.user || typeof event.channel !== 'string' || typeof event.ts !== 'string' || typeof event.text !== 'string' || typeof payload.event_id !== 'string') return reply.code(200).send();
    if (process.env.SLACK_TEAM_ID && payload.team_id !== process.env.SLACK_TEAM_ID) return reply.code(403).send();
    const now = Date.now();
    for (const [id, seen] of processing) if (now - seen > 3600000) processing.delete(id);
    const dedupKey = isMention ? `channel:${event.channel}:${event.ts}` : payload.event_id;
    if (!processing.has(dedupKey)) {
      processing.set(dedupKey, now);
      const previous = channelQueues.get(event.channel) || Promise.resolve();
      const next = previous.then(() => handleMention(payload.event_id, event)).catch(() => { console.error('Gandalf could not process a Slack channel event'); });
      channelQueues.set(event.channel, next);
      void next.finally(() => { if (channelQueues.get(event.channel) === next) channelQueues.delete(event.channel); });
    }
    return reply.code(200).send();
  });
}
