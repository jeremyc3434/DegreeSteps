import {sqliteTable,text,integer,index,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// Owner-only SEO setup and imported reports. These never enter student records,
// public assets, or academic verification. A DNS observation is not Google ownership.
export const ownerSearchSettings=sqliteTable('owner_search_settings',{
  property:text('property').primaryKey(),
  revision:integer('revision').notNull(),
  verificationToken:text('verification_token'),
  dnsStatus:text('dns_status').notNull().default('unchecked'),
  dnsCheckedAt:integer('dns_checked_at'),
  googleOwnershipReported:integer('google_ownership_reported').notNull().default(0),
  googleOwnershipReportedAt:integer('google_ownership_reported_at'),
  sitemapSubmittedReported:integer('sitemap_submitted_reported').notNull().default(0),
  sitemapSubmittedReportedAt:integer('sitemap_submitted_reported_at'),
  updatedBy:text('updated_by').notNull(),
  updatedAt:integer('updated_at').notNull()
},t=>[
  check('owner_search_property',sql`${t.property}='degreesteps.com'`),
  check('owner_search_revision',sql`${t.revision}>0`),
  check('owner_search_dns_status',sql`${t.dnsStatus} IN ('unchecked','present','not-found','check-failed')`),
  check('owner_search_reported_flags',sql`${t.googleOwnershipReported} IN (0,1) AND ${t.sitemapSubmittedReported} IN (0,1)`),
  check('owner_search_public_token_length',sql`${t.verificationToken} IS NULL OR length(${t.verificationToken}) BETWEEN 35 AND 300`)
]);

export const ownerSearchImports=sqliteTable('owner_search_imports',{
  id:text('id').primaryKey(),
  property:text('property').notNull(),
  fingerprint:text('fingerprint').notNull(),
  fileName:text('file_name').notNull(),
  dimension:text('dimension').notNull(),
  startDate:text('start_date').notNull(),
  endDate:text('end_date').notNull(),
  exportedOn:text('exported_on').notNull(),
  searchType:text('search_type').notNull(),
  filters:text('filters').notNull(),
  rowCount:integer('row_count').notNull(),
  rowsJson:text('rows_json').notNull(),
  summaryJson:text('summary_json').notNull(),
  importedBy:text('imported_by').notNull(),
  importedAt:integer('imported_at').notNull()
},t=>[
  uniqueIndex('owner_search_import_fingerprint').on(t.property,t.fingerprint),
  index('owner_search_import_recent').on(t.property,t.importedAt,t.id),
  index('owner_search_import_dimension').on(t.property,t.dimension,t.importedAt,t.id),
  check('owner_search_import_property',sql`${t.property}='degreesteps.com'`),
  check('owner_search_import_dimension_kind',sql`${t.dimension} IN ('date','query','page','country','device')`),
  check('owner_search_import_row_count',sql`${t.rowCount} BETWEEN 1 AND 5000`),
  check('owner_search_import_rows',sql`json_valid(${t.rowsJson}) AND json_type(${t.rowsJson})='array' AND json_array_length(${t.rowsJson})=${t.rowCount} AND length(CAST(${t.rowsJson} AS BLOB))<=1900000`),
  check('owner_search_import_summary',sql`json_valid(${t.summaryJson}) AND length(CAST(${t.summaryJson} AS BLOB))<=16384`),
  check('owner_search_import_fingerprint_shape',sql`length(${t.fingerprint})=64 AND ${t.fingerprint} NOT GLOB '*[^a-f0-9]*'`),
  check('owner_search_import_origin',sql`length(${t.importedBy}) BETWEEN 1 AND 256`)
]);
