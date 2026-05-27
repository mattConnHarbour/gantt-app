export interface GanttTicket {
  id: string;              // "SD-123" or "IT-456"
  title: string;
  description?: string;
  startDate: string;       // ISO date
  endDate: string;         // ISO date
  linearUrl?: string;      // Link back to Linear
  color?: string;          // Custom color for the bar
  customer?: string;       // Customer name
  createdAt: string;
  updatedAt: string;
}

export interface LinearTicket {
  id: string;
  identifier: string;      // "SD-123"
  title: string;
  description?: string;
  url: string;
  state: { name: string };
  assignee?: { name: string };
  labels?: string[];
  customer?: string;
}

export interface TicketStore {
  tickets: GanttTicket[];
}
