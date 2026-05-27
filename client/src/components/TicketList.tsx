import { useState, useMemo, useEffect } from 'react';
import type { GanttTicket, LinearTicket } from '../types';
import * as api from '../api';

interface Props {
  tickets: GanttTicket[];
  onDelete: (id: string) => Promise<void>;
  onSelect?: (ticket: GanttTicket) => void;
  selectedId?: string;
}

export function TicketList({ tickets, onDelete, onSelect, selectedId }: Props) {
  const [filter, setFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [linearTickets, setLinearTickets] = useState<LinearTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Load tickets from server on mount
  useEffect(() => {
    api.fetchLinearTickets('Matthew')
      .then(setLinearTickets)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const addedIds = useMemo(() => new Set(tickets.map((t) => t.id)), [tickets]);

  // Get unique customers for filter dropdown
  const customers = useMemo(() => {
    const set = new Set<string>();
    linearTickets.forEach((t) => {
      if (t.customer) set.add(t.customer);
    });
    return Array.from(set).sort();
  }, [linearTickets]);

  const fetchLinear = (refresh = false) => {
    setLoading(true);
    api.fetchLinearTickets('Matthew', refresh)
      .then(setLinearTickets)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const availableLinearTickets = useMemo(() => {
    return linearTickets.filter((lt) => !addedIds.has(lt.identifier));
  }, [linearTickets, addedIds]);

  const filteredAvailable = useMemo(() => {
    let result = availableLinearTickets;

    // Filter by customer
    if (customerFilter) {
      result = result.filter((t) => t.customer === customerFilter);
    }

    // Filter by ID or customer name
    if (filter.trim()) {
      const search = filter.trim().toLowerCase();
      result = result.filter((t) => {
        const numPart = t.identifier.split('-')[1] || t.identifier;
        return numPart.toLowerCase().includes(search) ||
               t.identifier.toLowerCase().includes(search) ||
               t.customer?.toLowerCase().includes(search);
      });
    }

    return result;
  }, [availableLinearTickets, filter, customerFilter]);

  const filteredAdded = useMemo(() => {
    if (!filter.trim()) return tickets;
    const search = filter.trim().toLowerCase();
    return tickets.filter((t) => {
      const numPart = t.id.split('-')[1] || t.id;
      return numPart.toLowerCase().includes(search) || t.id.toLowerCase().includes(search);
    });
  }, [tickets, filter]);

  const handleDragStart = (e: React.DragEvent, ticket: LinearTicket) => {
    e.dataTransfer.setData('application/json', JSON.stringify(ticket));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="ticket-list">
      <input
        type="text"
        className="filter-input"
        placeholder="Filter by ID or customer..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {customers.length > 0 && (
        <select
          className="customer-filter"
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
        >
          <option value="">All customers</option>
          {customers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <div className="ticket-section">
        <div className="section-header">
          <h2>Linear Tickets</h2>
          <button className="refresh-btn" onClick={() => fetchLinear(true)} disabled={loading}>
            {loading ? '...' : '↻'}
          </button>
        </div>
        <div className="tickets">
          {loading ? (
            <p className="empty">Loading...</p>
          ) : filteredAvailable.length === 0 ? (
            <p className="empty">{linearTickets.length === 0 ? 'Click ↻ to load' : availableLinearTickets.length === 0 ? 'All tickets added' : 'No matches'}</p>
          ) : (
            filteredAvailable.map((ticket) => (
              <div
                key={ticket.id}
                className="ticket-item linear-ticket"
                draggable
                onDragStart={(e) => handleDragStart(e, ticket)}
              >
                <div className="ticket-header">
                  <span className="ticket-id">
                    {ticket.identifier}
                    {ticket.customer && <span className="ticket-customer"> [{ticket.customer}]</span>}
                  </span>
                  <span className="ticket-state">{ticket.state?.name || 'Unknown'}</span>
                </div>
                <div className="ticket-title">{ticket.title}</div>
                <div className="drag-hint">Drag to calendar</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="ticket-section">
        <h2>On Calendar ({tickets.length})</h2>
        <div className="tickets">
          {filteredAdded.length === 0 ? (
            <p className="empty">{tickets.length === 0 ? 'Drag tickets here' : 'No matches'}</p>
          ) : (
            filteredAdded.map((ticket) => (
              <div
                key={ticket.id}
                className={`ticket-item ${selectedId === ticket.id ? 'selected' : ''}`}
                onClick={() => onSelect?.(ticket)}
                style={{ borderLeftColor: ticket.color }}
              >
                <div className="ticket-header">
                  <span className="ticket-id">{ticket.id}</span>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(ticket.id);
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="ticket-title">{ticket.title}</div>
                <div className="ticket-dates">
                  {new Date(ticket.startDate).toLocaleDateString()} -{' '}
                  {new Date(ticket.endDate).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
