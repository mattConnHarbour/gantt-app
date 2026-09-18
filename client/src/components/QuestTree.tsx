import { useMemo } from 'react';
import type { GanttTicket } from '../types';
import { DragonIcon, KnightIcon } from './QuestIcons';

interface Props {
  tickets: GanttTicket[];
  selectedId?: string;
  onSelect?: (ticket: GanttTicket) => void;
}

interface QuestDay {
  date: string;
  tickets: GanttTicket[];
}

function dateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const key = (d: Date) => d.toISOString().split('T')[0];

  if (value === key(today)) return 'Today';
  if (value === key(tomorrow)) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function QuestTree({ tickets, selectedId, onSelect }: Props) {
  const days = useMemo(() => {
    const grouped = new Map<string, GanttTicket[]>();
    for (const ticket of tickets) {
      const date = ticket.startDate.split('T')[0];
      grouped.set(date, [...(grouped.get(date) || []), ticket]);
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayTickets]): QuestDay => ({ date, tickets: dayTickets }));
  }, [tickets]);

  if (!days.length) {
    return <div className="quest-empty">No quests await your knight.</div>;
  }

  return (
    <div className="quest-tree-scroll">
      <div className="quest-tree" style={{ minWidth: 290 + days.length * 450 }}>
        <div className="quest-root">
          <KnightIcon className="quest-root-knight" />
        </div>

        {days.map((day) => (
          <section className="quest-stage" key={day.date}>
            <div className="quest-path-line" />
            <div className="quest-date-node">
              <strong>{dateLabel(day.date)}</strong>
              <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
            </div>

            <div className="quest-branches">
              {day.tickets.map((ticket, index) => {
                const offset = (index - (day.tickets.length - 1) / 2) * 220;
                const branchWidth = Math.sqrt(70 ** 2 + offset ** 2);
                const branchAngle = Math.atan2(offset, 70) * (180 / Math.PI);
                return (
                  <button
                    key={ticket.id}
                    className={`quest-item ${selectedId === ticket.id ? 'selected' : ''}`}
                    style={{ top: `calc(50% + ${offset}px)` }}
                    onClick={() => onSelect?.(ticket)}
                    title={ticket.title}
                  >
                    <span
                      className="quest-branch-line"
                      style={{ width: branchWidth, transform: `rotate(${branchAngle}deg)` }}
                    />
                    <DragonIcon className="quest-item-dragon" color={ticket.color || '#3b82f6'} />
                    <span className="quest-item-copy">
                      <strong>{ticket.title}</strong>
                      <small>{ticket.customer || ticket.id}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
