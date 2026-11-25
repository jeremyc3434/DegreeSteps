import {sqliteTable,text,integer,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// Draft changes never overwrite the last explicitly reviewed public snapshot.
export const ownerContentRecords=sqliteTable('owner_content_records',{
 id:text('id').primaryKey(),type:text('type').notNull(),slug:text('slug').notNull(),
 status:text('status').notNull().default('draft'),revision:integer('revision').notNull().default(1),
 contentJson:text('content_json').notNull(),publishedJson:text('published_json'),
 reviewedRevision:integer('reviewed_revision'),publishedRevision:integer('published_revision'),
 reviewedAt:integer('reviewed_at'),publishedReviewedAt:integer('published_reviewed_at'),publishedAt:integer('published_at'),archivedAt:integer('archived_at'),
 createdBy:text('created_by').notNull(),updatedBy:text('updated_by').notNull(),
 createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[
 uniqueIndex('owner_content_type_slug').on(t.type,t.slug),
 index('owner_content_list').on(t.type,t.status,t.updatedAt,t.id),
 index('owner_content_public').on(t.type,t.status,t.publishedAt,t.id),
 check('owner_content_type',sql`${t.type} IN ('articles','faqs','campaigns','offers')`),
 check('owner_content_status',sql`${t.status} IN ('draft','published','archived')`),
 check('owner_content_revision',sql`${t.revision}>0 AND (${t.reviewedRevision} IS NULL OR ${t.reviewedRevision}<=${t.revision}) AND (${t.publishedRevision} IS NULL OR ${t.publishedRevision}<=${t.revision})`),
 check('owner_content_json',sql`json_valid(${t.contentJson}) AND length(CAST(${t.contentJson} AS BLOB))<=60000`),
 check('owner_content_public_json',sql`${t.publishedJson} IS NULL OR (json_valid(${t.publishedJson}) AND length(CAST(${t.publishedJson} AS BLOB))<=60000)`)
]);

export const ownerContentVersions=sqliteTable('owner_content_versions',{
 id:text('id').primaryKey(),recordId:text('record_id').notNull(),type:text('type').notNull(),
 revision:integer('revision').notNull(),action:text('action').notNull(),
 contentJson:text('content_json').notNull(),reviewNote:text('review_note'),
 actorId:text('actor_id').notNull(),createdAt:integer('created_at').notNull()
},t=>[
 index('owner_content_version_record').on(t.recordId,t.createdAt,t.id),
 check('owner_content_version_action',sql`${t.action} IN ('create','edit','review','publish','archive','starter-edit','starter-archive')`),
 check('owner_content_version_json',sql`json_valid(${t.contentJson}) AND length(CAST(${t.contentJson} AS BLOB))<=60000`)
]);

// Exported for focused SQLite fixtures and the composed deployment migration.
export const OWNER_CONTENT_DDL=`
CREATE TABLE IF NOT EXISTS owner_content_records (
 id TEXT PRIMARY KEY,type TEXT NOT NULL CHECK(type IN ('articles','faqs','campaigns','offers')),slug TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 content_json TEXT NOT NULL CHECK(json_valid(content_json) AND length(CAST(content_json AS BLOB))<=60000),published_json TEXT CHECK(published_json IS NULL OR (json_valid(published_json) AND length(CAST(published_json AS BLOB))<=60000)),
 reviewed_revision INTEGER,published_revision INTEGER,reviewed_at INTEGER,published_reviewed_at INTEGER,published_at INTEGER,archived_at INTEGER,
 created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK(reviewed_revision IS NULL OR reviewed_revision<=revision),CHECK(published_revision IS NULL OR published_revision<=revision));
CREATE UNIQUE INDEX IF NOT EXISTS owner_content_type_slug ON owner_content_records(type,slug);
CREATE INDEX IF NOT EXISTS owner_content_list ON owner_content_records(type,status,updated_at,id);
CREATE INDEX IF NOT EXISTS owner_content_public ON owner_content_records(type,status,published_at,id);
CREATE TABLE IF NOT EXISTS owner_content_versions (
 id TEXT PRIMARY KEY,record_id TEXT NOT NULL,type TEXT NOT NULL,revision INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('create','edit','review','publish','archive','starter-edit','starter-archive')),
 content_json TEXT NOT NULL CHECK(json_valid(content_json) AND length(CAST(content_json AS BLOB))<=60000),review_note TEXT,
 actor_id TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS owner_content_version_record ON owner_content_versions(record_id,created_at,id);`;
