CREATE TYPE "public"."file_owner" AS ENUM('project', 'invoice', 'schedule', 'schedule_event');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('planned', 'held', 'cancelled');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank" varchar(120) NOT NULL,
	"number" varchar(60) NOT NULL,
	"holder" varchar(200) DEFAULT '' NOT NULL,
	"currency" varchar(3) DEFAULT 'IDR' NOT NULL,
	"swift" varchar(20) DEFAULT '' NOT NULL,
	"branch" varchar(200) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "file_owner" NOT NULL,
	"owner_id" varchar(80) NOT NULL,
	"name" varchar(300) NOT NULL,
	"url" text NOT NULL,
	"category" varchar(40) DEFAULT 'other' NOT NULL,
	"size" bigint,
	"source" varchar(20) DEFAULT 'link' NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"paid_on" date NOT NULL,
	"amount" bigint DEFAULT 0 NOT NULL,
	"withheld" bigint DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_payments_nonneg" CHECK ("invoice_payments"."amount" >= 0 and "invoice_payments"."withheld" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meeting_followups" (
	"user_id" uuid NOT NULL,
	"outlook_id" varchar(300) NOT NULL,
	"status" varchar(10) NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_followups_user_id_outlook_id_pk" PRIMARY KEY("user_id","outlook_id")
);
--> statement-breakpoint
CREATE TABLE "project_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(300) NOT NULL,
	"date" date NOT NULL,
	"start_time" varchar(5) DEFAULT '' NOT NULL,
	"end_time" varchar(5) DEFAULT '' NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"decisions" text DEFAULT '' NOT NULL,
	"location" varchar(300) DEFAULT '' NOT NULL,
	"join_url" text DEFAULT '' NOT NULL,
	"outlook_id" varchar(300) DEFAULT '' NOT NULL,
	"status" "meeting_status" DEFAULT 'planned' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "logo_path" varchar(500) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "default_tax_pct" numeric DEFAULT 11 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "default_term_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "footer" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "signer_name" varchar(200) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_profile" ADD COLUMN "signer_title" varchar(200) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "currency" varchar(3) DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "bank_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD COLUMN "paid_amount" bigint;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD COLUMN "withheld" bigint;--> statement-breakpoint
ALTER TABLE "schedule_events" ADD COLUMN "paid_note" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "currency" varchar(3) DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN "pay_to" jsonb;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "file_refs" ADD CONSTRAINT "file_refs_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_payments" ADD CONSTRAINT "invoice_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_followups" ADD CONSTRAINT "meeting_followups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_meetings" ADD CONSTRAINT "project_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "file_refs_owner_idx" ON "file_refs" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "invoice_payments_invoice_idx" ON "invoice_payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "project_meetings_project_idx" ON "project_meetings" USING btree ("project_id","date");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bank_id_bank_accounts_id_fk" FOREIGN KEY ("bank_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Data fix: project phase went from 5 values to 3. Same mapping as migratePhase() in the web app.
UPDATE "projects" SET "info" = jsonb_set("info", '{phase}', to_jsonb(CASE "info"->>'phase'
  WHEN 'execution' THEN 'ongoing' WHEN 'monitoring' THEN 'ongoing' WHEN 'closing' THEN 'completed' ELSE 'planning' END))
WHERE "info"->>'phase' IS NOT NULL AND "info"->>'phase' NOT IN ('planning', 'ongoing', 'completed');
