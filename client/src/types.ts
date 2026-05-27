export interface GanttTicket {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  linearUrl?: string;
  color?: string;
  customer?: string;
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
