import type { GanttTicket, LinearTicket } from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function fetchTickets(): Promise<GanttTicket[]> {
  const res = await fetch(`${API_BASE}/api/tickets`);
  if (!res.ok) throw new Error('Failed to fetch tickets');
  return res.json();
}

export async function createTicket(
  ticket: Omit<GanttTicket, 'createdAt' | 'updatedAt'>
): Promise<GanttTicket> {
  const res = await fetch(`${API_BASE}/api/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticket),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create ticket');
  }
  return res.json();
}

export async function updateTicket(
  id: string,
  updates: Partial<Omit<GanttTicket, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<GanttTicket> {
  const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update ticket');
  return res.json();
}

export async function deleteTicket(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/tickets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete ticket');
}

export async function fetchLinearTickets(assignee?: string, refresh = false): Promise<LinearTicket[]> {
  const params = new URLSearchParams();
  if (assignee) params.set('assignee', assignee);
  if (refresh) params.set('refresh', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/api/linear/tickets${query}`);
  if (!res.ok) throw new Error('Failed to fetch Linear tickets');
  return res.json();
}

export async function fetchLinearTicket(identifier: string): Promise<LinearTicket> {
  const res = await fetch(`${API_BASE}/api/linear/ticket/${encodeURIComponent(identifier)}`);
  if (!res.ok) throw new Error('Failed to fetch Linear ticket');
  return res.json();
}
