import { sqliteTable, text, integer, index, primaryKey, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// These are administrative attestations against immutable public facts, never
// university decisions, student evaluations, or a shortcut to plan publication.
export const academicFactReviews = sqliteTable('academic_fact_reviews', {
  factId:text('fact_id').notNull(),
  evidenceFingerprint:text('evidence_fingerprint').notNull(),
  registryRevision:text('registry_revision').notNull(),
  revision:integer('revision').notNull(),
  decision:text('decision').notNull(),
  note:text('note').notNull(),
  sourceIdsJson:text('source_ids_json').notNull(),
  attestation:integer('attestation').notNull().default(0),
  reviewerId:text('reviewer_id').notNull(),
  lastEventId:text('last_event_id').notNull(),
  createdAt:integer('created_at').notNull(),
  updatedAt:integer('updated_at').notNull()
}, t => [
  primaryKey({columns:[t.factId,t.evidenceFingerprint]}),
  uniqueIndex('academic_fact_review_event_token').on(t.lastEventId),
  index('academic_fact_review_status').on(t.decision,t.updatedAt,t.factId),
  check('academic_fact_review_id',sql`length(${t.factId}) BETWEEN 1 AND 160`),
  check('academic_fact_review_fingerprint',sql`length(${t.evidenceFingerprint})=64 AND ${t.evidenceFingerprint} NOT GLOB '*[^a-f0-9]*'`),
  check('academic_fact_review_registry',sql`length(${t.registryRevision}) BETWEEN 1 AND 120`),
  check('academic_fact_review_revision',sql`${t.revision}>0`),
  check('academic_fact_review_decision',sql`${t.decision} IN ('reviewed-supported','needs-evidence','conflict')`),
  check('academic_fact_review_note',sql`length(${t.note}) BETWEEN 10 AND 2000`),
  check('academic_fact_review_sources',sql`json_valid(${t.sourceIdsJson}) AND json_type(${t.sourceIdsJson})='array' AND length(CAST(${t.sourceIdsJson} AS BLOB))<=8192`),
  check('academic_fact_review_attestation',sql`(${t.decision}='reviewed-supported' AND ${t.attestation}=1 AND json_array_length(${t.sourceIdsJson})>0) OR (${t.decision}!='reviewed-supported' AND ${t.attestation}=0)`),
  check('academic_fact_review_actor',sql`length(${t.reviewerId}) BETWEEN 1 AND 256`)
]);

// An append-only API log retains each decision and the exact registry supplied
// by its reviewer. No FK to a student/profile table: verified platform owners
// can review without creating a community or student profile.
export const academicFactReviewEvents = sqliteTable('academic_fact_review_events', {
  id:text('id').primaryKey(),
  factId:text('fact_id').notNull(),
  evidenceFingerprint:text('evidence_fingerprint').notNull(),
  registryRevision:text('registry_revision').notNull(),
  revision:integer('revision').notNull(),
  decision:text('decision').notNull(),
  note:text('note').notNull(),
  sourceIdsJson:text('source_ids_json').notNull(),
  attestation:integer('attestation').notNull(),
  reviewerId:text('reviewer_id').notNull(),
  createdAt:integer('created_at').notNull()
}, t => [
  uniqueIndex('academic_fact_review_event_version').on(t.factId,t.evidenceFingerprint,t.revision),
  index('academic_fact_review_history').on(t.factId,t.createdAt,t.id),
  check('academic_fact_event_fingerprint',sql`length(${t.evidenceFingerprint})=64 AND ${t.evidenceFingerprint} NOT GLOB '*[^a-f0-9]*'`),
  check('academic_fact_event_registry',sql`length(${t.registryRevision}) BETWEEN 1 AND 120`),
  check('academic_fact_event_revision',sql`${t.revision}>0`),
  check('academic_fact_event_decision',sql`${t.decision} IN ('reviewed-supported','needs-evidence','conflict')`),
  check('academic_fact_event_note',sql`length(${t.note}) BETWEEN 10 AND 2000`),
  check('academic_fact_event_sources',sql`json_valid(${t.sourceIdsJson}) AND json_type(${t.sourceIdsJson})='array' AND length(CAST(${t.sourceIdsJson} AS BLOB))<=8192`),
  check('academic_fact_event_attestation',sql`(${t.decision}='reviewed-supported' AND ${t.attestation}=1 AND json_array_length(${t.sourceIdsJson})>0) OR (${t.decision}!='reviewed-supported' AND ${t.attestation}=0)`),
  check('academic_fact_event_actor',sql`length(${t.reviewerId}) BETWEEN 1 AND 256`)
]);
