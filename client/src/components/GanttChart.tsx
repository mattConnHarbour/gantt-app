import { useRef, useState, useCallback, useMemo } from 'react';
import type { GanttTicket, LinearTicket } from '../types';
import { useGantt } from '../hooks/useGantt';

interface CustomerGroup {
  customer: string;
  tickets: GanttTicket[];
}

interface Props {
  tickets: GanttTicket[];
  onUpdate?: (id: string, updates: { startDate?: string; endDate?: string; notes?: string }) => Promise<unknown>;
  onDropLinearTicket?: (ticket: LinearTicket, startDate: string) => Promise<void>;
  selectedId?: string;
  onSelect?: (ticket: GanttTicket) => void;
  canEdit?: boolean;
  dayViewDate?: Date | null;
}

interface DragState {
  ticketId: string;
  type: 'move' | 'resize-start' | 'resize-end';
  startX: number;
  initialStartDate: string;
  initialEndDate: string;
}

const formatDate = (d: Date) => d.toISOString().split('T')[0];

const GROUP_HEADER_HEIGHT = 32;

export function GanttChart({ tickets, onUpdate, onDropLinearTicket, selectedId, onSelect, canEdit, dayViewDate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropHighlight, setDropHighlight] = useState(false);
  const { config, days, totalWidth, getDatePosition, getPositionDate } = useGantt(tickets, { dayViewDate: dayViewDate ?? undefined });

  // Group tickets by customer
  const customerGroups = useMemo((): CustomerGroup[] => {
    const groupMap = new Map<string, GanttTicket[]>();

    for (const ticket of tickets) {
      const customer = ticket.customer || 'Unassigned';
      if (!groupMap.has(customer)) {
        groupMap.set(customer, []);
      }
      groupMap.get(customer)!.push(ticket);
    }

    // Sort groups alphabetically, but put 'Unassigned' at the end
    return Array.from(groupMap.entries())
      .sort(([a], [b]) => {
        if (a === 'Unassigned') return 1;
        if (b === 'Unassigned') return -1;
        return a.localeCompare(b);
      })
      .map(([customer, groupTickets]) => ({ customer, tickets: groupTickets }));
  }, [tickets]);

  // Calculate total height with group headers
  const totalHeight = useMemo(() => {
    return config.headerHeight +
      customerGroups.length * GROUP_HEADER_HEIGHT +
      tickets.length * config.rowHeight;
  }, [config.headerHeight, config.rowHeight, customerGroups.length, tickets.length]);


  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropHighlight(true);
  }, [canEdit]);

  const handleDragLeave = useCallback(() => {
    setDropHighlight(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropHighlight(false);

    const data = e.dataTransfer.getData('application/json');
    if (!data) return;

    try {
      const linearTicket: LinearTicket = JSON.parse(data);

      // Calculate drop position relative to the scroll container
      const scrollEl = scrollRef.current;
      if (!scrollEl) return;

      const rect = scrollEl.getBoundingClientRect();
      const x = e.clientX - rect.left + scrollEl.scrollLeft;
      const startDate = getPositionDate(x);

      await onDropLinearTicket?.(linearTicket, formatDate(startDate));
    } catch (err) {
      console.error('Drop failed:', err);
    }
  }, [getPositionDate, onDropLinearTicket]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, ticket: GanttTicket, type: DragState['type']) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      setDragState({
        ticketId: ticket.id,
        type,
        startX: e.clientX,
        initialStartDate: ticket.startDate,
        initialEndDate: ticket.endDate,
      });
    },
    [canEdit]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragState) return;

      const ticket = tickets.find((t) => t.id === dragState.ticketId);
      if (!ticket) return;

      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / config.dayWidth);

      if (deltaDays === 0) return;

      const initialStart = new Date(dragState.initialStartDate);
      const initialEnd = new Date(dragState.initialEndDate);

      let newStartDate = formatDate(initialStart);
      let newEndDate = formatDate(initialEnd);

      if (dragState.type === 'move') {
        const newStart = new Date(initialStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        const newEnd = new Date(initialEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        newStartDate = formatDate(newStart);
        newEndDate = formatDate(newEnd);
      } else if (dragState.type === 'resize-start') {
        const newStart = new Date(initialStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        if (newStart < initialEnd) {
          newStartDate = formatDate(newStart);
        }
      } else if (dragState.type === 'resize-end') {
        const newEnd = new Date(initialEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        if (newEnd > initialStart) {
          newEndDate = formatDate(newEnd);
        }
      }

      // Optimistic update during drag
      const bar = document.querySelector(`[data-ticket-id="${ticket.id}"]`) as HTMLElement;
      if (bar) {
        const left = getDatePosition(newStartDate);
        const width = getDatePosition(newEndDate) - left + config.dayWidth;
        bar.style.left = `${left}px`;
        bar.style.width = `${width}px`;
      }
    },
    [dragState, tickets, config.dayWidth, getDatePosition]
  );

  const handlePointerUp = useCallback(
    async (e: React.PointerEvent) => {
      if (!dragState) return;

      (e.target as HTMLElement).releasePointerCapture(e.pointerId);

      const ticket = tickets.find((t) => t.id === dragState.ticketId);
      if (!ticket) {
        setDragState(null);
        return;
      }

      const deltaX = e.clientX - dragState.startX;
      const deltaDays = Math.round(deltaX / config.dayWidth);

      const initialStart = new Date(dragState.initialStartDate);
      const initialEnd = new Date(dragState.initialEndDate);

      let newStartDate = formatDate(initialStart);
      let newEndDate = formatDate(initialEnd);

      if (dragState.type === 'move') {
        const newStart = new Date(initialStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        const newEnd = new Date(initialEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        newStartDate = formatDate(newStart);
        newEndDate = formatDate(newEnd);
      } else if (dragState.type === 'resize-start') {
        const newStart = new Date(initialStart);
        newStart.setDate(newStart.getDate() + deltaDays);
        if (newStart < initialEnd) {
          newStartDate = formatDate(newStart);
        }
      } else if (dragState.type === 'resize-end') {
        const newEnd = new Date(initialEnd);
        newEnd.setDate(newEnd.getDate() + deltaDays);
        if (newEnd > initialStart) {
          newEndDate = formatDate(newEnd);
        }
      }

      setDragState(null);

      if (newStartDate !== ticket.startDate || newEndDate !== ticket.endDate) {
        await onUpdate?.(ticket.id, { startDate: newStartDate, endDate: newEndDate });
      }
    },
    [dragState, tickets, config.dayWidth, onUpdate]
  );

  const handleNotesBlur = useCallback(
    async (ticketId: string, notes: string) => {
      const ticket = tickets.find(t => t.id === ticketId);
      if (ticket && notes !== (ticket.notes || '')) {
        await onUpdate?.(ticketId, { notes });
      }
    },
    [tickets, onUpdate]
  );

  const handleNotesKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.currentTarget.blur();
      }
    },
    []
  );

  // Today line position
  const todayPosition = getDatePosition(new Date());

  return (
    <div className={`gantt-chart ${dropHighlight ? 'drop-highlight' : ''}`} ref={containerRef}>
      <div
        ref={scrollRef}
        className="gantt-scroll"
        onPointerMove={dragState ? handlePointerMove : undefined}
        onPointerUp={dragState ? handlePointerUp : undefined}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ touchAction: dragState ? 'none' : 'pan-x pan-y' }}
      >
        <div className="gantt-content" style={{ width: totalWidth, height: totalHeight }}>
          {/* Header */}
          <div className="gantt-header" style={{ height: config.headerHeight }}>
            {days.map((day, i) => {
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const isToday = formatDate(day) === formatDate(new Date());
              return (
                <div
                  key={i}
                  className={`gantt-day-header ${isWeekend ? 'weekend' : ''} ${isToday ? 'today' : ''}`}
                  style={{ width: config.dayWidth, left: i * config.dayWidth }}
                >
                  <div className="day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className="day-date">{day.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Grid background */}
          <div className="gantt-grid" style={{ top: config.headerHeight }}>
            {days.map((day, i) => {
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`gantt-grid-line ${isWeekend ? 'weekend' : ''}`}
                  style={{ left: i * config.dayWidth, width: config.dayWidth }}
                />
              );
            })}
          </div>

          {/* Today line */}
          {todayPosition >= 0 && todayPosition <= totalWidth && (
            <div
              className="gantt-today-line"
              style={{ left: todayPosition + config.dayWidth / 2, top: config.headerHeight }}
            />
          )}

          {/* Customer groups and ticket bars */}
          <div className="gantt-bars" style={{ top: config.headerHeight }}>
            {(() => {
              let currentY = 0;
              return customerGroups.map((group) => {
                const groupHeaderY = currentY;
                currentY += GROUP_HEADER_HEIGHT;

                const groupElements = (
                  <div key={group.customer} className="gantt-customer-group">
                    {/* Customer group header */}
                    <div
                      className="gantt-group-header"
                      style={{
                        top: groupHeaderY,
                        width: totalWidth,
                        height: GROUP_HEADER_HEIGHT,
                      }}
                    >
                      <span className="group-name">{group.customer}</span>
                      <span className="group-count">{group.tickets.length}</span>
                    </div>

                    {/* Tickets in this group */}
                    {group.tickets.map((ticket) => {
                      const left = getDatePosition(ticket.startDate);
                      const width = getDatePosition(ticket.endDate) - left + config.dayWidth;
                      const top = currentY + (config.rowHeight - 56) / 2;
                      currentY += config.rowHeight;

                      return (
                        <div
                          key={ticket.id}
                          data-ticket-id={ticket.id}
                          className={`gantt-bar ${selectedId === ticket.id ? 'selected' : ''} ${
                            dragState?.ticketId === ticket.id ? 'dragging' : ''
                          }`}
                          style={{
                            left,
                            top,
                            width,
                            backgroundColor: ticket.color || '#3b82f6',
                          }}
                          onClick={() => onSelect?.(ticket)}
                        >
                          <div
                            className="resize-handle left"
                            onPointerDown={(e) => handlePointerDown(e, ticket, 'resize-start')}
                          />
                          <div
                            className="bar-content"
                            onPointerDown={(e) => handlePointerDown(e, ticket, 'move')}
                          >
                            {!ticket.isCustom && !ticket.id.startsWith('custom-') && <span className="bar-id">{ticket.id}</span>}
                            <span className="bar-title">{ticket.title}</span>
                            {canEdit ? (
                              <input
                                type="text"
                                className="bar-notes"
                                placeholder="Add note..."
                                defaultValue={ticket.notes || ''}
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onBlur={(e) => handleNotesBlur(ticket.id, e.target.value)}
                                onKeyDown={handleNotesKeyDown}
                              />
                            ) : ticket.notes ? (
                              <span className="bar-notes-readonly">{ticket.notes}</span>
                            ) : null}
                          </div>
                          <div
                            className="resize-handle right"
                            onPointerDown={(e) => handlePointerDown(e, ticket, 'resize-end')}
                          />
                        </div>
                      );
                    })}
                  </div>
                );

                return groupElements;
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
