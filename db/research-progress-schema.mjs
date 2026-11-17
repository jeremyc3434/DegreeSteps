import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { degreeTemplates } from './research-schema.mjs';

/** Public-research work metadata only; access is scoped through template_requests. */
export const templateResearchProgress = sqliteTable('template_research_progress', {
  templateId:text('template_id').primaryKey().references(()=>degreeTemplates.id,{onDelete:'cascade'}),
  stage:text('stage').notNull(),pass:integer('pass').notNull().default(1),
  sourceCount:integer('source_count').notNull().default(0),requirementCount:integer('requirement_count').notNull().default(0),
  updatedAt:integer('updated_at').notNull()
},t=>[
  check('template_progress_stage',sql`${t.stage} IN ('identifying','requirements','transfers','checking','refining','complete','needs-attention')`),
  check('template_progress_pass',sql`${t.pass} BETWEEN 1 AND 2`),
  check('template_progress_sources',sql`${t.sourceCount} BETWEEN 0 AND 200`),
  check('template_progress_requirements',sql`${t.requirementCount} BETWEEN 0 AND 180`)
]);
