import type { FastifyInstance } from 'fastify';
import * as storage from '../services/storage.js';
import * as linear from '../services/linear.js';
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
  customer?: string;
}

interface UpdateTicketBody {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  linearUrl?: string;
  color?: string;
  customer?: string;
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
    const { id, title, description, startDate, endDate, linearUrl, color, customer } = request.body;

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
        customer,
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

  // POST /api/tickets/sync-customers - Backfill customer data from Linear
  fastify.post('/api/tickets/sync-customers', async () => {
    const tickets = await storage.getAllTickets();
    const linearTickets = await linear.fetchTicketsByAssignee('');

    // Create a map of identifier to customer
    const customerMap = new Map<string, string>();
    for (const lt of linearTickets) {
      if (lt.customer) {
        customerMap.set(lt.identifier, lt.customer);
      }
    }

    // Update tickets that don't have customer data
    let updated = 0;
    for (const ticket of tickets) {
      const customer = customerMap.get(ticket.id);
      if (customer && !ticket.customer) {
        await storage.updateTicket(ticket.id, { customer });
        updated++;
      }
    }

    return { updated, total: tickets.length };
  });
}
