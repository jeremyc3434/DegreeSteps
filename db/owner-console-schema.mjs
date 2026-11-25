import {sqliteTable,text,integer,index,primaryKey,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// One immutable application-owner binding. Community moderators and additional owners do not inherit it.
export const businessOwner=sqliteTable('business_owner',{
 singleton:integer('singleton').primaryKey().default(1),userId:text('user_id').notNull(),source:text('source').notNull(),createdAt:integer('created_at').notNull()
},t=>[check('business_owner_singleton',sql`${t.singleton}=1`),check('business_owner_id',sql`length(${t.userId}) BETWEEN 1 AND 256`),check('business_owner_source',sql`${t.source}='subject-hash'`)]);
export const businessAudit=sqliteTable('business_audit',{
 id:text('id').primaryKey(),actorId:text('actor_id').notNull(),action:text('action').notNull(),targetType:text('target_type').notNull(),targetId:text('target_id').notNull(),detailsJson:text('details_json').notNull().default('{}'),createdAt:integer('created_at').notNull()
},t=>[index('business_audit_history').on(t.createdAt,t.id),index('business_audit_target').on(t.targetType,t.targetId,t.createdAt),check('business_audit_fields',sql`length(${t.actorId}) BETWEEN 1 AND 256 AND length(${t.action}) BETWEEN 1 AND 80 AND length(${t.targetType}) BETWEEN 1 AND 60 AND length(${t.targetId})<=256`),check('business_audit_details',sql`json_valid(${t.detailsJson}) AND length(CAST(${t.detailsJson} AS BLOB))<=8192`)]);
export const businessConnections=sqliteTable('business_connections',{
 id:text('id').primaryKey(),projectOrigin:text('project_origin').notNull(),ciphertext:text('ciphertext'),iv:text('iv'),revision:integer('revision').notNull().default(1),verifiedAt:integer('verified_at'),updatedBy:text('updated_by').notNull(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull()
},t=>[check('business_connection_id',sql`${t.id}='supabase-admin'`),check('business_connection_revision',sql`${t.revision}>0`),check('business_connection_encryption',sql`(${t.ciphertext} IS NULL AND ${t.iv} IS NULL) OR (length(${t.ciphertext}) BETWEEN 20 AND 16384 AND length(${t.iv})=24)`)]);
export const businessOwnerLimits=sqliteTable('business_owner_limits',{
 ownerId:text('owner_id').notNull(),action:text('action').notNull(),windowStart:integer('window_start').notNull(),count:integer('count').notNull()
},t=>[primaryKey({columns:[t.ownerId,t.action]}),check('business_owner_limit_action',sql`${t.action} IN ('connection','directory-sync','directory-read')`),check('business_owner_limit_count',sql`${t.count}>0`)]);
// Accounts are read from the Auth Admin API. No private course rows, student plans or tokens are cached here.
export const businessStudentDirectory=sqliteTable('business_student_directory',{
 id:text('id').primaryKey(),authId:text('auth_id').notNull(),email:text('email').notNull().default(''),emailConfirmed:integer('email_confirmed').notNull().default(0),createdAt:integer('created_at'),lastSignInAt:integer('last_sign_in_at'),bannedUntil:text('banned_until'),excluded:integer('excluded').notNull().default(0),generation:text('generation').notNull(),syncedAt:integer('synced_at').notNull()
},t=>[index('business_student_directory_page').on(t.excluded,t.email,t.id),index('business_student_directory_generation').on(t.generation,t.excluded),check('business_student_directory_flags',sql`${t.emailConfirmed} IN (0,1) AND ${t.excluded} IN (0,1)`),check('business_student_directory_metadata',sql`length(${t.id}) BETWEEN 1 AND 256 AND length(${t.authId})<=128 AND length(${t.email})<=254`)]);
export const businessStudentSync=sqliteTable('business_student_sync',{
 id:text('id').primaryKey(),generation:text('generation').notNull(),nextPage:integer('next_page').notNull().default(1),complete:integer('complete').notNull().default(0),revision:integer('revision').notNull().default(1),leaseToken:text('lease_token'),leaseUntil:integer('lease_until'),startedAt:integer('started_at').notNull(),updatedAt:integer('updated_at').notNull(),providerTotal:integer('provider_total')
},t=>[check('business_student_sync_id',sql`${t.id}='supabase-auth'`),check('business_student_sync_values',sql`${t.nextPage}>0 AND ${t.revision}>0 AND ${t.complete} IN (0,1)`)]);
