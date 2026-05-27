import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { GanttTicket, TicketStore } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');
const DATA_FILE = join(DATA_DIR, 'tickets.json');

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readStore(): Promise<TicketStore> {
  await ensureDataDir();
  try {
    const data = await readFile(DATA_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { tickets: [] };
  }
}

async function writeStore(store: TicketStore): Promise<void> {
  await ensureDataDir();
  await writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

export async function getAllTickets(): Promise<GanttTicket[]> {
  const store = await readStore();
  return store.tickets;
}

export async function getTicketById(id: string): Promise<GanttTicket | undefined> {
  const store = await readStore();
  return store.tickets.find(t => t.id === id);
}

export async function createTicket(ticket: Omit<GanttTicket, 'createdAt' | 'updatedAt'>): Promise<GanttTicket> {
  const store = await readStore();
  const now = new Date().toISOString();

  const existing = store.tickets.find(t => t.id === ticket.id);
  if (existing) {
    throw new Error(`Ticket ${ticket.id} already exists`);
  }

  const newTicket: GanttTicket = {
    ...ticket,
    createdAt: now,
    updatedAt: now,
  };

  store.tickets.push(newTicket);
  await writeStore(store);
  return newTicket;
}

export async function updateTicket(
  id: string,
  updates: Partial<Omit<GanttTicket, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<GanttTicket | undefined> {
  const store = await readStore();
  const index = store.tickets.findIndex(t => t.id === id);

  if (index === -1) {
    return undefined;
  }

  store.tickets[index] = {
    ...store.tickets[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await writeStore(store);
  return store.tickets[index];
}

export async function deleteTicket(id: string): Promise<boolean> {
  const store = await readStore();
  const index = store.tickets.findIndex(t => t.id === id);

  if (index === -1) {
    return false;
  }

  store.tickets.splice(index, 1);
  await writeStore(store);
  return true;
}
