import { useState, useMemo, useEffect } from 'react';
import type { GanttTicket, LinearTicket } from '../types';
import * as api from '../api';

interface Props {
  tickets: GanttTicket[];
  onDelete?: (id: string) => Promise<void>;
  onAdd?: (ticket: LinearTicket) => Promise<void>;
  onAddCustom?: (customer: string, title: string) => Promise<void>;
  onSelect?: (ticket: GanttTicket) => void;
  selectedId?: string;
  canEdit?: boolean;
}

export function TicketList({ tickets, onDelete, onAdd, onAddCustom, onSelect, selectedId, canEdit }: Props) {
  const [filter, setFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [linearTickets, setLinearTickets] = useState<LinearTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customCustomer, setCustomCustomer] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customAdding, setCustomAdding] = useState(false);

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

  const handleAddCustom = async () => {
    if (!customCustomer.trim() || !customTitle.trim() || !onAddCustom) return;
    setCustomAdding(true);
    try {
      await onAddCustom(customCustomer.trim(), customTitle.trim());
      setCustomCustomer('');
      setCustomTitle('');
      setShowCustomForm(false);
    } catch (err) {
      console.error('Failed to add custom item:', err);
    } finally {
      setCustomAdding(false);
    }
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

      {canEdit && (
        <div className="ticket-section custom-section">
          <div className="section-header">
            <h2>Add Custom Item</h2>
            <button
              className="toggle-form-btn"
              onClick={() => setShowCustomForm(!showCustomForm)}
            >
              {showCustomForm ? '−' : '+'}
            </button>
          </div>
          {showCustomForm && (
            <div className="custom-form">
              <input
                type="text"
                className="custom-input"
                placeholder="Customer name"
                value={customCustomer}
                onChange={(e) => setCustomCustomer(e.target.value)}
              />
              <input
                type="text"
                className="custom-input"
                placeholder="Title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCustom();
                }}
              />
              <button
                className="add-custom-btn"
                onClick={handleAddCustom}
                disabled={customAdding || !customCustomer.trim() || !customTitle.trim()}
              >
                {customAdding ? 'Adding...' : 'Add'}
              </button>
            </div>
          )}
        </div>
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
                className={`ticket-item linear-ticket ${!canEdit ? 'readonly' : ''}`}
                draggable={canEdit}
                onDragStart={canEdit ? (e) => handleDragStart(e, ticket) : undefined}
              >
                <div className="ticket-header">
                  <span className="ticket-id">
                    {ticket.identifier}
                    {ticket.customer && <span className="ticket-customer"> [{ticket.customer}]</span>}
                  </span>
                  <span className="ticket-state">{ticket.state?.name || 'Unknown'}</span>
                </div>
                <div className="ticket-title">{ticket.title}</div>
                {canEdit && (
                  <div className="ticket-actions">
                    <button
                      className="add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdd?.(ticket);
                      }}
                    >
                      Add
                    </button>
                  </div>
                )}
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
                className={`ticket-item ${selectedId === ticket.id ? 'selected' : ''} ${ticket.isCustom || ticket.id.startsWith('custom-') ? 'custom-item' : ''}`}
                onClick={() => onSelect?.(ticket)}
                style={{ borderLeftColor: ticket.color }}
              >
                <div className="ticket-header">
                  {!ticket.isCustom && !ticket.id.startsWith('custom-') && <span className="ticket-id">{ticket.id}</span>}
                  {(ticket.isCustom || ticket.id.startsWith('custom-')) && ticket.customer && (
                    <span className="ticket-customer">[{ticket.customer}]</span>
                  )}
                  {canEdit && onDelete && (
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
                  )}
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
