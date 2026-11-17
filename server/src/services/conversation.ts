import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Turn = { eventId: string; user: string; prompt: string; reply: string; ts: string };
const directory = process.env.GANTT_DATA_DIR || join(dirname(fileURLToPath(import.meta.url)), '../../data');
const file = join(directory, 'gandalf-conversations.json');
let writeQueue: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<Record<string, Turn[]>> {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}
export async function getConversation(channel: string): Promise<Turn[]> {
  return (await readAll())[channel] || [];
}
export async function saveTurn(channel: string, turn: Turn): Promise<void> {
  const operation = writeQueue.then(async () => {
    const all = await readAll();
    const turns = all[channel] || [];
    if (turns.some(item => item.eventId === turn.eventId)) return;
    all[channel] = [...turns, turn].slice(-100);
    await mkdir(directory, { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(all));
    await rename(tmp, file);
  });
  writeQueue = operation.catch(() => undefined);
  await operation;
}
