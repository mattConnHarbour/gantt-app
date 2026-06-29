export interface GanttTicket {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  linearUrl?: string;
  color?: string;
  customer?: string;
  notes?: string;
  isCustom?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LinearTicket {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  url: string;
  state: { name: string };
  assignee?: { name: string };
  labels?: string[];
  customer?: string;
}
