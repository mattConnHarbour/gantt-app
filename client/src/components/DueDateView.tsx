import { useMemo } from 'react';
import type { GanttTicket } from '../types';

interface Props {
  tickets: GanttTicket[];
  selectedId?: string;
  onSelect?: (ticket: GanttTicket) => void;
}

function formatDueDate(endDate: string): string {
  const end = new Date(endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const endDay = new Date(end);
  endDay.setHours(0, 0, 0, 0);

  const diffDays = Math.ceil((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return `overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
  } else if (diffDays === 0) {
    return 'due today';
  } else if (diffDays === 1) {
    return 'due tomorrow';
  } else {
    return `due ${end.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`;
  }
}

export function DueDateView({ tickets, selectedId, onSelect }: Props) {
  // Sort tickets by end date (ascending)
  const sortedTickets = useMemo(() => {
    return [...tickets].sort((a, b) => {
      const dateA = new Date(a.endDate).getTime();
      const dateB = new Date(b.endDate).getTime();
      return dateA - dateB;
    });
  }, [tickets]);

  if (sortedTickets.length === 0) {
    return (
      <div className="due-date-view">
        <div className="due-date-empty">No tickets to display</div>
      </div>
    );
  }

  return (
    <div className="due-date-view">
      <div className="due-date-list">
        {sortedTickets.map((ticket) => {
          const isOverdue = new Date(ticket.endDate) < new Date(new Date().setHours(0, 0, 0, 0));
          const isToday = formatDueDate(ticket.endDate) === 'due today';
          const isTomorrow = formatDueDate(ticket.endDate) === 'due tomorrow';

          return (
            <div
              key={ticket.id}
              className={`due-date-item ${selectedId === ticket.id ? 'selected' : ''}`}
              onClick={() => onSelect?.(ticket)}
            >
              <div
                className="due-date-ticket-box"
                style={{ backgroundColor: ticket.color || '#3b82f6' }}
              >
                <span className="due-date-ticket-title">{ticket.title}</span>
              </div>
              <div className="due-date-info">
                <span className="due-date-customer">{ticket.customer || 'Unassigned'}</span>
                <span className="due-date-separator">—</span>
                <span className={`due-date-text ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''} ${isTomorrow ? 'tomorrow' : ''}`}>
                  {formatDueDate(ticket.endDate)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
