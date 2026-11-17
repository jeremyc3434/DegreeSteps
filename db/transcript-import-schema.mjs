import { sqliteTable, text, integer, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Attempt metadata only. Documents, extracted rows, names and filenames are not stored.
export const transcriptImportRuns = sqliteTable('transcript_import_runs', {
  id:text('id').primaryKey(), userId:text('user_id').notNull(), startedAt:integer('started_at').notNull()
},t=>[index('transcript_import_global_window').on(t.startedAt),index('transcript_import_owner_window').on(t.userId,t.startedAt),check('transcript_import_started',sql`${t.startedAt} >= 0`)]);
