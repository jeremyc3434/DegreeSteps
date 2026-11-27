/** Fixed operator snapshot scope. Tests enforce parity with the migration-owned schema. */
export const D1_SNAPSHOT_TABLES = Object.freeze([
  {
    "name": "academic_fact_review_events",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "fact_id",
        "type": "text"
      },
      {
        "name": "evidence_fingerprint",
        "type": "text"
      },
      {
        "name": "registry_revision",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "decision",
        "type": "text"
      },
      {
        "name": "note",
        "type": "text"
      },
      {
        "name": "source_ids_json",
        "type": "text"
      },
      {
        "name": "attestation",
        "type": "integer"
      },
      {
        "name": "reviewer_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "academic_fact_reviews",
    "columns": [
      {
        "name": "fact_id",
        "type": "text"
      },
      {
        "name": "evidence_fingerprint",
        "type": "text"
      },
      {
        "name": "registry_revision",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "decision",
        "type": "text"
      },
      {
        "name": "note",
        "type": "text"
      },
      {
        "name": "source_ids_json",
        "type": "text"
      },
      {
        "name": "attestation",
        "type": "integer"
      },
      {
        "name": "reviewer_id",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "ai_connection_events",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "service",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "source",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "ai_connection_rate_limits",
    "columns": [
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "window_start",
        "type": "integer"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "ai_service_connections",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "ciphertext",
        "type": "text"
      },
      {
        "name": "iv",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "verified_at",
        "type": "integer"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_audit",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "target_type",
        "type": "text"
      },
      {
        "name": "target_id",
        "type": "text"
      },
      {
        "name": "details_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_connections",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "project_origin",
        "type": "text"
      },
      {
        "name": "ciphertext",
        "type": "text"
      },
      {
        "name": "iv",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "verified_at",
        "type": "integer"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_owner",
    "columns": [
      {
        "name": "singleton",
        "type": "integer"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "source",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_owner_limits",
    "columns": [
      {
        "name": "owner_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "window_start",
        "type": "integer"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_student_directory",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "auth_id",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "email_confirmed",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "last_sign_in_at",
        "type": "integer"
      },
      {
        "name": "banned_until",
        "type": "text"
      },
      {
        "name": "excluded",
        "type": "integer"
      },
      {
        "name": "generation",
        "type": "text"
      },
      {
        "name": "synced_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "business_student_sync",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "generation",
        "type": "text"
      },
      {
        "name": "next_page",
        "type": "integer"
      },
      {
        "name": "complete",
        "type": "integer"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "lease_token",
        "type": "text"
      },
      {
        "name": "lease_until",
        "type": "integer"
      },
      {
        "name": "started_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "provider_total",
        "type": "integer"
      }
    ]
  },
  {
    "name": "coach_questions",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "question",
        "type": "text"
      },
      {
        "name": "topics_json",
        "type": "text"
      },
      {
        "name": "tools_json",
        "type": "text"
      },
      {
        "name": "plan_ids_json",
        "type": "text"
      },
      {
        "name": "ask_school",
        "type": "integer"
      },
      {
        "name": "used_saved",
        "type": "integer"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "model",
        "type": "text"
      },
      {
        "name": "input_tokens",
        "type": "integer"
      },
      {
        "name": "output_tokens",
        "type": "integer"
      },
      {
        "name": "cache_write_tokens",
        "type": "integer"
      },
      {
        "name": "cache_read_tokens",
        "type": "integer"
      },
      {
        "name": "cost_micro_usd",
        "type": "integer"
      },
      {
        "name": "answer",
        "type": "text"
      },
      {
        "name": "rating",
        "type": "integer"
      },
      {
        "name": "rating_reason",
        "type": "text"
      },
      {
        "name": "rated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "coach_spend_days",
    "columns": [
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "cost_micro_usd",
        "type": "integer"
      },
      {
        "name": "calls",
        "type": "integer"
      }
    ]
  },
  {
    "name": "coach_visitor_days",
    "columns": [
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "visitor_hash",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "college_access_audit",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "target_id",
        "type": "text"
      },
      {
        "name": "note",
        "type": "text"
      },
      {
        "name": "organization_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "college_access_rate_limits",
    "columns": [
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "window_start",
        "type": "integer"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "college_interest_requests",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "organization_id",
        "type": "text"
      },
      {
        "name": "contact_name",
        "type": "text"
      },
      {
        "name": "contact_email",
        "type": "text"
      },
      {
        "name": "program_interest",
        "type": "text"
      },
      {
        "name": "study_format",
        "type": "text"
      },
      {
        "name": "start_timing",
        "type": "text"
      },
      {
        "name": "consent_version",
        "type": "text"
      },
      {
        "name": "consent_text",
        "type": "text"
      },
      {
        "name": "consented_at",
        "type": "integer"
      },
      {
        "name": "withdrawn_at",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "college_memberships",
    "columns": [
      {
        "name": "organization_id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "role",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "granted_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "college_organizations",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "website",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "verified_by",
        "type": "text"
      },
      {
        "name": "verified_at",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_comments",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "context",
        "type": "text"
      },
      {
        "name": "parent_id",
        "type": "text"
      },
      {
        "name": "body",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "deleted_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_context_reactions",
    "columns": [
      {
        "name": "context",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "reaction",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_evidence",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "target_kind",
        "type": "text"
      },
      {
        "name": "target_key",
        "type": "text"
      },
      {
        "name": "program_id",
        "type": "text"
      },
      {
        "name": "requirement_id",
        "type": "text"
      },
      {
        "name": "course_id",
        "type": "text"
      },
      {
        "name": "post_id",
        "type": "text"
      },
      {
        "name": "catalog_year",
        "type": "text"
      },
      {
        "name": "curriculum_fingerprint",
        "type": "text"
      },
      {
        "name": "outcome",
        "type": "text"
      },
      {
        "name": "evaluated_on",
        "type": "text"
      },
      {
        "name": "details",
        "type": "text"
      },
      {
        "name": "evidence_url",
        "type": "text"
      },
      {
        "name": "consent_at",
        "type": "integer"
      },
      {
        "name": "review_status",
        "type": "text"
      },
      {
        "name": "review_note",
        "type": "text"
      },
      {
        "name": "reviewed_at",
        "type": "integer"
      },
      {
        "name": "reviewed_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "deleted_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_evidence_flags",
    "columns": [
      {
        "name": "evidence_id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "reason",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "resolved_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_posts",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "context",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "body",
        "type": "text"
      },
      {
        "name": "url",
        "type": "text"
      },
      {
        "name": "plan_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "deleted_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_rate_limits",
    "columns": [
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "window_start",
        "type": "integer"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_reactions",
    "columns": [
      {
        "name": "post_id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "reaction",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "community_reports",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "target_type",
        "type": "text"
      },
      {
        "name": "target_id",
        "type": "text"
      },
      {
        "name": "reason",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "reviewed_at",
        "type": "integer"
      },
      {
        "name": "reviewed_by",
        "type": "text"
      }
    ]
  },
  {
    "name": "community_users",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "alias",
        "type": "text"
      },
      {
        "name": "role",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "curriculum_source_cache",
    "columns": [
      {
        "name": "cache_key",
        "type": "text"
      },
      {
        "name": "program_id",
        "type": "text"
      },
      {
        "name": "source_url",
        "type": "text"
      },
      {
        "name": "payload_json",
        "type": "text"
      },
      {
        "name": "source_hash",
        "type": "text"
      },
      {
        "name": "checked_at",
        "type": "text"
      },
      {
        "name": "expires_at",
        "type": "text"
      }
    ]
  },
  {
    "name": "degree_research_jobs",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "template_id",
        "type": "text"
      },
      {
        "name": "active_template_id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "authorized_admin",
        "type": "integer"
      },
      {
        "name": "requested_revision",
        "type": "integer"
      },
      {
        "name": "options_json",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "attempts",
        "type": "integer"
      },
      {
        "name": "available_at",
        "type": "integer"
      },
      {
        "name": "lease_token",
        "type": "text"
      },
      {
        "name": "lease_until",
        "type": "integer"
      },
      {
        "name": "provider_started_at",
        "type": "integer"
      },
      {
        "name": "dispatched_at",
        "type": "integer"
      },
      {
        "name": "finished_at",
        "type": "integer"
      },
      {
        "name": "error_code",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "degree_templates",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "canonical_key",
        "type": "text"
      },
      {
        "name": "school_name",
        "type": "text"
      },
      {
        "name": "program_name",
        "type": "text"
      },
      {
        "name": "level",
        "type": "text"
      },
      {
        "name": "modality",
        "type": "text"
      },
      {
        "name": "catalog_year",
        "type": "text"
      },
      {
        "name": "source_url",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "artifact_json",
        "type": "text"
      },
      {
        "name": "unresolved_json",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "checked_at",
        "type": "integer"
      },
      {
        "name": "reviewed_by",
        "type": "text"
      },
      {
        "name": "reviewed_at",
        "type": "integer"
      },
      {
        "name": "review_notes",
        "type": "text"
      },
      {
        "name": "sources_reviewed",
        "type": "integer"
      },
      {
        "name": "academic_reviewed",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "email_send_days",
    "columns": [
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "growth_daily_counts",
    "columns": [
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "event",
        "type": "text"
      },
      {
        "name": "context",
        "type": "text"
      },
      {
        "name": "plan_id",
        "type": "text"
      },
      {
        "name": "detail",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "lead_rate_limits",
    "columns": [
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "visitor_hash",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "owner_content_records",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "type",
        "type": "text"
      },
      {
        "name": "slug",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "content_json",
        "type": "text"
      },
      {
        "name": "published_json",
        "type": "text"
      },
      {
        "name": "reviewed_revision",
        "type": "integer"
      },
      {
        "name": "published_revision",
        "type": "integer"
      },
      {
        "name": "reviewed_at",
        "type": "integer"
      },
      {
        "name": "published_reviewed_at",
        "type": "integer"
      },
      {
        "name": "published_at",
        "type": "integer"
      },
      {
        "name": "archived_at",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "owner_content_versions",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "record_id",
        "type": "text"
      },
      {
        "name": "type",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "content_json",
        "type": "text"
      },
      {
        "name": "review_note",
        "type": "text"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "owner_financial_records",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "search_key",
        "type": "text"
      },
      {
        "name": "source",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "amount_minor",
        "type": "integer"
      },
      {
        "name": "currency",
        "type": "text"
      },
      {
        "name": "occurred_on",
        "type": "text"
      },
      {
        "name": "period_start",
        "type": "text"
      },
      {
        "name": "period_end",
        "type": "text"
      },
      {
        "name": "counterparty",
        "type": "text"
      },
      {
        "name": "description",
        "type": "text"
      }
    ]
  },
  {
    "name": "owner_lead_workflows",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "search_key",
        "type": "text"
      },
      {
        "name": "source_kind",
        "type": "text"
      },
      {
        "name": "source_id",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "notes",
        "type": "text"
      }
    ]
  },
  {
    "name": "owner_partners",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "search_key",
        "type": "text"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "website",
        "type": "text"
      },
      {
        "name": "contact_name",
        "type": "text"
      },
      {
        "name": "contact_email",
        "type": "text"
      },
      {
        "name": "stage",
        "type": "text"
      },
      {
        "name": "notes",
        "type": "text"
      }
    ]
  },
  {
    "name": "owner_search_imports",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "property",
        "type": "text"
      },
      {
        "name": "fingerprint",
        "type": "text"
      },
      {
        "name": "file_name",
        "type": "text"
      },
      {
        "name": "dimension",
        "type": "text"
      },
      {
        "name": "start_date",
        "type": "text"
      },
      {
        "name": "end_date",
        "type": "text"
      },
      {
        "name": "exported_on",
        "type": "text"
      },
      {
        "name": "search_type",
        "type": "text"
      },
      {
        "name": "filters",
        "type": "text"
      },
      {
        "name": "row_count",
        "type": "integer"
      },
      {
        "name": "rows_json",
        "type": "text"
      },
      {
        "name": "summary_json",
        "type": "text"
      },
      {
        "name": "imported_by",
        "type": "text"
      },
      {
        "name": "imported_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "owner_search_settings",
    "columns": [
      {
        "name": "property",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "verification_token",
        "type": "text"
      },
      {
        "name": "dns_status",
        "type": "text"
      },
      {
        "name": "dns_checked_at",
        "type": "integer"
      },
      {
        "name": "google_ownership_reported",
        "type": "integer"
      },
      {
        "name": "google_ownership_reported_at",
        "type": "integer"
      },
      {
        "name": "sitemap_submitted_reported",
        "type": "integer"
      },
      {
        "name": "sitemap_submitted_reported_at",
        "type": "integer"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "owner_tasks",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "search_key",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "description",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "priority",
        "type": "text"
      },
      {
        "name": "due_on",
        "type": "text"
      }
    ]
  },
  {
    "name": "owner_work_events",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "resource",
        "type": "text"
      },
      {
        "name": "record_id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "actor_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "changed_fields_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "plan_alert_subscriptions",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "portal_plan_id",
        "type": "text"
      },
      {
        "name": "plan_id",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "fingerprint",
        "type": "text"
      },
      {
        "name": "summary_json",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "confirmed_at",
        "type": "integer"
      },
      {
        "name": "last_change_email_at",
        "type": "integer"
      },
      {
        "name": "last_reminder_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "plan_alert_tokens",
    "columns": [
      {
        "name": "token_hash",
        "type": "text"
      },
      {
        "name": "subscription_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "plan_review_requests",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "name",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "plan_id",
        "type": "text"
      },
      {
        "name": "plan_title",
        "type": "text"
      },
      {
        "name": "note",
        "type": "text"
      },
      {
        "name": "offer_price",
        "type": "integer"
      },
      {
        "name": "offer_currency",
        "type": "text"
      },
      {
        "name": "offer_status",
        "type": "text"
      },
      {
        "name": "consent_version",
        "type": "text"
      },
      {
        "name": "consent_text",
        "type": "text"
      }
    ]
  },
  {
    "name": "portal_plans",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "title",
        "type": "text"
      },
      {
        "name": "school",
        "type": "text"
      },
      {
        "name": "degree",
        "type": "text"
      },
      {
        "name": "state_json",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "portal_profiles",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "alias",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "portal_rate_limits",
    "columns": [
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "action",
        "type": "text"
      },
      {
        "name": "window_start",
        "type": "integer"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "school_inquiries",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "plan_id",
        "type": "text"
      },
      {
        "name": "plan_title",
        "type": "text"
      },
      {
        "name": "school",
        "type": "text"
      },
      {
        "name": "first_name",
        "type": "text"
      },
      {
        "name": "email",
        "type": "text"
      },
      {
        "name": "phone",
        "type": "text"
      },
      {
        "name": "location",
        "type": "text"
      },
      {
        "name": "start_timing",
        "type": "text"
      },
      {
        "name": "prior_credit",
        "type": "text"
      },
      {
        "name": "consent_version",
        "type": "text"
      },
      {
        "name": "consent_text",
        "type": "text"
      }
    ]
  },
  {
    "name": "support_messages",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "ticket_id",
        "type": "text"
      },
      {
        "name": "ticket_revision",
        "type": "integer"
      },
      {
        "name": "author_id",
        "type": "text"
      },
      {
        "name": "author_role",
        "type": "text"
      },
      {
        "name": "visibility",
        "type": "text"
      },
      {
        "name": "body",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "support_rate_limits",
    "columns": [
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "day",
        "type": "text"
      },
      {
        "name": "kind",
        "type": "text"
      },
      {
        "name": "count",
        "type": "integer"
      }
    ]
  },
  {
    "name": "support_tickets",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "revision",
        "type": "integer"
      },
      {
        "name": "created_by",
        "type": "text"
      },
      {
        "name": "updated_by",
        "type": "text"
      },
      {
        "name": "last_event_id",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      },
      {
        "name": "search_key",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "contact_email",
        "type": "text"
      },
      {
        "name": "subject",
        "type": "text"
      },
      {
        "name": "category",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "priority",
        "type": "text"
      },
      {
        "name": "diagnostics_consent",
        "type": "integer"
      },
      {
        "name": "diagnostics_json",
        "type": "text"
      }
    ]
  },
  {
    "name": "template_requests",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "template_id",
        "type": "text"
      },
      {
        "name": "details",
        "type": "text"
      },
      {
        "name": "created_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "template_research_progress",
    "columns": [
      {
        "name": "template_id",
        "type": "text"
      },
      {
        "name": "stage",
        "type": "text"
      },
      {
        "name": "pass",
        "type": "integer"
      },
      {
        "name": "source_count",
        "type": "integer"
      },
      {
        "name": "requirement_count",
        "type": "integer"
      },
      {
        "name": "updated_at",
        "type": "integer"
      }
    ]
  },
  {
    "name": "template_research_runs",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "template_id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "status",
        "type": "text"
      },
      {
        "name": "model",
        "type": "text"
      },
      {
        "name": "started_at",
        "type": "integer"
      },
      {
        "name": "finished_at",
        "type": "integer"
      },
      {
        "name": "input_tokens",
        "type": "integer"
      },
      {
        "name": "output_tokens",
        "type": "integer"
      },
      {
        "name": "error_code",
        "type": "text"
      }
    ]
  },
  {
    "name": "transcript_import_runs",
    "columns": [
      {
        "name": "id",
        "type": "text"
      },
      {
        "name": "user_id",
        "type": "text"
      },
      {
        "name": "started_at",
        "type": "integer"
      }
    ]
  }
].map(table=>Object.freeze({...table,columns:Object.freeze(table.columns.map(column=>Object.freeze(column)))})));

export const D1_SNAPSHOT_SCHEMA = Object.freeze([
  {
    "type": "index",
    "name": "academic_fact_review_event_token",
    "tbl_name": "academic_fact_reviews",
    "sql": "CREATE UNIQUE INDEX `academic_fact_review_event_token` ON `academic_fact_reviews` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "academic_fact_review_event_version",
    "tbl_name": "academic_fact_review_events",
    "sql": "CREATE UNIQUE INDEX `academic_fact_review_event_version` ON `academic_fact_review_events` (`fact_id`,`evidence_fingerprint`,`revision`)"
  },
  {
    "type": "index",
    "name": "academic_fact_review_history",
    "tbl_name": "academic_fact_review_events",
    "sql": "CREATE INDEX `academic_fact_review_history` ON `academic_fact_review_events` (`fact_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "academic_fact_review_status",
    "tbl_name": "academic_fact_reviews",
    "sql": "CREATE INDEX `academic_fact_review_status` ON `academic_fact_reviews` (`decision`,`updated_at`,`fact_id`)"
  },
  {
    "type": "index",
    "name": "ai_connection_events_created",
    "tbl_name": "ai_connection_events",
    "sql": "CREATE INDEX `ai_connection_events_created` ON `ai_connection_events` (`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "business_audit_history",
    "tbl_name": "business_audit",
    "sql": "CREATE INDEX `business_audit_history` ON `business_audit` (`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "business_audit_target",
    "tbl_name": "business_audit",
    "sql": "CREATE INDEX `business_audit_target` ON `business_audit` (`target_type`,`target_id`,`created_at`)"
  },
  {
    "type": "index",
    "name": "business_student_directory_generation",
    "tbl_name": "business_student_directory",
    "sql": "CREATE INDEX `business_student_directory_generation` ON `business_student_directory` (`generation`,`excluded`)"
  },
  {
    "type": "index",
    "name": "business_student_directory_page",
    "tbl_name": "business_student_directory",
    "sql": "CREATE INDEX `business_student_directory_page` ON `business_student_directory` (`excluded`,`email`,`id`)"
  },
  {
    "type": "index",
    "name": "coach_questions_created",
    "tbl_name": "coach_questions",
    "sql": "CREATE INDEX `coach_questions_created` ON `coach_questions` (`created_at`)"
  },
  {
    "type": "index",
    "name": "college_access_audit_org",
    "tbl_name": "college_access_audit",
    "sql": "CREATE INDEX `college_access_audit_org` ON `college_access_audit` (`organization_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "college_interest_lead_scope",
    "tbl_name": "college_interest_requests",
    "sql": "CREATE INDEX `college_interest_lead_scope` ON `college_interest_requests` (`organization_id`,`withdrawn_at`,`consented_at`,`id`)"
  },
  {
    "type": "index",
    "name": "college_interest_student",
    "tbl_name": "college_interest_requests",
    "sql": "CREATE INDEX `college_interest_student` ON `college_interest_requests` (`user_id`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "college_interest_student_org",
    "tbl_name": "college_interest_requests",
    "sql": "CREATE UNIQUE INDEX `college_interest_student_org` ON `college_interest_requests` (`user_id`,`organization_id`)"
  },
  {
    "type": "index",
    "name": "college_memberships_user",
    "tbl_name": "college_memberships",
    "sql": "CREATE INDEX `college_memberships_user` ON `college_memberships` (`user_id`,`status`,`organization_id`)"
  },
  {
    "type": "index",
    "name": "college_organizations_status",
    "tbl_name": "college_organizations",
    "sql": "CREATE INDEX `college_organizations_status` ON `college_organizations` (`status`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_comments_context",
    "tbl_name": "community_comments",
    "sql": "CREATE INDEX `community_comments_context` ON `community_comments` (`context`,`deleted_at`,`created_at`,`id`,`user_id`)"
  },
  {
    "type": "index",
    "name": "community_evidence_flags_queue",
    "tbl_name": "community_evidence_flags",
    "sql": "CREATE INDEX `community_evidence_flags_queue` ON `community_evidence_flags` (`resolved_at`,`evidence_id`)"
  },
  {
    "type": "index",
    "name": "community_evidence_program",
    "tbl_name": "community_evidence",
    "sql": "CREATE INDEX `community_evidence_program` ON `community_evidence` (`program_id`,`catalog_year`,`deleted_at`)"
  },
  {
    "type": "index",
    "name": "community_evidence_queue",
    "tbl_name": "community_evidence",
    "sql": "CREATE INDEX `community_evidence_queue` ON `community_evidence` (`review_status`,`deleted_at`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_evidence_scope",
    "tbl_name": "community_evidence",
    "sql": "CREATE INDEX `community_evidence_scope` ON `community_evidence` (`target_key`,`catalog_year`,`curriculum_fingerprint`,`deleted_at`)"
  },
  {
    "type": "index",
    "name": "community_evidence_user_scope",
    "tbl_name": "community_evidence",
    "sql": "CREATE UNIQUE INDEX `community_evidence_user_scope` ON `community_evidence` (`user_id`,`target_key`,`catalog_year`,`curriculum_fingerprint`)"
  },
  {
    "type": "index",
    "name": "community_posts_author",
    "tbl_name": "community_posts",
    "sql": "CREATE INDEX `community_posts_author` ON `community_posts` (`user_id`,`deleted_at`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_posts_context",
    "tbl_name": "community_posts",
    "sql": "CREATE INDEX `community_posts_context` ON `community_posts` (`context`,`deleted_at`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_posts_feed",
    "tbl_name": "community_posts",
    "sql": "CREATE INDEX `community_posts_feed` ON `community_posts` (`deleted_at`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_posts_kind",
    "tbl_name": "community_posts",
    "sql": "CREATE INDEX `community_posts_kind` ON `community_posts` (`kind`,`deleted_at`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_reactions_user",
    "tbl_name": "community_reactions",
    "sql": "CREATE INDEX `community_reactions_user` ON `community_reactions` (`user_id`,`created_at`)"
  },
  {
    "type": "index",
    "name": "community_reports_queue",
    "tbl_name": "community_reports",
    "sql": "CREATE INDEX `community_reports_queue` ON `community_reports` (`status`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "community_reports_user_target",
    "tbl_name": "community_reports",
    "sql": "CREATE UNIQUE INDEX `community_reports_user_target` ON `community_reports` (`user_id`,`target_type`,`target_id`)"
  },
  {
    "type": "index",
    "name": "curriculum_source_cache_expiry",
    "tbl_name": "curriculum_source_cache",
    "sql": "CREATE INDEX `curriculum_source_cache_expiry` ON `curriculum_source_cache` (`expires_at`)"
  },
  {
    "type": "index",
    "name": "curriculum_source_cache_program",
    "tbl_name": "curriculum_source_cache",
    "sql": "CREATE INDEX `curriculum_source_cache_program` ON `curriculum_source_cache` (`program_id`)"
  },
  {
    "type": "index",
    "name": "degree_research_job_active",
    "tbl_name": "degree_research_jobs",
    "sql": "CREATE UNIQUE INDEX `degree_research_job_active` ON `degree_research_jobs` (`active_template_id`)"
  },
  {
    "type": "index",
    "name": "degree_research_job_dispatch",
    "tbl_name": "degree_research_jobs",
    "sql": "CREATE INDEX `degree_research_job_dispatch` ON `degree_research_jobs` (`status`,`available_at`,`updated_at`)"
  },
  {
    "type": "index",
    "name": "degree_research_job_owner",
    "tbl_name": "degree_research_jobs",
    "sql": "CREATE INDEX `degree_research_job_owner` ON `degree_research_jobs` (`user_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "degree_research_job_template",
    "tbl_name": "degree_research_jobs",
    "sql": "CREATE INDEX `degree_research_job_template` ON `degree_research_jobs` (`template_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "degree_template_identity",
    "tbl_name": "degree_templates",
    "sql": "CREATE UNIQUE INDEX `degree_template_identity` ON `degree_templates` (`canonical_key`)"
  },
  {
    "type": "index",
    "name": "degree_template_ready",
    "tbl_name": "degree_templates",
    "sql": "CREATE INDEX `degree_template_ready` ON `degree_templates` (`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "degree_template_source",
    "tbl_name": "degree_templates",
    "sql": "CREATE INDEX `degree_template_source` ON `degree_templates` (`source_url`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_content_list",
    "tbl_name": "owner_content_records",
    "sql": "CREATE INDEX `owner_content_list` ON `owner_content_records` (`type`,`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_content_public",
    "tbl_name": "owner_content_records",
    "sql": "CREATE INDEX `owner_content_public` ON `owner_content_records` (`type`,`status`,`published_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_content_type_slug",
    "tbl_name": "owner_content_records",
    "sql": "CREATE UNIQUE INDEX `owner_content_type_slug` ON `owner_content_records` (`type`,`slug`)"
  },
  {
    "type": "index",
    "name": "owner_content_version_record",
    "tbl_name": "owner_content_versions",
    "sql": "CREATE INDEX `owner_content_version_record` ON `owner_content_versions` (`record_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_finance_event",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE UNIQUE INDEX `owner_finance_event` ON `owner_financial_records` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "owner_finance_period",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE INDEX `owner_finance_period` ON `owner_financial_records` (`occurred_on`,`currency`,`kind`,`status`)"
  },
  {
    "type": "index",
    "name": "owner_finance_search",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE INDEX `owner_finance_search` ON `owner_financial_records` (`search_key`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_finance_status",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE INDEX `owner_finance_status` ON `owner_financial_records` (`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_finance_updated",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE INDEX `owner_finance_updated` ON `owner_financial_records` (`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_lead_original_request",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE UNIQUE INDEX `owner_lead_original_request` ON `owner_lead_workflows` (`source_kind`,`source_id`)"
  },
  {
    "type": "index",
    "name": "owner_leads_event",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE UNIQUE INDEX `owner_leads_event` ON `owner_lead_workflows` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "owner_leads_search",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE INDEX `owner_leads_search` ON `owner_lead_workflows` (`search_key`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_leads_status",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE INDEX `owner_leads_status` ON `owner_lead_workflows` (`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_leads_updated",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE INDEX `owner_leads_updated` ON `owner_lead_workflows` (`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_partners_event",
    "tbl_name": "owner_partners",
    "sql": "CREATE UNIQUE INDEX `owner_partners_event` ON `owner_partners` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "owner_partners_search",
    "tbl_name": "owner_partners",
    "sql": "CREATE INDEX `owner_partners_search` ON `owner_partners` (`search_key`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_partners_stage",
    "tbl_name": "owner_partners",
    "sql": "CREATE INDEX `owner_partners_stage` ON `owner_partners` (`stage`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_partners_updated",
    "tbl_name": "owner_partners",
    "sql": "CREATE INDEX `owner_partners_updated` ON `owner_partners` (`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_search_import_dimension",
    "tbl_name": "owner_search_imports",
    "sql": "CREATE INDEX `owner_search_import_dimension` ON `owner_search_imports` (`property`,`dimension`,`imported_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_search_import_fingerprint",
    "tbl_name": "owner_search_imports",
    "sql": "CREATE UNIQUE INDEX `owner_search_import_fingerprint` ON `owner_search_imports` (`property`,`fingerprint`)"
  },
  {
    "type": "index",
    "name": "owner_search_import_recent",
    "tbl_name": "owner_search_imports",
    "sql": "CREATE INDEX `owner_search_import_recent` ON `owner_search_imports` (`property`,`imported_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_tasks_event",
    "tbl_name": "owner_tasks",
    "sql": "CREATE UNIQUE INDEX `owner_tasks_event` ON `owner_tasks` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "owner_tasks_search",
    "tbl_name": "owner_tasks",
    "sql": "CREATE INDEX `owner_tasks_search` ON `owner_tasks` (`search_key`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_tasks_status",
    "tbl_name": "owner_tasks",
    "sql": "CREATE INDEX `owner_tasks_status` ON `owner_tasks` (`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_tasks_updated",
    "tbl_name": "owner_tasks",
    "sql": "CREATE INDEX `owner_tasks_updated` ON `owner_tasks` (`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_work_event_created",
    "tbl_name": "owner_work_events",
    "sql": "CREATE INDEX `owner_work_event_created` ON `owner_work_events` (`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_work_event_history",
    "tbl_name": "owner_work_events",
    "sql": "CREATE INDEX `owner_work_event_history` ON `owner_work_events` (`resource`,`record_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "owner_work_event_revision",
    "tbl_name": "owner_work_events",
    "sql": "CREATE UNIQUE INDEX `owner_work_event_revision` ON `owner_work_events` (`resource`,`record_id`,`revision`)"
  },
  {
    "type": "index",
    "name": "plan_alert_owner_plan",
    "tbl_name": "plan_alert_subscriptions",
    "sql": "CREATE UNIQUE INDEX `plan_alert_owner_plan` ON `plan_alert_subscriptions` (`user_id`,`portal_plan_id`)"
  },
  {
    "type": "index",
    "name": "plan_alert_plan",
    "tbl_name": "plan_alert_subscriptions",
    "sql": "CREATE INDEX `plan_alert_plan` ON `plan_alert_subscriptions` (`plan_id`)"
  },
  {
    "type": "index",
    "name": "plan_alert_tokens_subscription",
    "tbl_name": "plan_alert_tokens",
    "sql": "CREATE INDEX `plan_alert_tokens_subscription` ON `plan_alert_tokens` (`subscription_id`)"
  },
  {
    "type": "index",
    "name": "plan_review_requests_created",
    "tbl_name": "plan_review_requests",
    "sql": "CREATE INDEX `plan_review_requests_created` ON `plan_review_requests` (`created_at`)"
  },
  {
    "type": "index",
    "name": "portal_plans_owner",
    "tbl_name": "portal_plans",
    "sql": "CREATE INDEX `portal_plans_owner` ON `portal_plans` (`user_id`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "school_inquiries_created",
    "tbl_name": "school_inquiries",
    "sql": "CREATE INDEX `school_inquiries_created` ON `school_inquiries` (`created_at`)"
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_academic_fact_review_events_1",
    "tbl_name": "academic_fact_review_events",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_academic_fact_reviews_1",
    "tbl_name": "academic_fact_reviews",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_ai_connection_events_1",
    "tbl_name": "ai_connection_events",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_ai_connection_rate_limits_1",
    "tbl_name": "ai_connection_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_ai_service_connections_1",
    "tbl_name": "ai_service_connections",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_business_audit_1",
    "tbl_name": "business_audit",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_business_connections_1",
    "tbl_name": "business_connections",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_business_owner_limits_1",
    "tbl_name": "business_owner_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_business_student_directory_1",
    "tbl_name": "business_student_directory",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_business_student_sync_1",
    "tbl_name": "business_student_sync",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_coach_questions_1",
    "tbl_name": "coach_questions",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_coach_spend_days_1",
    "tbl_name": "coach_spend_days",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_coach_visitor_days_1",
    "tbl_name": "coach_visitor_days",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_college_access_audit_1",
    "tbl_name": "college_access_audit",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_college_access_rate_limits_1",
    "tbl_name": "college_access_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_college_interest_requests_1",
    "tbl_name": "college_interest_requests",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_college_memberships_1",
    "tbl_name": "college_memberships",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_college_organizations_1",
    "tbl_name": "college_organizations",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_comments_1",
    "tbl_name": "community_comments",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_context_reactions_1",
    "tbl_name": "community_context_reactions",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_evidence_1",
    "tbl_name": "community_evidence",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_evidence_flags_1",
    "tbl_name": "community_evidence_flags",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_posts_1",
    "tbl_name": "community_posts",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_rate_limits_1",
    "tbl_name": "community_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_reactions_1",
    "tbl_name": "community_reactions",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_reports_1",
    "tbl_name": "community_reports",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_community_users_1",
    "tbl_name": "community_users",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_curriculum_source_cache_1",
    "tbl_name": "curriculum_source_cache",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_degree_research_jobs_1",
    "tbl_name": "degree_research_jobs",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_degree_templates_1",
    "tbl_name": "degree_templates",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_email_send_days_1",
    "tbl_name": "email_send_days",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_growth_daily_counts_1",
    "tbl_name": "growth_daily_counts",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_lead_rate_limits_1",
    "tbl_name": "lead_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_content_records_1",
    "tbl_name": "owner_content_records",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_content_versions_1",
    "tbl_name": "owner_content_versions",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_financial_records_1",
    "tbl_name": "owner_financial_records",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_lead_workflows_1",
    "tbl_name": "owner_lead_workflows",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_partners_1",
    "tbl_name": "owner_partners",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_search_imports_1",
    "tbl_name": "owner_search_imports",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_search_settings_1",
    "tbl_name": "owner_search_settings",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_tasks_1",
    "tbl_name": "owner_tasks",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_owner_work_events_1",
    "tbl_name": "owner_work_events",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_plan_alert_subscriptions_1",
    "tbl_name": "plan_alert_subscriptions",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_plan_alert_tokens_1",
    "tbl_name": "plan_alert_tokens",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_plan_review_requests_1",
    "tbl_name": "plan_review_requests",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_portal_plans_1",
    "tbl_name": "portal_plans",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_portal_profiles_1",
    "tbl_name": "portal_profiles",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_portal_rate_limits_1",
    "tbl_name": "portal_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_school_inquiries_1",
    "tbl_name": "school_inquiries",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_support_messages_1",
    "tbl_name": "support_messages",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_support_rate_limits_1",
    "tbl_name": "support_rate_limits",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_support_tickets_1",
    "tbl_name": "support_tickets",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_template_requests_1",
    "tbl_name": "template_requests",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_template_research_progress_1",
    "tbl_name": "template_research_progress",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_template_research_runs_1",
    "tbl_name": "template_research_runs",
    "sql": null
  },
  {
    "type": "index",
    "name": "sqlite_autoindex_transcript_import_runs_1",
    "tbl_name": "transcript_import_runs",
    "sql": null
  },
  {
    "type": "index",
    "name": "support_messages_ticket",
    "tbl_name": "support_messages",
    "sql": "CREATE INDEX `support_messages_ticket` ON `support_messages` (`ticket_id`,`ticket_revision`,`id`)"
  },
  {
    "type": "index",
    "name": "support_messages_version",
    "tbl_name": "support_messages",
    "sql": "CREATE UNIQUE INDEX `support_messages_version` ON `support_messages` (`ticket_id`,`ticket_revision`)"
  },
  {
    "type": "index",
    "name": "support_rate_day",
    "tbl_name": "support_rate_limits",
    "sql": "CREATE INDEX `support_rate_day` ON `support_rate_limits` (`day`)"
  },
  {
    "type": "index",
    "name": "support_tickets_event",
    "tbl_name": "support_tickets",
    "sql": "CREATE UNIQUE INDEX `support_tickets_event` ON `support_tickets` (`last_event_id`)"
  },
  {
    "type": "index",
    "name": "support_tickets_search",
    "tbl_name": "support_tickets",
    "sql": "CREATE INDEX `support_tickets_search` ON `support_tickets` (`search_key`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "support_tickets_status",
    "tbl_name": "support_tickets",
    "sql": "CREATE INDEX `support_tickets_status` ON `support_tickets` (`status`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "support_tickets_updated",
    "tbl_name": "support_tickets",
    "sql": "CREATE INDEX `support_tickets_updated` ON `support_tickets` (`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "support_tickets_user",
    "tbl_name": "support_tickets",
    "sql": "CREATE INDEX `support_tickets_user` ON `support_tickets` (`user_id`,`updated_at`,`id`)"
  },
  {
    "type": "index",
    "name": "template_request_owner",
    "tbl_name": "template_requests",
    "sql": "CREATE INDEX `template_request_owner` ON `template_requests` (`user_id`,`created_at`,`id`)"
  },
  {
    "type": "index",
    "name": "template_request_owner_degree",
    "tbl_name": "template_requests",
    "sql": "CREATE UNIQUE INDEX `template_request_owner_degree` ON `template_requests` (`user_id`,`template_id`)"
  },
  {
    "type": "index",
    "name": "template_run_owner_window",
    "tbl_name": "template_research_runs",
    "sql": "CREATE INDEX `template_run_owner_window` ON `template_research_runs` (`user_id`,`started_at`)"
  },
  {
    "type": "index",
    "name": "template_run_spend_window",
    "tbl_name": "template_research_runs",
    "sql": "CREATE INDEX `template_run_spend_window` ON `template_research_runs` (`started_at`,`status`)"
  },
  {
    "type": "index",
    "name": "template_run_target",
    "tbl_name": "template_research_runs",
    "sql": "CREATE INDEX `template_run_target` ON `template_research_runs` (`template_id`,`started_at`)"
  },
  {
    "type": "index",
    "name": "transcript_import_global_window",
    "tbl_name": "transcript_import_runs",
    "sql": "CREATE INDEX `transcript_import_global_window` ON `transcript_import_runs` (`started_at`)"
  },
  {
    "type": "index",
    "name": "transcript_import_owner_window",
    "tbl_name": "transcript_import_runs",
    "sql": "CREATE INDEX `transcript_import_owner_window` ON `transcript_import_runs` (`user_id`,`started_at`)"
  },
  {
    "type": "table",
    "name": "academic_fact_review_events",
    "tbl_name": "academic_fact_review_events",
    "sql": "CREATE TABLE `academic_fact_review_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`fact_id` text NOT NULL,\n\t`evidence_fingerprint` text NOT NULL,\n\t`registry_revision` text NOT NULL,\n\t`revision` integer NOT NULL,\n\t`decision` text NOT NULL,\n\t`note` text NOT NULL,\n\t`source_ids_json` text NOT NULL,\n\t`attestation` integer NOT NULL,\n\t`reviewer_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"academic_fact_event_fingerprint\" CHECK(length(\"academic_fact_review_events\".\"evidence_fingerprint\")=64 AND \"academic_fact_review_events\".\"evidence_fingerprint\" NOT GLOB '*[^a-f0-9]*'),\n\tCONSTRAINT \"academic_fact_event_registry\" CHECK(length(\"academic_fact_review_events\".\"registry_revision\") BETWEEN 1 AND 120),\n\tCONSTRAINT \"academic_fact_event_revision\" CHECK(\"academic_fact_review_events\".\"revision\">0),\n\tCONSTRAINT \"academic_fact_event_decision\" CHECK(\"academic_fact_review_events\".\"decision\" IN ('reviewed-supported','needs-evidence','conflict')),\n\tCONSTRAINT \"academic_fact_event_note\" CHECK(length(\"academic_fact_review_events\".\"note\") BETWEEN 10 AND 2000),\n\tCONSTRAINT \"academic_fact_event_sources\" CHECK(json_valid(\"academic_fact_review_events\".\"source_ids_json\") AND json_type(\"academic_fact_review_events\".\"source_ids_json\")='array' AND length(CAST(\"academic_fact_review_events\".\"source_ids_json\" AS BLOB))<=8192),\n\tCONSTRAINT \"academic_fact_event_attestation\" CHECK((\"academic_fact_review_events\".\"decision\"='reviewed-supported' AND \"academic_fact_review_events\".\"attestation\"=1 AND json_array_length(\"academic_fact_review_events\".\"source_ids_json\")>0) OR (\"academic_fact_review_events\".\"decision\"!='reviewed-supported' AND \"academic_fact_review_events\".\"attestation\"=0)),\n\tCONSTRAINT \"academic_fact_event_actor\" CHECK(length(\"academic_fact_review_events\".\"reviewer_id\") BETWEEN 1 AND 256)\n)"
  },
  {
    "type": "table",
    "name": "academic_fact_reviews",
    "tbl_name": "academic_fact_reviews",
    "sql": "CREATE TABLE `academic_fact_reviews` (\n\t`fact_id` text NOT NULL,\n\t`evidence_fingerprint` text NOT NULL,\n\t`registry_revision` text NOT NULL,\n\t`revision` integer NOT NULL,\n\t`decision` text NOT NULL,\n\t`note` text NOT NULL,\n\t`source_ids_json` text NOT NULL,\n\t`attestation` integer DEFAULT 0 NOT NULL,\n\t`reviewer_id` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tPRIMARY KEY(`fact_id`, `evidence_fingerprint`),\n\tCONSTRAINT \"academic_fact_review_id\" CHECK(length(\"academic_fact_reviews\".\"fact_id\") BETWEEN 1 AND 160),\n\tCONSTRAINT \"academic_fact_review_fingerprint\" CHECK(length(\"academic_fact_reviews\".\"evidence_fingerprint\")=64 AND \"academic_fact_reviews\".\"evidence_fingerprint\" NOT GLOB '*[^a-f0-9]*'),\n\tCONSTRAINT \"academic_fact_review_registry\" CHECK(length(\"academic_fact_reviews\".\"registry_revision\") BETWEEN 1 AND 120),\n\tCONSTRAINT \"academic_fact_review_revision\" CHECK(\"academic_fact_reviews\".\"revision\">0),\n\tCONSTRAINT \"academic_fact_review_decision\" CHECK(\"academic_fact_reviews\".\"decision\" IN ('reviewed-supported','needs-evidence','conflict')),\n\tCONSTRAINT \"academic_fact_review_note\" CHECK(length(\"academic_fact_reviews\".\"note\") BETWEEN 10 AND 2000),\n\tCONSTRAINT \"academic_fact_review_sources\" CHECK(json_valid(\"academic_fact_reviews\".\"source_ids_json\") AND json_type(\"academic_fact_reviews\".\"source_ids_json\")='array' AND length(CAST(\"academic_fact_reviews\".\"source_ids_json\" AS BLOB))<=8192),\n\tCONSTRAINT \"academic_fact_review_attestation\" CHECK((\"academic_fact_reviews\".\"decision\"='reviewed-supported' AND \"academic_fact_reviews\".\"attestation\"=1 AND json_array_length(\"academic_fact_reviews\".\"source_ids_json\")>0) OR (\"academic_fact_reviews\".\"decision\"!='reviewed-supported' AND \"academic_fact_reviews\".\"attestation\"=0)),\n\tCONSTRAINT \"academic_fact_review_actor\" CHECK(length(\"academic_fact_reviews\".\"reviewer_id\") BETWEEN 1 AND 256)\n)"
  },
  {
    "type": "table",
    "name": "ai_connection_events",
    "tbl_name": "ai_connection_events",
    "sql": "CREATE TABLE `ai_connection_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`service` text NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`revision` integer NOT NULL,\n\t`source` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"ai_connection_event_service\" CHECK(\"ai_connection_events\".\"service\" = 'anthropic'),\n\tCONSTRAINT \"ai_connection_event_action\" CHECK(\"ai_connection_events\".\"action\" IN ('connect','rotate','disconnect','test')),\n\tCONSTRAINT \"ai_connection_event_revision\" CHECK(\"ai_connection_events\".\"revision\" >= 0),\n\tCONSTRAINT \"ai_connection_event_source\" CHECK(\"ai_connection_events\".\"source\" IN ('managed','environment','none'))\n)"
  },
  {
    "type": "table",
    "name": "ai_connection_rate_limits",
    "tbl_name": "ai_connection_rate_limits",
    "sql": "CREATE TABLE `ai_connection_rate_limits` (\n\t`user_id` text PRIMARY KEY NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`count` integer NOT NULL,\n\tCONSTRAINT \"ai_connection_rate_count\" CHECK(\"ai_connection_rate_limits\".\"count\" > 0)\n)"
  },
  {
    "type": "table",
    "name": "ai_service_connections",
    "tbl_name": "ai_service_connections",
    "sql": "CREATE TABLE `ai_service_connections` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`ciphertext` text,\n\t`iv` text,\n\t`revision` integer NOT NULL,\n\t`verified_at` integer,\n\t`updated_by` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"ai_connection_service\" CHECK(\"ai_service_connections\".\"id\" = 'anthropic'),\n\tCONSTRAINT \"ai_connection_revision\" CHECK(\"ai_service_connections\".\"revision\" > 0),\n\tCONSTRAINT \"ai_connection_encrypted_pair\" CHECK((\"ai_service_connections\".\"ciphertext\" IS NULL AND \"ai_service_connections\".\"iv\" IS NULL AND \"ai_service_connections\".\"verified_at\" IS NULL) OR (\"ai_service_connections\".\"ciphertext\" IS NOT NULL AND length(\"ai_service_connections\".\"ciphertext\") BETWEEN 44 AND 5600 AND \"ai_service_connections\".\"iv\" IS NOT NULL AND length(\"ai_service_connections\".\"iv\") = 24 AND \"ai_service_connections\".\"verified_at\" IS NOT NULL))\n)"
  },
  {
    "type": "table",
    "name": "business_audit",
    "tbl_name": "business_audit",
    "sql": "CREATE TABLE `business_audit` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`target_type` text NOT NULL,\n\t`target_id` text NOT NULL,\n\t`details_json` text DEFAULT '{}' NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"business_audit_fields\" CHECK(length(\"business_audit\".\"actor_id\") BETWEEN 1 AND 256 AND length(\"business_audit\".\"action\") BETWEEN 1 AND 80 AND length(\"business_audit\".\"target_type\") BETWEEN 1 AND 60 AND length(\"business_audit\".\"target_id\")<=256),\n\tCONSTRAINT \"business_audit_details\" CHECK(json_valid(\"business_audit\".\"details_json\") AND length(CAST(\"business_audit\".\"details_json\" AS BLOB))<=8192)\n)"
  },
  {
    "type": "table",
    "name": "business_connections",
    "tbl_name": "business_connections",
    "sql": "CREATE TABLE `business_connections` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`project_origin` text NOT NULL,\n\t`ciphertext` text,\n\t`iv` text,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`verified_at` integer,\n\t`updated_by` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"business_connection_id\" CHECK(\"business_connections\".\"id\"='supabase-admin'),\n\tCONSTRAINT \"business_connection_revision\" CHECK(\"business_connections\".\"revision\">0),\n\tCONSTRAINT \"business_connection_encryption\" CHECK((\"business_connections\".\"ciphertext\" IS NULL AND \"business_connections\".\"iv\" IS NULL) OR (length(\"business_connections\".\"ciphertext\") BETWEEN 20 AND 16384 AND length(\"business_connections\".\"iv\")=24))\n)"
  },
  {
    "type": "table",
    "name": "business_owner",
    "tbl_name": "business_owner",
    "sql": "CREATE TABLE `business_owner` (\n\t`singleton` integer PRIMARY KEY DEFAULT 1 NOT NULL,\n\t`user_id` text NOT NULL,\n\t`source` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"business_owner_singleton\" CHECK(\"business_owner\".\"singleton\"=1),\n\tCONSTRAINT \"business_owner_id\" CHECK(length(\"business_owner\".\"user_id\") BETWEEN 1 AND 256),\n\tCONSTRAINT \"business_owner_source\" CHECK(\"business_owner\".\"source\"='subject-hash')\n)"
  },
  {
    "type": "table",
    "name": "business_owner_limits",
    "tbl_name": "business_owner_limits",
    "sql": "CREATE TABLE `business_owner_limits` (\n\t`owner_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`count` integer NOT NULL,\n\tPRIMARY KEY(`owner_id`, `action`),\n\tCONSTRAINT \"business_owner_limit_action\" CHECK(\"business_owner_limits\".\"action\" IN ('connection','directory-sync','directory-read')),\n\tCONSTRAINT \"business_owner_limit_count\" CHECK(\"business_owner_limits\".\"count\">0)\n)"
  },
  {
    "type": "table",
    "name": "business_student_directory",
    "tbl_name": "business_student_directory",
    "sql": "CREATE TABLE `business_student_directory` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`auth_id` text NOT NULL,\n\t`email` text DEFAULT '' NOT NULL,\n\t`email_confirmed` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer,\n\t`last_sign_in_at` integer,\n\t`banned_until` text,\n\t`excluded` integer DEFAULT 0 NOT NULL,\n\t`generation` text NOT NULL,\n\t`synced_at` integer NOT NULL,\n\tCONSTRAINT \"business_student_directory_flags\" CHECK(\"business_student_directory\".\"email_confirmed\" IN (0,1) AND \"business_student_directory\".\"excluded\" IN (0,1)),\n\tCONSTRAINT \"business_student_directory_metadata\" CHECK(length(\"business_student_directory\".\"id\") BETWEEN 1 AND 256 AND length(\"business_student_directory\".\"auth_id\")<=128 AND length(\"business_student_directory\".\"email\")<=254)\n)"
  },
  {
    "type": "table",
    "name": "business_student_sync",
    "tbl_name": "business_student_sync",
    "sql": "CREATE TABLE `business_student_sync` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`generation` text NOT NULL,\n\t`next_page` integer DEFAULT 1 NOT NULL,\n\t`complete` integer DEFAULT 0 NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`lease_token` text,\n\t`lease_until` integer,\n\t`started_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`provider_total` integer,\n\tCONSTRAINT \"business_student_sync_id\" CHECK(\"business_student_sync\".\"id\"='supabase-auth'),\n\tCONSTRAINT \"business_student_sync_values\" CHECK(\"business_student_sync\".\"next_page\">0 AND \"business_student_sync\".\"revision\">0 AND \"business_student_sync\".\"complete\" IN (0,1))\n)"
  },
  {
    "type": "table",
    "name": "coach_questions",
    "tbl_name": "coach_questions",
    "sql": "CREATE TABLE `coach_questions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`day` text NOT NULL,\n\t`question` text NOT NULL,\n\t`topics_json` text DEFAULT '[]' NOT NULL,\n\t`tools_json` text DEFAULT '[]' NOT NULL,\n\t`plan_ids_json` text DEFAULT '[]' NOT NULL,\n\t`ask_school` integer DEFAULT 0 NOT NULL,\n\t`used_saved` integer DEFAULT 0 NOT NULL,\n\t`status` text NOT NULL,\n\t`model` text NOT NULL,\n\t`input_tokens` integer DEFAULT 0 NOT NULL,\n\t`output_tokens` integer DEFAULT 0 NOT NULL,\n\t`cache_write_tokens` integer DEFAULT 0 NOT NULL,\n\t`cache_read_tokens` integer DEFAULT 0 NOT NULL,\n\t`cost_micro_usd` integer DEFAULT 0 NOT NULL,\n\t`answer` text DEFAULT '' NOT NULL,\n\t`rating` integer,\n\t`rating_reason` text,\n\t`rated_at` integer,\n\tCONSTRAINT \"coach_question_length\" CHECK(length(\"coach_questions\".\"question\") BETWEEN 1 AND 1000),\n\tCONSTRAINT \"coach_answer_length\" CHECK(length(\"coach_questions\".\"answer\")<=1500),\n\tCONSTRAINT \"coach_rating_values\" CHECK(\"coach_questions\".\"rating\" IS NULL OR \"coach_questions\".\"rating\" IN (-1,1)),\n\tCONSTRAINT \"coach_rating_reason_length\" CHECK(\"coach_questions\".\"rating_reason\" IS NULL OR length(\"coach_questions\".\"rating_reason\")<=200),\n\tCONSTRAINT \"coach_flags\" CHECK(\"coach_questions\".\"ask_school\" IN (0,1) AND \"coach_questions\".\"used_saved\" IN (0,1))\n)"
  },
  {
    "type": "table",
    "name": "coach_spend_days",
    "tbl_name": "coach_spend_days",
    "sql": "CREATE TABLE `coach_spend_days` (\n\t`day` text PRIMARY KEY NOT NULL,\n\t`cost_micro_usd` integer DEFAULT 0 NOT NULL,\n\t`calls` integer DEFAULT 0 NOT NULL,\n\tCONSTRAINT \"coach_spend_day_format\" CHECK(length(\"coach_spend_days\".\"day\")=10 AND \"coach_spend_days\".\"day\" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),\n\tCONSTRAINT \"coach_spend_bounds\" CHECK(\"coach_spend_days\".\"cost_micro_usd\">=0 AND \"coach_spend_days\".\"calls\">=0)\n)"
  },
  {
    "type": "table",
    "name": "coach_visitor_days",
    "tbl_name": "coach_visitor_days",
    "sql": "CREATE TABLE `coach_visitor_days` (\n\t`day` text NOT NULL,\n\t`visitor_hash` text NOT NULL,\n\t`count` integer DEFAULT 1 NOT NULL,\n\tPRIMARY KEY(`day`, `visitor_hash`),\n\tCONSTRAINT \"coach_visitor_day_format\" CHECK(length(\"coach_visitor_days\".\"day\")=10 AND \"coach_visitor_days\".\"day\" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),\n\tCONSTRAINT \"coach_visitor_hash_format\" CHECK(length(\"coach_visitor_days\".\"visitor_hash\")=66 AND substr(\"coach_visitor_days\".\"visitor_hash\",1,2) IN ('a:','u:')),\n\tCONSTRAINT \"coach_visitor_count_bounds\" CHECK(\"coach_visitor_days\".\"count\" BETWEEN 0 AND 1000)\n)"
  },
  {
    "type": "table",
    "name": "college_access_audit",
    "tbl_name": "college_access_audit",
    "sql": "CREATE TABLE `college_access_audit` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`target_id` text NOT NULL,\n\t`note` text DEFAULT '' NOT NULL,\n\t`organization_id` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"college_access_audit_note_length\" CHECK(length(\"college_access_audit\".\"note\") <= 500),\n\tCONSTRAINT \"college_access_audit_action\" CHECK(\"college_access_audit\".\"action\" IN ('create','verify','revoke','grant-member','revoke-member','consent','withdraw','read-leads'))\n)"
  },
  {
    "type": "table",
    "name": "college_access_rate_limits",
    "tbl_name": "college_access_rate_limits",
    "sql": "CREATE TABLE `college_access_rate_limits` (\n\t`user_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`count` integer NOT NULL,\n\tPRIMARY KEY(`user_id`, `action`),\n\tCONSTRAINT \"college_access_rate_action\" CHECK(\"college_access_rate_limits\".\"action\" IN ('interest','admin','read')),\n\tCONSTRAINT \"college_access_rate_count\" CHECK(\"college_access_rate_limits\".\"count\">0)\n)"
  },
  {
    "type": "table",
    "name": "college_interest_requests",
    "tbl_name": "college_interest_requests",
    "sql": "CREATE TABLE `college_interest_requests` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`organization_id` text NOT NULL,\n\t`contact_name` text NOT NULL,\n\t`contact_email` text NOT NULL,\n\t`program_interest` text DEFAULT '' NOT NULL,\n\t`study_format` text DEFAULT 'either' NOT NULL,\n\t`start_timing` text DEFAULT '' NOT NULL,\n\t`consent_version` text NOT NULL,\n\t`consent_text` text NOT NULL,\n\t`consented_at` integer NOT NULL,\n\t`withdrawn_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"college_interest_name_length\" CHECK(length(\"college_interest_requests\".\"contact_name\") BETWEEN 2 AND 100),\n\tCONSTRAINT \"college_interest_email_length\" CHECK(length(\"college_interest_requests\".\"contact_email\") BETWEEN 3 AND 254),\n\tCONSTRAINT \"college_interest_program_length\" CHECK(length(\"college_interest_requests\".\"program_interest\") <= 200),\n\tCONSTRAINT \"college_interest_start_length\" CHECK(length(\"college_interest_requests\".\"start_timing\") <= 120),\n\tCONSTRAINT \"college_interest_format\" CHECK(\"college_interest_requests\".\"study_format\" IN ('online','campus','either')),\n\tCONSTRAINT \"college_interest_consent_version\" CHECK(length(\"college_interest_requests\".\"consent_version\") BETWEEN 1 AND 80),\n\tCONSTRAINT \"college_interest_consent_text\" CHECK(length(\"college_interest_requests\".\"consent_text\") BETWEEN 1 AND 2000)\n)"
  },
  {
    "type": "table",
    "name": "college_memberships",
    "tbl_name": "college_memberships",
    "sql": "CREATE TABLE `college_memberships` (\n\t`organization_id` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`role` text NOT NULL,\n\t`status` text DEFAULT 'active' NOT NULL,\n\t`granted_by` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tPRIMARY KEY(`organization_id`, `user_id`),\n\tFOREIGN KEY (`organization_id`) REFERENCES `college_organizations`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"college_member_role\" CHECK(\"college_memberships\".\"role\" IN ('advisor','admin')),\n\tCONSTRAINT \"college_member_status\" CHECK(\"college_memberships\".\"status\" IN ('active','revoked'))\n)"
  },
  {
    "type": "table",
    "name": "college_organizations",
    "tbl_name": "college_organizations",
    "sql": "CREATE TABLE `college_organizations` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`website` text NOT NULL,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`verified_by` text,\n\t`verified_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"college_org_name_length\" CHECK(length(\"college_organizations\".\"name\") BETWEEN 2 AND 160),\n\tCONSTRAINT \"college_org_website_length\" CHECK(length(\"college_organizations\".\"website\") BETWEEN 8 AND 1500),\n\tCONSTRAINT \"college_org_status\" CHECK(\"college_organizations\".\"status\" IN ('pending','verified','revoked')),\n\tCONSTRAINT \"college_org_revision\" CHECK(\"college_organizations\".\"revision\" > 0)\n)"
  },
  {
    "type": "table",
    "name": "community_comments",
    "tbl_name": "community_comments",
    "sql": "CREATE TABLE `community_comments` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`context` text NOT NULL,\n\t`parent_id` text,\n\t`body` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer,\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`parent_id`) REFERENCES `community_comments`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_comment_context_length\" CHECK(length(\"community_comments\".\"context\") BETWEEN 3 AND 180),\n\tCONSTRAINT \"community_comment_body_length\" CHECK(length(\"community_comments\".\"body\") BETWEEN 1 AND 3000)\n)"
  },
  {
    "type": "table",
    "name": "community_context_reactions",
    "tbl_name": "community_context_reactions",
    "sql": "CREATE TABLE `community_context_reactions` (\n\t`context` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`reaction` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`context`, `user_id`, `reaction`),\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_context_reaction_context_length\" CHECK(length(\"community_context_reactions\".\"context\") BETWEEN 3 AND 180),\n\tCONSTRAINT \"community_context_reaction_kind\" CHECK(\"community_context_reactions\".\"reaction\" IN ('like','upvote'))\n)"
  },
  {
    "type": "table",
    "name": "community_evidence",
    "tbl_name": "community_evidence",
    "sql": "CREATE TABLE \"community_evidence\" (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`target_kind` text NOT NULL,\n\t`target_key` text NOT NULL,\n\t`program_id` text,\n\t`requirement_id` text,\n\t`course_id` text,\n\t`post_id` text,\n\t`catalog_year` text NOT NULL,\n\t`curriculum_fingerprint` text DEFAULT '' NOT NULL,\n\t`outcome` text NOT NULL,\n\t`evaluated_on` text NOT NULL,\n\t`details` text NOT NULL,\n\t`evidence_url` text,\n\t`consent_at` integer NOT NULL,\n\t`review_status` text DEFAULT 'pending' NOT NULL,\n\t`review_note` text,\n\t`reviewed_at` integer,\n\t`reviewed_by` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer,\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`reviewed_by`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_evidence_target\" CHECK((\"community_evidence\".\"target_kind\" = 'course' AND \"community_evidence\".\"program_id\" IS NOT NULL AND \"community_evidence\".\"requirement_id\" IS NOT NULL AND \"community_evidence\".\"course_id\" IS NOT NULL AND \"community_evidence\".\"post_id\" IS NULL AND \"community_evidence\".\"curriculum_fingerprint\" = '') OR (\"community_evidence\".\"target_kind\" = 'plan' AND \"community_evidence\".\"program_id\" IS NULL AND \"community_evidence\".\"requirement_id\" IS NULL AND \"community_evidence\".\"course_id\" IS NULL AND \"community_evidence\".\"post_id\" IS NOT NULL AND length(\"community_evidence\".\"curriculum_fingerprint\") = 64)),\n\tCONSTRAINT \"community_evidence_outcome\" CHECK(\"community_evidence\".\"outcome\" IN ('success','changed','rejected')),\n\tCONSTRAINT \"community_evidence_date_length\" CHECK(length(\"community_evidence\".\"evaluated_on\") = 10),\n\tCONSTRAINT \"community_evidence_catalog_length\" CHECK(length(\"community_evidence\".\"catalog_year\") IN (4,6,9)),\n\tCONSTRAINT \"community_evidence_details_length\" CHECK(length(\"community_evidence\".\"details\") BETWEEN 1 AND 1000),\n\tCONSTRAINT \"community_evidence_review_status\" CHECK(\"community_evidence\".\"review_status\" IN ('pending','reviewed','dismissed')),\n\tCONSTRAINT \"community_evidence_review_note_length\" CHECK(\"community_evidence\".\"review_note\" IS NULL OR length(\"community_evidence\".\"review_note\") BETWEEN 1 AND 1000)\n)"
  },
  {
    "type": "table",
    "name": "community_evidence_flags",
    "tbl_name": "community_evidence_flags",
    "sql": "CREATE TABLE \"community_evidence_flags\" (\n `evidence_id` text NOT NULL REFERENCES \"community_evidence\"(`id`),\n `user_id` text NOT NULL REFERENCES `community_users`(`id`),\n `reason` text NOT NULL,\n `created_at` integer NOT NULL,\n `resolved_at` integer,\n PRIMARY KEY (`evidence_id`,`user_id`),\n CONSTRAINT \"community_evidence_flag_reason_length\" CHECK(length(`reason`) BETWEEN 3 AND 1000)\n)"
  },
  {
    "type": "table",
    "name": "community_posts",
    "tbl_name": "community_posts",
    "sql": "CREATE TABLE `community_posts` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`context` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`title` text NOT NULL,\n\t`body` text NOT NULL,\n\t`url` text,\n\t`plan_json` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer,\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_post_context_length\" CHECK(length(\"community_posts\".\"context\") BETWEEN 3 AND 180),\n\tCONSTRAINT \"community_post_kind\" CHECK(\"community_posts\".\"kind\" IN ('question','plan','template')),\n\tCONSTRAINT \"community_post_title_length\" CHECK(length(\"community_posts\".\"title\") BETWEEN 3 AND 160),\n\tCONSTRAINT \"community_post_body_length\" CHECK(length(\"community_posts\".\"body\") BETWEEN 1 AND 6000)\n)"
  },
  {
    "type": "table",
    "name": "community_rate_limits",
    "tbl_name": "community_rate_limits",
    "sql": "CREATE TABLE `community_rate_limits` (\n\t`user_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`count` integer NOT NULL,\n\tPRIMARY KEY(`user_id`, `action`),\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_rate_action\" CHECK(\"community_rate_limits\".\"action\" IN ('publish','comment','reaction','report','profile','moderation')),\n\tCONSTRAINT \"community_rate_positive\" CHECK(\"community_rate_limits\".\"count\">0)\n)"
  },
  {
    "type": "table",
    "name": "community_reactions",
    "tbl_name": "community_reactions",
    "sql": "CREATE TABLE `community_reactions` (\n\t`post_id` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`reaction` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tPRIMARY KEY(`post_id`, `user_id`, `reaction`),\n\tFOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_reaction_kind\" CHECK(\"community_reactions\".\"reaction\" IN ('like','upvote'))\n)"
  },
  {
    "type": "table",
    "name": "community_reports",
    "tbl_name": "community_reports",
    "sql": "CREATE TABLE `community_reports` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`target_type` text NOT NULL,\n\t`target_id` text NOT NULL,\n\t`reason` text NOT NULL,\n\t`status` text DEFAULT 'open' NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`reviewed_at` integer,\n\t`reviewed_by` text,\n\tFOREIGN KEY (`user_id`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tFOREIGN KEY (`reviewed_by`) REFERENCES `community_users`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"community_report_target_type\" CHECK(\"community_reports\".\"target_type\" IN ('post','comment')),\n\tCONSTRAINT \"community_report_reason_length\" CHECK(length(\"community_reports\".\"reason\") BETWEEN 3 AND 1000),\n\tCONSTRAINT \"community_report_status\" CHECK(\"community_reports\".\"status\" IN ('open','reviewed','dismissed'))\n)"
  },
  {
    "type": "table",
    "name": "community_users",
    "tbl_name": "community_users",
    "sql": "CREATE TABLE `community_users` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`alias` text DEFAULT 'Community member' NOT NULL,\n\t`role` text DEFAULT 'member' NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"community_user_alias_length\" CHECK(length(\"community_users\".\"alias\") BETWEEN 2 AND 40),\n\tCONSTRAINT \"community_user_role\" CHECK(\"community_users\".\"role\" IN ('member','moderator','owner'))\n)"
  },
  {
    "type": "table",
    "name": "curriculum_source_cache",
    "tbl_name": "curriculum_source_cache",
    "sql": "CREATE TABLE `curriculum_source_cache` (\n\t`cache_key` text PRIMARY KEY NOT NULL,\n\t`program_id` text NOT NULL,\n\t`source_url` text,\n\t`payload_json` text NOT NULL,\n\t`source_hash` text,\n\t`checked_at` text NOT NULL,\n\t`expires_at` text NOT NULL,\n\tCONSTRAINT \"curriculum_source_cache_payload\" CHECK(json_valid(\"curriculum_source_cache\".\"payload_json\") AND length(CAST(\"curriculum_source_cache\".\"payload_json\" AS BLOB)) <= 1048576),\n\tCONSTRAINT \"curriculum_source_cache_key\" CHECK(length(\"curriculum_source_cache\".\"cache_key\") BETWEEN 1 AND 500),\n\tCONSTRAINT \"curriculum_source_cache_hash\" CHECK(\"curriculum_source_cache\".\"source_hash\" IS NULL OR length(\"curriculum_source_cache\".\"source_hash\") = 64)\n)"
  },
  {
    "type": "table",
    "name": "degree_research_jobs",
    "tbl_name": "degree_research_jobs",
    "sql": "CREATE TABLE `degree_research_jobs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`template_id` text NOT NULL,\n\t`active_template_id` text,\n\t`user_id` text NOT NULL,\n\t`authorized_admin` integer DEFAULT 0 NOT NULL,\n\t`requested_revision` integer NOT NULL,\n\t`options_json` text DEFAULT '{}' NOT NULL,\n\t`status` text DEFAULT 'queued' NOT NULL,\n\t`attempts` integer DEFAULT 0 NOT NULL,\n\t`available_at` integer NOT NULL,\n\t`lease_token` text,\n\t`lease_until` integer,\n\t`provider_started_at` integer,\n\t`dispatched_at` integer,\n\t`finished_at` integer,\n\t`error_code` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"degree_research_job_status\" CHECK(\"degree_research_jobs\".\"status\" IN ('queued','dispatched','running','retry','completed','dead')),\n\tCONSTRAINT \"degree_research_job_active_scope\" CHECK(\"degree_research_jobs\".\"active_template_id\" IS NULL OR \"degree_research_jobs\".\"active_template_id\"=\"degree_research_jobs\".\"template_id\"),\n\tCONSTRAINT \"degree_research_job_attempts\" CHECK(\"degree_research_jobs\".\"attempts\" BETWEEN 0 AND 3),\n\tCONSTRAINT \"degree_research_job_admin\" CHECK(\"degree_research_jobs\".\"authorized_admin\" IN (0,1)),\n\tCONSTRAINT \"degree_research_job_revision\" CHECK(\"degree_research_jobs\".\"requested_revision\">0),\n\tCONSTRAINT \"degree_research_job_options\" CHECK(json_valid(\"degree_research_jobs\".\"options_json\") AND length(CAST(\"degree_research_jobs\".\"options_json\" AS BLOB))<=4096)\n)"
  },
  {
    "type": "table",
    "name": "degree_templates",
    "tbl_name": "degree_templates",
    "sql": "CREATE TABLE `degree_templates` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`canonical_key` text NOT NULL,\n\t`school_name` text NOT NULL,\n\t`program_name` text NOT NULL,\n\t`level` text NOT NULL,\n\t`modality` text NOT NULL,\n\t`catalog_year` text NOT NULL,\n\t`source_url` text,\n\t`status` text DEFAULT 'queued' NOT NULL,\n\t`artifact_json` text,\n\t`unresolved_json` text DEFAULT '[]' NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`checked_at` integer,\n\t`reviewed_by` text,\n\t`reviewed_at` integer,\n\t`review_notes` text,\n\t`sources_reviewed` integer DEFAULT 0 NOT NULL,\n\t`academic_reviewed` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"degree_template_status\" CHECK(\"degree_templates\".\"status\" IN ('queued','researching','draft','ready','rejected','failed')),\n\tCONSTRAINT \"degree_template_artifact\" CHECK(\"degree_templates\".\"artifact_json\" IS NULL OR (json_valid(\"degree_templates\".\"artifact_json\") AND length(CAST(\"degree_templates\".\"artifact_json\" AS BLOB)) <= 524288)),\n\tCONSTRAINT \"degree_template_unresolved\" CHECK(json_valid(\"degree_templates\".\"unresolved_json\")),\n\tCONSTRAINT \"degree_template_revision\" CHECK(\"degree_templates\".\"revision\">0)\n)"
  },
  {
    "type": "table",
    "name": "email_send_days",
    "tbl_name": "email_send_days",
    "sql": "CREATE TABLE `email_send_days` (\n\t`day` text PRIMARY KEY NOT NULL,\n\t`count` integer DEFAULT 0 NOT NULL,\n\tCONSTRAINT \"email_send_day_format\" CHECK(length(\"email_send_days\".\"day\")=10 AND \"email_send_days\".\"day\" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),\n\tCONSTRAINT \"email_send_count_bounds\" CHECK(\"email_send_days\".\"count\" BETWEEN 0 AND 100000)\n)"
  },
  {
    "type": "table",
    "name": "growth_daily_counts",
    "tbl_name": "growth_daily_counts",
    "sql": "CREATE TABLE \"growth_daily_counts\" (\n\t`day` text NOT NULL,\n\t`event` text NOT NULL,\n\t`context` text NOT NULL,\n\t`plan_id` text DEFAULT '' NOT NULL,\n\t`detail` text DEFAULT '' NOT NULL,\n\t`count` integer DEFAULT 1 NOT NULL,\n\tPRIMARY KEY(`day`, `event`, `context`, `plan_id`, `detail`),\n\tCONSTRAINT \"growth_day_format\" CHECK(length(\"growth_daily_counts\".\"day\")=10 AND \"growth_daily_counts\".\"day\" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),\n\tCONSTRAINT \"growth_event_enum\" CHECK(\"growth_daily_counts\".\"event\" IN ('landing_view','plan_previewed','course_saved','plan_started','account_plan_saved','first_task_completed','finder_used','guided_started','guided_quiz_started','guided_results','plan_built','credits_worth_used','transfer_page_view','provider_click','school_email','share_link_copied','school_inquiry','plan_review_request','alert_subscribed','alert_unsubscribed')),\n\tCONSTRAINT \"growth_context_enum\" CHECK(\"growth_daily_counts\".\"context\" IN ('home','article','provider','school','degree-plan','workspace','transfer','email')),\n\tCONSTRAINT \"growth_plan_scope\" CHECK(\"growth_daily_counts\".\"plan_id\"='' OR (length(\"growth_daily_counts\".\"plan_id\") BETWEEN 1 AND 128 AND \"growth_daily_counts\".\"plan_id\" NOT GLOB '*[^a-z0-9-]*')),\n\tCONSTRAINT \"growth_detail_enum\" CHECK(\"growth_daily_counts\".\"detail\" IN ('','Sophia','Study.com','StraighterLine','Saylor','CLEP','DSST','Christian Leaders Institute','other','open','copy','submitted','settings','link','one-click')),\n\tCONSTRAINT \"growth_count_bounds\" CHECK(\"growth_daily_counts\".\"count\" BETWEEN 1 AND 1000000)\n)"
  },
  {
    "type": "table",
    "name": "lead_rate_limits",
    "tbl_name": "lead_rate_limits",
    "sql": "CREATE TABLE `lead_rate_limits` (\n\t`day` text NOT NULL,\n\t`visitor_hash` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`count` integer DEFAULT 1 NOT NULL,\n\tPRIMARY KEY(`day`, `visitor_hash`, `kind`),\n\tCONSTRAINT \"lead_rate_day_format\" CHECK(length(\"lead_rate_limits\".\"day\")=10 AND \"lead_rate_limits\".\"day\" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),\n\tCONSTRAINT \"lead_rate_hash_format\" CHECK(length(\"lead_rate_limits\".\"visitor_hash\")=64 AND \"lead_rate_limits\".\"visitor_hash\" NOT GLOB '*[^0-9a-f]*'),\n\tCONSTRAINT \"lead_rate_kind\" CHECK(\"lead_rate_limits\".\"kind\" IN ('school_inquiry','plan_review')),\n\tCONSTRAINT \"lead_rate_count_bounds\" CHECK(\"lead_rate_limits\".\"count\" BETWEEN 0 AND 1000)\n)"
  },
  {
    "type": "table",
    "name": "owner_content_records",
    "tbl_name": "owner_content_records",
    "sql": "CREATE TABLE `owner_content_records` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`type` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`status` text DEFAULT 'draft' NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`content_json` text NOT NULL,\n\t`published_json` text,\n\t`reviewed_revision` integer,\n\t`published_revision` integer,\n\t`reviewed_at` integer,\n\t`published_reviewed_at` integer,\n\t`published_at` integer,\n\t`archived_at` integer,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"owner_content_type\" CHECK(\"owner_content_records\".\"type\" IN ('articles','faqs','campaigns','offers')),\n\tCONSTRAINT \"owner_content_status\" CHECK(\"owner_content_records\".\"status\" IN ('draft','published','archived')),\n\tCONSTRAINT \"owner_content_revision\" CHECK(\"owner_content_records\".\"revision\">0 AND (\"owner_content_records\".\"reviewed_revision\" IS NULL OR \"owner_content_records\".\"reviewed_revision\"<=\"owner_content_records\".\"revision\") AND (\"owner_content_records\".\"published_revision\" IS NULL OR \"owner_content_records\".\"published_revision\"<=\"owner_content_records\".\"revision\")),\n\tCONSTRAINT \"owner_content_json\" CHECK(json_valid(\"owner_content_records\".\"content_json\") AND length(CAST(\"owner_content_records\".\"content_json\" AS BLOB))<=60000),\n\tCONSTRAINT \"owner_content_public_json\" CHECK(\"owner_content_records\".\"published_json\" IS NULL OR (json_valid(\"owner_content_records\".\"published_json\") AND length(CAST(\"owner_content_records\".\"published_json\" AS BLOB))<=60000))\n)"
  },
  {
    "type": "table",
    "name": "owner_content_versions",
    "tbl_name": "owner_content_versions",
    "sql": "CREATE TABLE `owner_content_versions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`record_id` text NOT NULL,\n\t`type` text NOT NULL,\n\t`revision` integer NOT NULL,\n\t`action` text NOT NULL,\n\t`content_json` text NOT NULL,\n\t`review_note` text,\n\t`actor_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"owner_content_version_action\" CHECK(\"owner_content_versions\".\"action\" IN ('create','edit','review','publish','archive','starter-edit','starter-archive')),\n\tCONSTRAINT \"owner_content_version_json\" CHECK(json_valid(\"owner_content_versions\".\"content_json\") AND length(CAST(\"owner_content_versions\".\"content_json\" AS BLOB))<=60000)\n)"
  },
  {
    "type": "table",
    "name": "owner_financial_records",
    "tbl_name": "owner_financial_records",
    "sql": "CREATE TABLE `owner_financial_records` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`search_key` text NOT NULL,\n\t`source` text DEFAULT 'manual' NOT NULL,\n\t`kind` text NOT NULL,\n\t`status` text DEFAULT 'pending' NOT NULL,\n\t`amount_minor` integer NOT NULL,\n\t`currency` text NOT NULL,\n\t`occurred_on` text NOT NULL,\n\t`period_start` text DEFAULT '' NOT NULL,\n\t`period_end` text DEFAULT '' NOT NULL,\n\t`counterparty` text DEFAULT '' NOT NULL,\n\t`description` text DEFAULT '' NOT NULL,\n\tCONSTRAINT \"owner_finance_revision\" CHECK(\"owner_financial_records\".\"revision\">0),\n\tCONSTRAINT \"owner_finance_source\" CHECK(\"owner_financial_records\".\"source\"='manual'),\n\tCONSTRAINT \"owner_finance_kind\" CHECK(\"owner_financial_records\".\"kind\" IN ('revenue','expense','invoice')),\n\tCONSTRAINT \"owner_finance_status_values\" CHECK(\"owner_financial_records\".\"status\" IN ('pending','confirmed','void')),\n\tCONSTRAINT \"owner_finance_amount\" CHECK(\"owner_financial_records\".\"amount_minor\" BETWEEN 0 AND 100000000000 AND length(\"owner_financial_records\".\"currency\")=3),\n\tCONSTRAINT \"owner_finance_text\" CHECK(length(\"owner_financial_records\".\"counterparty\")<=200 AND length(\"owner_financial_records\".\"description\")<=4000)\n)"
  },
  {
    "type": "table",
    "name": "owner_lead_workflows",
    "tbl_name": "owner_lead_workflows",
    "sql": "CREATE TABLE `owner_lead_workflows` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`search_key` text NOT NULL,\n\t`source_kind` text NOT NULL,\n\t`source_id` text NOT NULL,\n\t`status` text DEFAULT 'new' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\tCONSTRAINT \"owner_leads_revision\" CHECK(\"owner_lead_workflows\".\"revision\">0),\n\tCONSTRAINT \"owner_leads_source_kind\" CHECK(\"owner_lead_workflows\".\"source_kind\" IN ('school-inquiry','plan-review','college-interest')),\n\tCONSTRAINT \"owner_leads_status_values\" CHECK(\"owner_lead_workflows\".\"status\" IN ('new','reviewing','qualified','shared','closed')),\n\tCONSTRAINT \"owner_leads_notes\" CHECK(length(\"owner_lead_workflows\".\"notes\")<=4000)\n)"
  },
  {
    "type": "table",
    "name": "owner_partners",
    "tbl_name": "owner_partners",
    "sql": "CREATE TABLE `owner_partners` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`search_key` text NOT NULL,\n\t`name` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`website` text DEFAULT '' NOT NULL,\n\t`contact_name` text DEFAULT '' NOT NULL,\n\t`contact_email` text DEFAULT '' NOT NULL,\n\t`stage` text DEFAULT 'prospect' NOT NULL,\n\t`notes` text DEFAULT '' NOT NULL,\n\tCONSTRAINT \"owner_partners_revision\" CHECK(\"owner_partners\".\"revision\">0),\n\tCONSTRAINT \"owner_partners_name\" CHECK(length(\"owner_partners\".\"name\") BETWEEN 1 AND 200),\n\tCONSTRAINT \"owner_partners_kind\" CHECK(\"owner_partners\".\"kind\" IN ('college','provider','other')),\n\tCONSTRAINT \"owner_partners_stage_values\" CHECK(\"owner_partners\".\"stage\" IN ('prospect','contacted','discussing','active','paused')),\n\tCONSTRAINT \"owner_partners_contact\" CHECK(length(\"owner_partners\".\"website\")<=1500 AND length(\"owner_partners\".\"contact_name\")<=100 AND length(\"owner_partners\".\"contact_email\")<=254 AND length(\"owner_partners\".\"notes\")<=4000)\n)"
  },
  {
    "type": "table",
    "name": "owner_search_imports",
    "tbl_name": "owner_search_imports",
    "sql": "CREATE TABLE `owner_search_imports` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`property` text NOT NULL,\n\t`fingerprint` text NOT NULL,\n\t`file_name` text NOT NULL,\n\t`dimension` text NOT NULL,\n\t`start_date` text NOT NULL,\n\t`end_date` text NOT NULL,\n\t`exported_on` text NOT NULL,\n\t`search_type` text NOT NULL,\n\t`filters` text NOT NULL,\n\t`row_count` integer NOT NULL,\n\t`rows_json` text NOT NULL,\n\t`summary_json` text NOT NULL,\n\t`imported_by` text NOT NULL,\n\t`imported_at` integer NOT NULL,\n\tCONSTRAINT \"owner_search_import_property\" CHECK(\"owner_search_imports\".\"property\"='degreesteps.com'),\n\tCONSTRAINT \"owner_search_import_dimension_kind\" CHECK(\"owner_search_imports\".\"dimension\" IN ('date','query','page','country','device')),\n\tCONSTRAINT \"owner_search_import_row_count\" CHECK(\"owner_search_imports\".\"row_count\" BETWEEN 1 AND 5000),\n\tCONSTRAINT \"owner_search_import_rows\" CHECK(json_valid(\"owner_search_imports\".\"rows_json\") AND json_type(\"owner_search_imports\".\"rows_json\")='array' AND json_array_length(\"owner_search_imports\".\"rows_json\")=\"owner_search_imports\".\"row_count\" AND length(CAST(\"owner_search_imports\".\"rows_json\" AS BLOB))<=1900000),\n\tCONSTRAINT \"owner_search_import_summary\" CHECK(json_valid(\"owner_search_imports\".\"summary_json\") AND length(CAST(\"owner_search_imports\".\"summary_json\" AS BLOB))<=16384),\n\tCONSTRAINT \"owner_search_import_fingerprint_shape\" CHECK(length(\"owner_search_imports\".\"fingerprint\")=64 AND \"owner_search_imports\".\"fingerprint\" NOT GLOB '*[^a-f0-9]*'),\n\tCONSTRAINT \"owner_search_import_origin\" CHECK(length(\"owner_search_imports\".\"imported_by\") BETWEEN 1 AND 256)\n)"
  },
  {
    "type": "table",
    "name": "owner_search_settings",
    "tbl_name": "owner_search_settings",
    "sql": "CREATE TABLE `owner_search_settings` (\n\t`property` text PRIMARY KEY NOT NULL,\n\t`revision` integer NOT NULL,\n\t`verification_token` text,\n\t`dns_status` text DEFAULT 'unchecked' NOT NULL,\n\t`dns_checked_at` integer,\n\t`google_ownership_reported` integer DEFAULT 0 NOT NULL,\n\t`google_ownership_reported_at` integer,\n\t`sitemap_submitted_reported` integer DEFAULT 0 NOT NULL,\n\t`sitemap_submitted_reported_at` integer,\n\t`updated_by` text NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"owner_search_property\" CHECK(\"owner_search_settings\".\"property\"='degreesteps.com'),\n\tCONSTRAINT \"owner_search_revision\" CHECK(\"owner_search_settings\".\"revision\">0),\n\tCONSTRAINT \"owner_search_dns_status\" CHECK(\"owner_search_settings\".\"dns_status\" IN ('unchecked','present','not-found','check-failed')),\n\tCONSTRAINT \"owner_search_reported_flags\" CHECK(\"owner_search_settings\".\"google_ownership_reported\" IN (0,1) AND \"owner_search_settings\".\"sitemap_submitted_reported\" IN (0,1)),\n\tCONSTRAINT \"owner_search_public_token_length\" CHECK(\"owner_search_settings\".\"verification_token\" IS NULL OR length(\"owner_search_settings\".\"verification_token\") BETWEEN 35 AND 300)\n)"
  },
  {
    "type": "table",
    "name": "owner_tasks",
    "tbl_name": "owner_tasks",
    "sql": "CREATE TABLE `owner_tasks` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`search_key` text NOT NULL,\n\t`title` text NOT NULL,\n\t`description` text DEFAULT '' NOT NULL,\n\t`status` text DEFAULT 'todo' NOT NULL,\n\t`priority` text DEFAULT 'normal' NOT NULL,\n\t`due_on` text DEFAULT '' NOT NULL,\n\tCONSTRAINT \"owner_tasks_revision\" CHECK(\"owner_tasks\".\"revision\">0),\n\tCONSTRAINT \"owner_tasks_title\" CHECK(length(\"owner_tasks\".\"title\") BETWEEN 1 AND 200),\n\tCONSTRAINT \"owner_tasks_description\" CHECK(length(\"owner_tasks\".\"description\")<=4000),\n\tCONSTRAINT \"owner_tasks_status_values\" CHECK(\"owner_tasks\".\"status\" IN ('todo','doing','waiting','done')),\n\tCONSTRAINT \"owner_tasks_priority\" CHECK(\"owner_tasks\".\"priority\" IN ('low','normal','high'))\n)"
  },
  {
    "type": "table",
    "name": "owner_work_events",
    "tbl_name": "owner_work_events",
    "sql": "CREATE TABLE `owner_work_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`resource` text NOT NULL,\n\t`record_id` text NOT NULL,\n\t`revision` integer NOT NULL,\n\t`actor_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`changed_fields_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tCONSTRAINT \"owner_work_event_revision_value\" CHECK(\"owner_work_events\".\"revision\">0),\n\tCONSTRAINT \"owner_work_event_fields\" CHECK(json_valid(\"owner_work_events\".\"changed_fields_json\") AND json_type(\"owner_work_events\".\"changed_fields_json\")='array' AND length(\"owner_work_events\".\"changed_fields_json\")<=2048)\n)"
  },
  {
    "type": "table",
    "name": "plan_alert_subscriptions",
    "tbl_name": "plan_alert_subscriptions",
    "sql": "CREATE TABLE `plan_alert_subscriptions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`portal_plan_id` text NOT NULL,\n\t`plan_id` text NOT NULL,\n\t`email` text NOT NULL,\n\t`fingerprint` text NOT NULL,\n\t`summary_json` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`confirmed_at` integer NOT NULL,\n\t`last_change_email_at` integer,\n\t`last_reminder_at` integer,\n\tCONSTRAINT \"plan_alert_fingerprint_format\" CHECK(length(\"plan_alert_subscriptions\".\"fingerprint\")=64 AND \"plan_alert_subscriptions\".\"fingerprint\" NOT GLOB '*[^0-9a-f]*'),\n\tCONSTRAINT \"plan_alert_plan_format\" CHECK(length(\"plan_alert_subscriptions\".\"plan_id\") BETWEEN 1 AND 128 AND \"plan_alert_subscriptions\".\"plan_id\" NOT GLOB '*[^a-z0-9-]*'),\n\tCONSTRAINT \"plan_alert_email_length\" CHECK(length(\"plan_alert_subscriptions\".\"email\") BETWEEN 3 AND 254),\n\tCONSTRAINT \"plan_alert_summary_length\" CHECK(length(\"plan_alert_subscriptions\".\"summary_json\") BETWEEN 2 AND 2000)\n)"
  },
  {
    "type": "table",
    "name": "plan_alert_tokens",
    "tbl_name": "plan_alert_tokens",
    "sql": "CREATE TABLE `plan_alert_tokens` (\n\t`token_hash` text PRIMARY KEY NOT NULL,\n\t`subscription_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`subscription_id`) REFERENCES `plan_alert_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"plan_alert_token_hash_format\" CHECK(length(\"plan_alert_tokens\".\"token_hash\")=64 AND \"plan_alert_tokens\".\"token_hash\" NOT GLOB '*[^0-9a-f]*')\n)"
  },
  {
    "type": "table",
    "name": "plan_review_requests",
    "tbl_name": "plan_review_requests",
    "sql": "CREATE TABLE `plan_review_requests` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`plan_id` text DEFAULT '' NOT NULL,\n\t`plan_title` text DEFAULT '' NOT NULL,\n\t`note` text DEFAULT '' NOT NULL,\n\t`offer_price` integer NOT NULL,\n\t`offer_currency` text NOT NULL,\n\t`offer_status` text NOT NULL,\n\t`consent_version` text NOT NULL,\n\t`consent_text` text NOT NULL,\n\tCONSTRAINT \"plan_review_plan_format\" CHECK(\"plan_review_requests\".\"plan_id\"='' OR (length(\"plan_review_requests\".\"plan_id\") BETWEEN 1 AND 128 AND \"plan_review_requests\".\"plan_id\" NOT GLOB '*[^a-z0-9-]*')),\n\tCONSTRAINT \"plan_review_text_lengths\" CHECK(length(\"plan_review_requests\".\"name\") BETWEEN 1 AND 100 AND length(\"plan_review_requests\".\"email\") BETWEEN 3 AND 254 AND length(\"plan_review_requests\".\"plan_title\")<=200 AND length(\"plan_review_requests\".\"note\")<=1000),\n\tCONSTRAINT \"plan_review_offer\" CHECK(\"plan_review_requests\".\"offer_price\" BETWEEN 0 AND 10000 AND length(\"plan_review_requests\".\"offer_currency\")=3 AND \"plan_review_requests\".\"offer_status\" IN ('waitlist','checkout')),\n\tCONSTRAINT \"plan_review_consent\" CHECK(length(\"plan_review_requests\".\"consent_version\") BETWEEN 1 AND 40 AND length(\"plan_review_requests\".\"consent_text\") BETWEEN 20 AND 600)\n)"
  },
  {
    "type": "table",
    "name": "portal_plans",
    "tbl_name": "portal_plans",
    "sql": "CREATE TABLE `portal_plans` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`title` text NOT NULL,\n\t`school` text DEFAULT '' NOT NULL,\n\t`degree` text DEFAULT '' NOT NULL,\n\t`state_json` text NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `portal_profiles`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"portal_plan_title_length\" CHECK(length(\"portal_plans\".\"title\") BETWEEN 1 AND 120),\n\tCONSTRAINT \"portal_plan_school_length\" CHECK(length(\"portal_plans\".\"school\") <= 120),\n\tCONSTRAINT \"portal_plan_degree_length\" CHECK(length(\"portal_plans\".\"degree\") <= 200),\n\tCONSTRAINT \"portal_plan_state_limit\" CHECK(length(CAST(\"portal_plans\".\"state_json\" AS BLOB)) <= 524288 AND json_valid(\"portal_plans\".\"state_json\")),\n\tCONSTRAINT \"portal_plan_revision_positive\" CHECK(\"portal_plans\".\"revision\" > 0)\n)"
  },
  {
    "type": "table",
    "name": "portal_profiles",
    "tbl_name": "portal_profiles",
    "sql": "CREATE TABLE `portal_profiles` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`alias` text DEFAULT 'Student' NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tCONSTRAINT \"portal_profile_alias_length\" CHECK(length(\"portal_profiles\".\"alias\") BETWEEN 2 AND 60)\n)"
  },
  {
    "type": "table",
    "name": "portal_rate_limits",
    "tbl_name": "portal_rate_limits",
    "sql": "CREATE TABLE `portal_rate_limits` (\n\t`user_id` text NOT NULL,\n\t`action` text NOT NULL,\n\t`window_start` integer NOT NULL,\n\t`count` integer NOT NULL,\n\tPRIMARY KEY(`user_id`, `action`),\n\tFOREIGN KEY (`user_id`) REFERENCES `portal_profiles`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"portal_rate_action\" CHECK(\"portal_rate_limits\".\"action\" IN ('save','profile','delete')),\n\tCONSTRAINT \"portal_rate_positive\" CHECK(\"portal_rate_limits\".\"count\" > 0)\n)"
  },
  {
    "type": "table",
    "name": "school_inquiries",
    "tbl_name": "school_inquiries",
    "sql": "CREATE TABLE `school_inquiries` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`plan_id` text NOT NULL,\n\t`plan_title` text NOT NULL,\n\t`school` text NOT NULL,\n\t`first_name` text NOT NULL,\n\t`email` text NOT NULL,\n\t`phone` text DEFAULT '' NOT NULL,\n\t`location` text NOT NULL,\n\t`start_timing` text NOT NULL,\n\t`prior_credit` text NOT NULL,\n\t`consent_version` text NOT NULL,\n\t`consent_text` text NOT NULL,\n\tCONSTRAINT \"school_inquiry_plan_format\" CHECK(length(\"school_inquiries\".\"plan_id\") BETWEEN 1 AND 128 AND \"school_inquiries\".\"plan_id\" NOT GLOB '*[^a-z0-9-]*'),\n\tCONSTRAINT \"school_inquiry_text_lengths\" CHECK(length(\"school_inquiries\".\"plan_title\") BETWEEN 1 AND 200 AND length(\"school_inquiries\".\"school\") BETWEEN 1 AND 160 AND length(\"school_inquiries\".\"first_name\") BETWEEN 1 AND 60 AND length(\"school_inquiries\".\"email\") BETWEEN 3 AND 254 AND length(\"school_inquiries\".\"phone\")<=40 AND length(\"school_inquiries\".\"location\") BETWEEN 2 AND 80),\n\tCONSTRAINT \"school_inquiry_start_timing\" CHECK(\"school_inquiries\".\"start_timing\" IN ('this-term','next-6-months','later')),\n\tCONSTRAINT \"school_inquiry_prior_credit\" CHECK(\"school_inquiries\".\"prior_credit\" IN ('yes','no')),\n\tCONSTRAINT \"school_inquiry_consent\" CHECK(length(\"school_inquiries\".\"consent_version\") BETWEEN 1 AND 40 AND length(\"school_inquiries\".\"consent_text\") BETWEEN 20 AND 600)\n)"
  },
  {
    "type": "table",
    "name": "support_messages",
    "tbl_name": "support_messages",
    "sql": "CREATE TABLE `support_messages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`ticket_id` text NOT NULL,\n\t`ticket_revision` integer NOT NULL,\n\t`author_id` text NOT NULL,\n\t`author_role` text NOT NULL,\n\t`visibility` text DEFAULT 'student' NOT NULL,\n\t`body` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE no action,\n\tCONSTRAINT \"support_messages_revision\" CHECK(\"support_messages\".\"ticket_revision\">0),\n\tCONSTRAINT \"support_messages_role\" CHECK(\"support_messages\".\"author_role\" IN ('owner','student')),\n\tCONSTRAINT \"support_messages_visibility\" CHECK(\"support_messages\".\"visibility\" IN ('student','internal') AND (\"support_messages\".\"author_role\"!='student' OR \"support_messages\".\"visibility\"='student')),\n\tCONSTRAINT \"support_messages_body\" CHECK(length(\"support_messages\".\"body\") BETWEEN 1 AND 6000)\n)"
  },
  {
    "type": "table",
    "name": "support_rate_limits",
    "tbl_name": "support_rate_limits",
    "sql": "CREATE TABLE `support_rate_limits` (\n\t`user_id` text NOT NULL,\n\t`day` text NOT NULL,\n\t`kind` text NOT NULL,\n\t`count` integer NOT NULL,\n\tPRIMARY KEY(`user_id`, `day`, `kind`),\n\tCONSTRAINT \"support_rate_kind\" CHECK(\"support_rate_limits\".\"kind\" IN ('ticket','message')),\n\tCONSTRAINT \"support_rate_count\" CHECK(\"support_rate_limits\".\"count\">0 AND \"support_rate_limits\".\"count\"<=100)\n)"
  },
  {
    "type": "table",
    "name": "support_tickets",
    "tbl_name": "support_tickets",
    "sql": "CREATE TABLE `support_tickets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`revision` integer DEFAULT 1 NOT NULL,\n\t`created_by` text NOT NULL,\n\t`updated_by` text NOT NULL,\n\t`last_event_id` text NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`search_key` text NOT NULL,\n\t`user_id` text,\n\t`contact_email` text DEFAULT '' NOT NULL,\n\t`subject` text NOT NULL,\n\t`category` text NOT NULL,\n\t`status` text DEFAULT 'open' NOT NULL,\n\t`priority` text DEFAULT 'normal' NOT NULL,\n\t`diagnostics_consent` integer DEFAULT 0 NOT NULL,\n\t`diagnostics_json` text DEFAULT '{}' NOT NULL,\n\tCONSTRAINT \"support_tickets_revision\" CHECK(\"support_tickets\".\"revision\">0),\n\tCONSTRAINT \"support_tickets_subject\" CHECK(length(\"support_tickets\".\"subject\") BETWEEN 1 AND 200),\n\tCONSTRAINT \"support_tickets_category\" CHECK(\"support_tickets\".\"category\" IN ('account','plan','course','bug','other')),\n\tCONSTRAINT \"support_tickets_status_values\" CHECK(\"support_tickets\".\"status\" IN ('open','in-progress','waiting','resolved')),\n\tCONSTRAINT \"support_tickets_priority\" CHECK(\"support_tickets\".\"priority\" IN ('low','normal','high')),\n\tCONSTRAINT \"support_tickets_diagnostics\" CHECK(\"support_tickets\".\"diagnostics_consent\" IN (0,1) AND json_valid(\"support_tickets\".\"diagnostics_json\") AND length(\"support_tickets\".\"diagnostics_json\")<=2048 AND (\"support_tickets\".\"diagnostics_consent\"=1 OR \"support_tickets\".\"diagnostics_json\"='{}'))\n)"
  },
  {
    "type": "table",
    "name": "template_requests",
    "tbl_name": "template_requests",
    "sql": "CREATE TABLE `template_requests` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`template_id` text NOT NULL,\n\t`details` text DEFAULT '' NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"template_request_details\" CHECK(length(\"template_requests\".\"details\") <= 4000)\n)"
  },
  {
    "type": "table",
    "name": "template_research_progress",
    "tbl_name": "template_research_progress",
    "sql": "CREATE TABLE `template_research_progress` (\n\t`template_id` text PRIMARY KEY NOT NULL,\n\t`stage` text NOT NULL,\n\t`pass` integer DEFAULT 1 NOT NULL,\n\t`source_count` integer DEFAULT 0 NOT NULL,\n\t`requirement_count` integer DEFAULT 0 NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"template_progress_stage\" CHECK(\"template_research_progress\".\"stage\" IN ('identifying','requirements','transfers','checking','refining','complete','needs-attention')),\n\tCONSTRAINT \"template_progress_pass\" CHECK(\"template_research_progress\".\"pass\" BETWEEN 1 AND 2),\n\tCONSTRAINT \"template_progress_sources\" CHECK(\"template_research_progress\".\"source_count\" BETWEEN 0 AND 200),\n\tCONSTRAINT \"template_progress_requirements\" CHECK(\"template_research_progress\".\"requirement_count\" BETWEEN 0 AND 180)\n)"
  },
  {
    "type": "table",
    "name": "template_research_runs",
    "tbl_name": "template_research_runs",
    "sql": "CREATE TABLE `template_research_runs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`template_id` text NOT NULL,\n\t`user_id` text NOT NULL,\n\t`status` text NOT NULL,\n\t`model` text NOT NULL,\n\t`started_at` integer NOT NULL,\n\t`finished_at` integer,\n\t`input_tokens` integer,\n\t`output_tokens` integer,\n\t`error_code` text,\n\tFOREIGN KEY (`template_id`) REFERENCES `degree_templates`(`id`) ON UPDATE no action ON DELETE cascade,\n\tCONSTRAINT \"template_run_status\" CHECK(\"template_research_runs\".\"status\" IN ('running','completed','failed'))\n)"
  },
  {
    "type": "table",
    "name": "transcript_import_runs",
    "tbl_name": "transcript_import_runs",
    "sql": "CREATE TABLE `transcript_import_runs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`started_at` integer NOT NULL,\n\tCONSTRAINT \"transcript_import_started\" CHECK(\"transcript_import_runs\".\"started_at\" >= 0)\n)"
  }
].map(row=>Object.freeze(row)));
