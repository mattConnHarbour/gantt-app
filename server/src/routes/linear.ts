import type { FastifyInstance } from 'fastify';
import * as linear from '../services/linear.js';
import type { LinearTicket } from '../types.js';

interface TicketParams {
  id: string;
}

interface AssigneeQuery {
  assignee?: string;
  refresh?: string;
}

// Server-side cache
let cachedTickets: LinearTicket[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function linearRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/linear/tickets - Fetch tickets from Linear (with server-side caching)
  fastify.get<{ Querystring: AssigneeQuery }>('/api/linear/tickets', async (request) => {
    const { assignee, refresh } = request.query;
    const now = Date.now();

    // Return cached if valid and not forcing refresh
    if (cachedTickets && !refresh && (now - cacheTimestamp) < CACHE_TTL) {
      return cachedTickets;
    }

    // Fetch fresh data
    const tickets = assignee
      ? await linear.fetchTicketsByAssignee(assignee)
      : await linear.fetchMyTickets();

    // Update cache
    cachedTickets = tickets;
    cacheTimestamp = now;

    return tickets;
  });

  // GET /api/linear/ticket/:id - Fetch a single ticket by identifier
  fastify.get<{ Params: TicketParams }>('/api/linear/ticket/:id', async (request, reply) => {
    const ticket = await linear.fetchTicketByIdentifier(request.params.id);

    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found in Linear' });
    }

    return ticket;
  });
}
