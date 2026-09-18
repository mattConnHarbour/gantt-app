import { useMemo, useState } from 'react';
import type { GanttTicket } from '../types';
import { DragonIcon, KnightIcon } from './QuestIcons';

interface Props {
  tickets: GanttTicket[];
  selectedId?: string;
  onSelect?: (ticket: GanttTicket) => void;
  onUpdate?: (id: string, updates: { startDate: string; endDate: string }) => Promise<unknown>;
  canEdit?: boolean;
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

export function QuestTree({ tickets, selectedId, onSelect, onUpdate, canEdit }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);
  const days = useMemo(() => {
    const grouped = new Map<string, GanttTicket[]>();
    for (const ticket of tickets) {
      const date = ticket.startDate.split('T')[0];
      grouped.set(date, [...(grouped.get(date) || []), ticket]);
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const twoWeeksAhead = new Date(today);
    twoWeeksAhead.setUTCDate(twoWeeksAhead.getUTCDate() + 14);

    const ticketDates = tickets.flatMap(ticket => [
      new Date(`${ticket.startDate.split('T')[0]}T00:00:00Z`),
      new Date(`${ticket.endDate.split('T')[0]}T00:00:00Z`),
    ]).filter(date => !Number.isNaN(date.getTime()));

    const start = new Date(Math.min(today.getTime(), ...ticketDates.map(date => date.getTime())));
    const end = new Date(Math.max(twoWeeksAhead.getTime(), ...ticketDates.map(date => date.getTime())));
    const continuousDays: QuestDay[] = [];

    for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
      const key = date.toISOString().split('T')[0];
      continuousDays.push({ date: key, tickets: grouped.get(key) || [] });
    }

    return continuousDays;
  }, [tickets]);

  const moveTicket = async (targetDate: string) => {
    const ticket = tickets.find(item => item.id === draggedId);
    if (!ticket || ticket.startDate.split('T')[0] === targetDate) {
      setDraggedId(null);
      setDropDate(null);
      return;
    }

    const oldStart = new Date(`${ticket.startDate.split('T')[0]}T00:00:00Z`);
    const oldEnd = new Date(`${ticket.endDate.split('T')[0]}T00:00:00Z`);
    const durationDays = Math.max(0, Math.round((oldEnd.getTime() - oldStart.getTime()) / 86_400_000));
    const newEnd = new Date(`${targetDate}T00:00:00Z`);
    newEnd.setUTCDate(newEnd.getUTCDate() + durationDays);

    try {
      await onUpdate?.(ticket.id, {
        startDate: targetDate,
        endDate: newEnd.toISOString().split('T')[0],
      });
    } finally {
      setDraggedId(null);
      setDropDate(null);
    }
  };

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
            <div
              className={`quest-date-node ${day.tickets.length === 0 ? 'empty' : ''} ${dropDate === day.date ? 'drop-target' : ''}`}
              onDragOver={(event) => {
                if (!canEdit || !draggedId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropDate(day.date);
              }}
              onDragLeave={() => setDropDate(current => current === day.date ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                void moveTicket(day.date);
              }}
            >
              <strong>{dateLabel(day.date)}</strong>
              <span>{new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span>
            </div>

            <div className="quest-branches">
              {day.tickets.map((ticket, index) => {
                const offset = (index - (day.tickets.length - 1) / 2) * 220;
                return (
                  <button
                    key={ticket.id}
                    className={`quest-item ${selectedId === ticket.id ? 'selected' : ''}`}
                    style={{ top: `calc(50% + ${offset}px)` }}
                    onClick={() => onSelect?.(ticket)}
                    title={ticket.title}
                    draggable={canEdit}
                    onDragStart={(event) => {
                      setDraggedId(ticket.id);
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', ticket.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDropDate(null);
                    }}
                  >
                    <DragonIcon className={`quest-item-dragon ${draggedId === ticket.id ? 'dragging' : ''}`} color={ticket.color || '#3b82f6'} />
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
