import { sqliteTable, text, integer, index, primaryKey, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/** Encrypted owner-managed credentials. Plaintext credentials never enter these tables. */
export const aiServiceConnections = sqliteTable('ai_service_connections', {
  id:text('id').primaryKey(),ciphertext:text('ciphertext'),iv:text('iv'),
  revision:integer('revision').notNull(),verifiedAt:integer('verified_at'),
  updatedBy:text('updated_by').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
}, t => [check('ai_connection_service',sql`${t.id} = 'anthropic'`),
  check('ai_connection_revision',sql`${t.revision} > 0`),
  check('ai_connection_encrypted_pair',sql`(${t.ciphertext} IS NULL AND ${t.iv} IS NULL AND ${t.verifiedAt} IS NULL) OR (${t.ciphertext} IS NOT NULL AND length(${t.ciphertext}) BETWEEN 44 AND 5600 AND ${t.iv} IS NOT NULL AND length(${t.iv}) = 24 AND ${t.verifiedAt} IS NOT NULL)`)]);

export const aiConnectionEvents = sqliteTable('ai_connection_events', {
  id:text('id').primaryKey(),service:text('service').notNull(),actorId:text('actor_id').notNull(),
  action:text('action').notNull(),revision:integer('revision').notNull(),source:text('source').notNull(),
  createdAt:integer('created_at').notNull()
}, t => [index('ai_connection_events_created').on(t.createdAt,t.id),
  check('ai_connection_event_service',sql`${t.service} = 'anthropic'`),
  check('ai_connection_event_action',sql`${t.action} IN ('connect','rotate','disconnect','test')`),
  check('ai_connection_event_revision',sql`${t.revision} >= 0`),
  check('ai_connection_event_source',sql`${t.source} IN ('managed','environment','none')`)]);

export const aiConnectionRateLimits = sqliteTable('ai_connection_rate_limits', {
  userId:text('user_id').notNull(),windowStart:integer('window_start').notNull(),count:integer('count').notNull()
}, t => [primaryKey({columns:[t.userId]}),check('ai_connection_rate_count',sql`${t.count} > 0`)]);
