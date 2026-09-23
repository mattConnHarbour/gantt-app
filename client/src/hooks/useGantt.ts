import { useMemo } from 'react';
import type { GanttTicket } from '../types';

export interface GanttConfig {
  startDate: Date;
  endDate: Date;
  dayWidth: number;
  rowHeight: number;
  headerHeight: number;
  dayViewDate?: Date;
}

const startOfLocalDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

// Date-only strings represent calendar dates. Parsing them with `new Date()`
// treats them as UTC, which shifts their position against the local-time grid.
export const parseCalendarDate = (date: Date | string): Date => {
  if (typeof date !== 'string') return startOfLocalDay(date);

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  return startOfLocalDay(new Date(date));
};

const calendarDayNumber = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

export function useGantt(tickets: GanttTicket[], config: Partial<GanttConfig> = {}) {
  const fullConfig: GanttConfig = useMemo(() => {
    // If dayViewDate is provided, show only that single day
    if (config.dayViewDate) {
      const dayStart = startOfLocalDay(config.dayViewDate);
      return {
        startDate: dayStart,
        endDate: dayStart,
        dayWidth: config.dayWidth ?? 60,
        rowHeight: config.rowHeight ?? 72,
        headerHeight: config.headerHeight ?? 60,
        dayViewDate: config.dayViewDate,
      };
    }

    // Default to showing 2 weeks centered around today
    const today = startOfLocalDay(new Date());
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 3);
    const defaultEnd = new Date(today);
    defaultEnd.setDate(defaultEnd.getDate() + 11);

    // If we have tickets, expand the range to include them
    let start = config.startDate ? startOfLocalDay(config.startDate) : defaultStart;
    let end = config.endDate ? startOfLocalDay(config.endDate) : defaultEnd;

    for (const ticket of tickets) {
      const ticketStart = parseCalendarDate(ticket.startDate);
      const ticketEnd = parseCalendarDate(ticket.endDate);
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
      rowHeight: config.rowHeight ?? 72,
      headerHeight: config.headerHeight ?? 60,
    };
  }, [tickets, config.startDate, config.endDate, config.dayWidth, config.rowHeight, config.headerHeight, config.dayViewDate]);

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
    const d = parseCalendarDate(date);
    const daysDiff = calendarDayNumber(d) - calendarDayNumber(fullConfig.startDate);
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
