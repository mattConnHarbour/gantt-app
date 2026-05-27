import { useState } from 'react';
import type { GanttTicket, LinearTicket } from '../types';
import * as api from '../api';

interface Props {
  onAdd: (ticket: Omit<GanttTicket, 'createdAt' | 'updatedAt'>) => Promise<void>;
}

const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
];

export function AddTicketForm({ onAdd }: Props) {
  const [prefix, setPrefix] = useState<'SD' | 'IT'>('SD');
  const [ticketId, setTicketId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId.trim()) return;

    setLoading(true);
    setError(null);

    const identifier = `${prefix}-${ticketId.trim()}`;

    try {
      // Try to fetch from Linear first
      let linearTicket: LinearTicket | null = null;
      try {
        linearTicket = await api.fetchLinearTicket(identifier);
      } catch {
        // If Linear fetch fails, we'll create a manual ticket
      }

      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

      await onAdd({
        id: identifier,
        title: linearTicket?.title ?? identifier,
        description: linearTicket?.description,
        startDate: today.toISOString().split('T')[0],
        endDate: nextWeek.toISOString().split('T')[0],
        linearUrl: linearTicket?.url,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      });

      setTicketId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="add-ticket-form">
      <div className="form-row">
        <select
          value={prefix}
          onChange={(e) => setPrefix(e.target.value as 'SD' | 'IT')}
          disabled={loading}
        >
          <option value="SD">SD</option>
          <option value="IT">IT</option>
        </select>
        <span className="separator">-</span>
        <input
          type="text"
          value={ticketId}
          onChange={(e) => setTicketId(e.target.value)}
          placeholder="123"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !ticketId.trim()}>
          {loading ? '...' : 'Add'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
    </form>
  );
}
