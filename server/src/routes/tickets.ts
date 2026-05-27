import type { FastifyInstance } from 'fastify';
import * as storage from '../services/storage.js';
import type { GanttTicket } from '../types.js';

interface TicketParams {
  id: string;
}

interface CreateTicketBody {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  linearUrl?: string;
  color?: string;
}

interface UpdateTicketBody {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  linearUrl?: string;
  color?: string;
}

export async function ticketRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/tickets - List all tickets
  fastify.get('/api/tickets', async () => {
    return storage.getAllTickets();
  });

  // GET /api/tickets/:id - Get a single ticket
  fastify.get<{ Params: TicketParams }>('/api/tickets/:id', async (request, reply) => {
    const ticket = await storage.getTicketById(request.params.id);
    if (!ticket) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }
    return ticket;
  });

  // POST /api/tickets - Create a new ticket
  fastify.post<{ Body: CreateTicketBody }>('/api/tickets', async (request, reply) => {
    const { id, title, description, startDate, endDate, linearUrl, color } = request.body;

    if (!id || !title || !startDate || !endDate) {
      return reply.status(400).send({ error: 'Missing required fields: id, title, startDate, endDate' });
    }

    try {
      const ticket = await storage.createTicket({
        id,
        title,
        description,
        startDate,
        endDate,
        linearUrl,
        color,
      });
      return reply.status(201).send(ticket);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });

  // PATCH /api/tickets/:id - Update a ticket
  fastify.patch<{ Params: TicketParams; Body: UpdateTicketBody }>(
    '/api/tickets/:id',
    async (request, reply) => {
      const ticket = await storage.updateTicket(request.params.id, request.body);
      if (!ticket) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }
      return ticket;
    }
  );

  // DELETE /api/tickets/:id - Delete a ticket
  fastify.delete<{ Params: TicketParams }>('/api/tickets/:id', async (request, reply) => {
    const deleted = await storage.deleteTicket(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Ticket not found' });
    }
    return { success: true };
  });
}
