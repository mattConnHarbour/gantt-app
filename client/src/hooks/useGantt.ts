import { useMemo } from 'react';
import type { GanttTicket } from '../types';

export interface GanttConfig {
  startDate: Date;
  endDate: Date;
  dayWidth: number;
  rowHeight: number;
  headerHeight: number;
}

export function useGantt(tickets: GanttTicket[], config: Partial<GanttConfig> = {}) {
  const fullConfig: GanttConfig = useMemo(() => {
    // Default to showing 2 weeks centered around today
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 3);
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + 11);

    // If we have tickets, expand the range to include them
    let start = config.startDate ?? defaultStart;
    let end = config.endDate ?? defaultEnd;

    for (const ticket of tickets) {
      const ticketStart = new Date(ticket.startDate);
      const ticketEnd = new Date(ticket.endDate);
      if (ticketStart < start) start = ticketStart;
      if (ticketEnd > end) end = ticketEnd;
    }

    // Add some padding
    start = new Date(start);
    start.setDate(start.getDate() - 1);
    end = new Date(end);
    end.setDate(end.getDate() + 1);

    return {
      startDate: start,
      endDate: end,
      dayWidth: config.dayWidth ?? 60,
      rowHeight: config.rowHeight ?? 50,
      headerHeight: config.headerHeight ?? 60,
    };
  }, [tickets, config.startDate, config.endDate, config.dayWidth, config.rowHeight, config.headerHeight]);

  const days = useMemo(() => {
    const result: Date[] = [];
    const current = new Date(fullConfig.startDate);
    while (current <= fullConfig.endDate) {
      result.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return result;
  }, [fullConfig.startDate, fullConfig.endDate]);

  const totalWidth = days.length * fullConfig.dayWidth;
  const totalHeight = fullConfig.headerHeight + tickets.length * fullConfig.rowHeight;

  const getDatePosition = (date: Date | string): number => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const diff = d.getTime() - fullConfig.startDate.getTime();
    const daysDiff = diff / (1000 * 60 * 60 * 24);
    return daysDiff * fullConfig.dayWidth;
  };

  const getPositionDate = (x: number): Date => {
    const daysDiff = x / fullConfig.dayWidth;
    const result = new Date(fullConfig.startDate);
    result.setDate(result.getDate() + Math.round(daysDiff));
    return result;
  };

  return {
    config: fullConfig,
    days,
    totalWidth,
    totalHeight,
    getDatePosition,
    getPositionDate,
  };
}
