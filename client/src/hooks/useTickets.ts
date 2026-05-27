import { useState, useEffect, useCallback } from 'react';
import type { GanttTicket } from '../types';
import * as api from '../api';

export function useTickets() {
  const [tickets, setTickets] = useState<GanttTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.fetchTickets();
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addTicket = useCallback(
    async (ticket: Omit<GanttTicket, 'createdAt' | 'updatedAt'>) => {
      const newTicket = await api.createTicket(ticket);
      setTickets((prev) => [...prev, newTicket]);
      return newTicket;
    },
    []
  );

  const updateTicket = useCallback(
    async (id: string, updates: Partial<Omit<GanttTicket, 'id' | 'createdAt' | 'updatedAt'>>) => {
      const updated = await api.updateTicket(id, updates);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
      return updated;
    },
    []
  );

  const removeTicket = useCallback(async (id: string) => {
    await api.deleteTicket(id);
    setTickets((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const syncFromLinear = useCallback(async (assignee: string = 'Matthew') => {
    const linearTickets = await api.fetchLinearTickets(assignee);
    const existingIds = new Set(tickets.map((t) => t.id));

    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

    for (const lt of linearTickets) {
      if (!existingIds.has(lt.identifier)) {
        await api.createTicket({
          id: lt.identifier,
          title: lt.title,
          description: lt.description,
          startDate: today.toISOString().split('T')[0],
          endDate: nextWeek.toISOString().split('T')[0],
          linearUrl: lt.url,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    }

    await refresh();
  }, [tickets, refresh]);

  return {
    tickets,
    loading,
    error,
    refresh,
    addTicket,
    updateTicket,
    removeTicket,
    syncFromLinear,
  };
}
