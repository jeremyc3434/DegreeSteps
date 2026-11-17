import {sqliteTable,text,index,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';

// Public university source facts only. Student records and uploaded audits never
// enter this shared monthly cache.
export const curriculumSourceCache=sqliteTable('curriculum_source_cache',{
 cacheKey:text('cache_key').primaryKey(),
 programId:text('program_id').notNull(),
 sourceUrl:text('source_url'),
 payloadJson:text('payload_json').notNull(),
 sourceHash:text('source_hash'),
 checkedAt:text('checked_at').notNull(),
 expiresAt:text('expires_at').notNull()
},t=>[
 index('curriculum_source_cache_program').on(t.programId),
 index('curriculum_source_cache_expiry').on(t.expiresAt),
 check('curriculum_source_cache_payload',sql`json_valid(${t.payloadJson}) AND length(CAST(${t.payloadJson} AS BLOB)) <= 1048576`),
 check('curriculum_source_cache_key',sql`length(${t.cacheKey}) BETWEEN 1 AND 500`),
 check('curriculum_source_cache_hash',sql`${t.sourceHash} IS NULL OR length(${t.sourceHash}) = 64`)
]);
