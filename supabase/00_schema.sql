-- HireFlow schema (generated from server/drizzle/*.sql by supabase/build-schema.sh — do not edit by hand).
-- Paste into the Supabase SQL editor and run once on an empty project.

-- ===== 0000_init.sql =====
CREATE TYPE "public"."work_arrangement" AS ENUM('WFO', 'Hybrid', 'WFH', 'Any');
CREATE TYPE "public"."broadcast_status" AS ENUM('draft', 'running', 'paused', 'done', 'cancelled');
CREATE TYPE "public"."field_type" AS ENUM('text', 'number', 'date', 'select');
CREATE TYPE "public"."frequency" AS ENUM('once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
CREATE TYPE "public"."health" AS ENUM('on_track', 'at_risk', 'off_track', 'on_hold', 'done');
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid');
CREATE TYPE "public"."milestone_status" AS ENUM('upcoming', 'done', 'missed');
CREATE TYPE "public"."position_status" AS ENUM('open', 'closed', 'draft');
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'critical');
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');
CREATE TYPE "public"."question_type" AS ENUM('essay', 'multiple_choice', 'coding', 'case_study');
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'skipped', 'cancelled');
CREATE TYPE "public"."risk_kind" AS ENUM('risk', 'issue');
CREATE TYPE "public"."risk_status" AS ENUM('open', 'mitigating', 'closed');
CREATE TYPE "public"."schedule_kind" AS ENUM('receivable', 'payable');
CREATE TYPE "public"."screening_result" AS ENUM('pending', 'pass', 'fail');
CREATE TYPE "public"."share_access" AS ENUM('public', 'password');
CREATE TYPE "public"."share_view" AS ENUM('table', 'kanban');
CREATE TYPE "public"."suppression_reason" AS ENUM('unsubscribe', 'bounce', 'manual');
CREATE TYPE "public"."user_status" AS ENUM('pending', 'active', 'disabled');
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity" varchar(60),
	"entity_id" varchar(80),
	"ip" varchar(64),
	"request_id" varchar(80),
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "billing_profile" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company" varchar(200) DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"tax_id" varchar(60) DEFAULT '' NOT NULL,
	"bank_name" varchar(120) DEFAULT '' NOT NULL,
	"bank_account" varchar(60) DEFAULT '' NOT NULL,
	"bank_holder" varchar(200) DEFAULT '' NOT NULL,
	"payment_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_profile_singleton" CHECK ("billing_profile"."id" = 1)
);

CREATE TABLE "broadcast_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"broadcast_id" uuid NOT NULL,
	"lead_id" uuid,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) DEFAULT '' NOT NULL,
	"merge" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"error" text DEFAULT '' NOT NULL,
	"provider_message_id" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"footer" boolean DEFAULT true NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"status" "broadcast_status" DEFAULT 'draft' NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "budget_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" varchar(200) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"planned" bigint DEFAULT 0 NOT NULL,
	"actual" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"talent_id" uuid,
	"position_id" uuid,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"source" varchar(120) DEFAULT '' NOT NULL,
	"screening_score" integer,
	"screening_result" "screening_result" DEFAULT 'pending' NOT NULL,
	"salary_min" bigint,
	"salary_max" bigint,
	"archived" boolean DEFAULT false NOT NULL,
	"arrangement" "work_arrangement" DEFAULT 'Any' NOT NULL,
	"stage" varchar(80) NOT NULL,
	"next_step" text DEFAULT '' NOT NULL,
	"owner" varchar(200) DEFAULT '' NOT NULL,
	"applied_at" date DEFAULT current_date NOT NULL,
	"rounds" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reject_reason" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_score_chk" CHECK ("candidates"."screening_score" is null or ("candidates"."screening_score" between 0 and 100))
);

CREATE TABLE "email_suppressions" (
	"email" varchar(320) PRIMARY KEY NOT NULL,
	"reason" "suppression_reason" NOT NULL,
	"broadcast_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"subject" varchar(500) DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"qty" numeric DEFAULT 1 NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"ref" varchar(120),
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"number" varchar(40) NOT NULL,
	"client_name" varchar(200) DEFAULT '' NOT NULL,
	"client_email" varchar(320) DEFAULT '' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"tax_pct" numeric DEFAULT 11 NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"schedule_key" varchar(80),
	"period" varchar(80) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lead_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" varchar(120) NOT NULL,
	"type" "field_type" DEFAULT 'text' NOT NULL,
	"options" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) DEFAULT '' NOT NULL,
	"company" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(200) DEFAULT '' NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"source" varchar(120) DEFAULT '' NOT NULL,
	"stage" varchar(80) DEFAULT 'new' NOT NULL,
	"value" bigint,
	"owner" varchar(200) DEFAULT '' NOT NULL,
	"next_action" text DEFAULT '' NOT NULL,
	"next_action_date" date,
	"tags" varchar(300) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"last_contact_at" date,
	"unsubscribed" boolean DEFAULT false NOT NULL,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"role" varchar(200) DEFAULT '' NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"allocation" integer DEFAULT 100 NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"date" date,
	"status" "milestone_status" DEFAULT 'upcoming' NOT NULL,
	"owner" varchar(200) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"department" varchar(120) DEFAULT '' NOT NULL,
	"level" varchar(60) DEFAULT '' NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"status" "position_status" DEFAULT 'open' NOT NULL,
	"arrangement" "work_arrangement" DEFAULT 'Any' NOT NULL,
	"salary_min" bigint,
	"salary_max" bigint,
	"description" text DEFAULT '' NOT NULL,
	"requirements" text DEFAULT '' NOT NULL,
	"test_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"form_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"stages" jsonb NOT NULL,
	"pm_stages" jsonb NOT NULL,
	"info" jsonb NOT NULL,
	"pm_features" jsonb NOT NULL,
	"pm_fields" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"ip" varchar(64),
	"user_agent" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "risk_kind" DEFAULT 'risk' NOT NULL,
	"title" varchar(300) NOT NULL,
	"probability" integer DEFAULT 3 NOT NULL,
	"impact" integer DEFAULT 3 NOT NULL,
	"status" "risk_status" DEFAULT 'open' NOT NULL,
	"owner" varchar(200) DEFAULT '' NOT NULL,
	"mitigation" text DEFAULT '' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risks_prob_chk" CHECK ("risks"."probability" between 1 and 5),
	CONSTRAINT "risks_impact_chk" CHECK ("risks"."impact" between 1 and 5)
);

CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);

CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);

CREATE TABLE "schedule_events" (
	"schedule_id" uuid NOT NULL,
	"occurrence_date" date NOT NULL,
	"issued_at" date,
	"invoice_no" varchar(40) DEFAULT '' NOT NULL,
	"paid_at" date,
	"skipped" boolean DEFAULT false NOT NULL,
	"invoice_id" uuid,
	"invoice_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_events_schedule_id_occurrence_date_pk" PRIMARY KEY("schedule_id","occurrence_date")
);

CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "schedule_kind" NOT NULL,
	"project_id" uuid,
	"party" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(300) DEFAULT '' NOT NULL,
	"amount" bigint,
	"frequency" "frequency" DEFAULT 'monthly' NOT NULL,
	"day" integer DEFAULT 1 NOT NULL,
	"weekday" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"lead_days" integer DEFAULT 7 NOT NULL,
	"term_days" integer DEFAULT 14 NOT NULL,
	"pic" varchar(200) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"template" jsonb,
	"auto_draft" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_day_chk" CHECK ("schedules"."day" between 0 and 31)
);

CREATE TABLE "settings" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(64) NOT NULL,
	"project_id" uuid NOT NULL,
	"label" varchar(200) DEFAULT '' NOT NULL,
	"access" "share_access" DEFAULT 'public' NOT NULL,
	"password_hash" text,
	"view" "share_view" DEFAULT 'table' NOT NULL,
	"show_salary" boolean DEFAULT false NOT NULL,
	"show_contact" boolean DEFAULT false NOT NULL,
	"position_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "status_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date DEFAULT current_date NOT NULL,
	"author" varchar(200) DEFAULT '' NOT NULL,
	"health" "health" DEFAULT 'on_track' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"highlights" text DEFAULT '' NOT NULL,
	"blockers" text DEFAULT '' NOT NULL,
	"next_steps" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "talents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) DEFAULT '' NOT NULL,
	"phone" varchar(60) DEFAULT '' NOT NULL,
	"source" varchar(120) DEFAULT '' NOT NULL,
	"skills" text DEFAULT '' NOT NULL,
	"salary_min" bigint,
	"salary_max" bigint,
	"arrangement" "work_arrangement" DEFAULT 'Any' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"stage" varchar(80) NOT NULL,
	"assignee" varchar(200) DEFAULT '' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"start_date" date,
	"due_date" date,
	"estimate_h" numeric,
	"milestone_id" uuid,
	"labels" varchar(300) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "test_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"position_id" uuid NOT NULL,
	"text" text NOT NULL,
	"type" "question_type" DEFAULT 'essay' NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"answer_key" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" uuid NOT NULL,
	"status" "user_status" DEFAULT 'pending' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"password_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_talent_id_talents_id_fk" FOREIGN KEY ("talent_id") REFERENCES "public"."talents"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_broadcast_id_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."broadcasts"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "members" ADD CONSTRAINT "members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "positions" ADD CONSTRAINT "positions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "risks" ADD CONSTRAINT "risks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "schedule_events" ADD CONSTRAINT "schedule_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "test_questions" ADD CONSTRAINT "test_questions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");
CREATE INDEX "audit_log_action_idx" ON "audit_log" USING btree ("action","created_at");
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");
CREATE UNIQUE INDEX "broadcast_recipients_uq" ON "broadcast_recipients" USING btree ("broadcast_id","email");
CREATE INDEX "broadcast_recipients_due_idx" ON "broadcast_recipients" USING btree ("status","next_attempt_at");
CREATE INDEX "broadcast_recipients_broadcast_idx" ON "broadcast_recipients" USING btree ("broadcast_id","status");
CREATE INDEX "broadcast_recipients_sent_idx" ON "broadcast_recipients" USING btree ("sent_at");
CREATE INDEX "broadcasts_status_idx" ON "broadcasts" USING btree ("status");
CREATE INDEX "budget_items_project_idx" ON "budget_items" USING btree ("project_id");
CREATE INDEX "candidates_project_idx" ON "candidates" USING btree ("project_id","archived");
CREATE INDEX "candidates_talent_idx" ON "candidates" USING btree ("talent_id");
CREATE INDEX "candidates_position_idx" ON "candidates" USING btree ("position_id");
CREATE INDEX "candidates_stage_idx" ON "candidates" USING btree ("project_id","stage");
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("number");
CREATE UNIQUE INDEX "invoices_schedule_key_uq" ON "invoices" USING btree ("schedule_key");
CREATE INDEX "invoices_project_idx" ON "invoices" USING btree ("project_id");
CREATE INDEX "invoices_status_due_idx" ON "invoices" USING btree ("status","due_date");
CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");
CREATE INDEX "leads_email_idx" ON "leads" USING btree (lower("email"));
CREATE INDEX "leads_company_idx" ON "leads" USING btree (lower("company"));
CREATE INDEX "members_project_idx" ON "members" USING btree ("project_id");
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("project_id");
CREATE UNIQUE INDEX "password_resets_hash_uq" ON "password_resets" USING btree ("token_hash");
CREATE INDEX "password_resets_user_idx" ON "password_resets" USING btree ("user_id");
CREATE INDEX "positions_project_idx" ON "positions" USING btree ("project_id");
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");
CREATE INDEX "risks_project_idx" ON "risks" USING btree ("project_id");
CREATE INDEX "schedule_events_invoice_idx" ON "schedule_events" USING btree ("invoice_id");
CREATE INDEX "schedules_project_idx" ON "schedules" USING btree ("project_id");
CREATE UNIQUE INDEX "share_links_token_uq" ON "share_links" USING btree ("token");
CREATE INDEX "share_links_project_idx" ON "share_links" USING btree ("project_id");
CREATE INDEX "status_updates_project_idx" ON "status_updates" USING btree ("project_id","date");
CREATE INDEX "talents_email_idx" ON "talents" USING btree (lower("email"));
CREATE INDEX "talents_name_idx" ON "talents" USING btree (lower("name"));
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id","stage");
CREATE INDEX "tasks_milestone_idx" ON "tasks" USING btree ("milestone_id");
CREATE INDEX "test_questions_position_idx" ON "test_questions" USING btree ("position_id");
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");
-- ===== 0001_statuses_portfolio_broadcast_limits_sent_emails.sql =====
CREATE TABLE "sent_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"to_email" varchar(320) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(20) NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"sent_by" uuid,
	"provider_message_id" varchar(300),
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "status_updates" ALTER COLUMN "health" SET DATA TYPE varchar(60);
ALTER TABLE "status_updates" ALTER COLUMN "health" SET DEFAULT 'on_track';
ALTER TABLE "broadcasts" ADD COLUMN "daily_cap" integer;
ALTER TABLE "broadcasts" ADD COLUMN "window_start" integer;
ALTER TABLE "broadcasts" ADD COLUMN "window_end" integer;
ALTER TABLE "broadcasts" ADD COLUMN "paused_reason" text DEFAULT '' NOT NULL;
ALTER TABLE "broadcasts" ADD COLUMN "resume_at" timestamp with time zone;
ALTER TABLE "talents" ADD COLUMN "portfolio" varchar(500) DEFAULT '' NOT NULL;
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "sent_emails_lead_idx" ON "sent_emails" USING btree ("lead_id","sent_at");
DROP TYPE "public"."health";
