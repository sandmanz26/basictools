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
--> statement-breakpoint
ALTER TABLE "status_updates" ALTER COLUMN "health" SET DATA TYPE varchar(60);--> statement-breakpoint
ALTER TABLE "status_updates" ALTER COLUMN "health" SET DEFAULT 'on_track';--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "daily_cap" integer;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "window_start" integer;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "window_end" integer;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "paused_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD COLUMN "resume_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "talents" ADD COLUMN "portfolio" varchar(500) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_emails" ADD CONSTRAINT "sent_emails_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sent_emails_lead_idx" ON "sent_emails" USING btree ("lead_id","sent_at");--> statement-breakpoint
DROP TYPE "public"."health";