import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { GanttTicket, TicketStore } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.GANTT_DATA_DIR || join(__dirname, '../../data');
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
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { tickets: [] };
    throw error;
  }
}

async function writeStore(store: TicketStore): Promise<void> {
  await ensureDataDir();
  const temporary = `${DATA_FILE}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2));
  await rename(temporary, DATA_FILE);
}

export async function getAllTickets(): Promise<GanttTicket[]> {
  const store = await readStore();
  return store.tickets;
}

export async function getTicketById(id: string): Promise<GanttTicket | undefined> {
  const store = await readStore();
  return store.tickets.find(t => t.id === id);
}

let mutationQueue: Promise<unknown> = Promise.resolve();

function mutate<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(operation);
  mutationQueue = result.catch(() => undefined);
  return result;
}

export async function createTicket(ticket: Omit<GanttTicket, 'createdAt' | 'updatedAt'>): Promise<GanttTicket> {
  return mutate(async () => {
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
  });
}

export async function updateTicket(
  id: string,
  updates: Partial<Omit<GanttTicket, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<GanttTicket | undefined> {
  return mutate(async () => {
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
  });
}

export async function deleteTicket(id: string): Promise<boolean> {
  return mutate(async () => {
  const store = await readStore();
  const index = store.tickets.findIndex(t => t.id === id);

  if (index === -1) {
    return false;
  }

  store.tickets.splice(index, 1);
  await writeStore(store);
  return true;
  });
}
