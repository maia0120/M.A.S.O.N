import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import { emitChange } from '../../core/events';
import type { Activity } from '../../core/types';

export async function logActivity(a: Omit<Activity, 'id' | 'created_at'>): Promise<void> {
  await db().run(
    'INSERT INTO activities (id, type, entity_type, entity_id, summary, section, created_at) VALUES (?,?,?,?,?,?,?)',
    [uid(), a.type, a.entity_type, a.entity_id, a.summary, a.section, now()],
  );
  emitChange('activities');
}

export async function recentActivities(limit = 10): Promise<Activity[]> {
  return db().all<Activity>('SELECT * FROM activities ORDER BY created_at DESC LIMIT ?', [limit]);
}
