import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import { emitChange } from '../../core/events';
import type { Client } from '../../core/types';

export async function createClient(input: { name: string; contact?: string | null; notes?: string | null }): Promise<Client> {
  const name = input.name.trim();
  if (!name) throw new Error('O cliente precisa de um nome.');
  const t = now();
  const c: Client = { id: uid(), name, contact: input.contact?.trim() || null, notes: input.notes?.trim() || null, created_at: t, updated_at: t };
  await db().run('INSERT INTO clients (id,name,contact,notes,created_at,updated_at) VALUES (?,?,?,?,?,?)', [c.id, c.name, c.contact, c.notes, t, t]);
  emitChange('clients');
  return c;
}

export async function listClients(): Promise<Client[]> {
  return db().all<Client>('SELECT * FROM clients ORDER BY name');
}
