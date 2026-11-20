CREATE TYPE "public"."ai_language" AS ENUM('uz', 'ru', 'en');--> statement-breakpoint
CREATE TYPE "public"."contract_type" AS ENUM('rental', 'employment', 'sale', 'services', 'nda', 'other');--> statement-breakpoint
CREATE TYPE "public"."edit_status" AS ENUM('proposed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('landlord', 'tenant', 'employer', 'employee', 'seller', 'buyer', 'provider', 'client', 'discloser', 'recipient', 'other');--> statement-breakpoint
CREATE TYPE "public"."recipient_status" AS ENUM('pending', 'viewed', 'signed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."signature_request_status" AS ENUM('pending', 'sent', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."summaries_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('acceptable', 'needs_changes', 'not_acceptable');--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"agency_id" uuid,
	"name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parent_document_id" uuid,
	"root_document_id" uuid,
	"extracted_text" text,
	"extracted_language" text,
	"extracted_clauses" jsonb,
	"scanned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_version_positive" CHECK ("documents"."version" >= 1),
	CONSTRAINT "documents_size_positive" CHECK ("documents"."size_bytes" > 0),
	CONSTRAINT "documents_parent_pair" CHECK (("documents"."version" = 1) = ("documents"."parent_document_id" is null))
);
--> statement-breakpoint
CREATE TABLE "ai_reviews" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"agency_id" uuid,
	"status" "review_status" DEFAULT 'queued' NOT NULL,
	"language" "ai_language" DEFAULT 'uz' NOT NULL,
	"doc_type" "contract_type",
	"parties" jsonb,
	"risk_level" "risk_level",
	"verdict" "verdict",
	"summary" text,
	"law_version_date" text,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"idempotency_key" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_reviews_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "ai_issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"review_id" uuid NOT NULL,
	"clause_ref" text NOT NULL,
	"quote" text NOT NULL,
	"problem" text NOT NULL,
	"severity" "severity" NOT NULL,
	"recommendation" text NOT NULL,
	"citation" jsonb,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_review_messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"review_id" uuid NOT NULL,
	"author_user_id" uuid,
	"role" "message_role" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"status" "message_status" DEFAULT 'done' NOT NULL,
	"reply_to_message_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_edits" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"clause_ref" text NOT NULL,
	"original" text NOT NULL,
	"replacement" text NOT NULL,
	"reason" text NOT NULL,
	"citation" jsonb,
	"status" "edit_status" DEFAULT 'proposed' NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "signature_requests" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"agency_id" uuid,
	"status" "signature_request_status" DEFAULT 'pending' NOT NULL,
	"document_hash" text NOT NULL,
	"summary_language" "ai_language" DEFAULT 'uz' NOT NULL,
	"summaries_status" "summaries_status" DEFAULT 'queued' NOT NULL,
	"summary_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signature_request_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"party_name" text,
	"token" text NOT NULL,
	"status" "recipient_status" DEFAULT 'pending' NOT NULL,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipients_token_unique" UNIQUE("token"),
	CONSTRAINT "recipients_email_normalized" CHECK ("recipients"."email" = lower(trim("recipients"."email")))
);
--> statement-breakpoint
CREATE TABLE "recipient_summaries" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"signature_request_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"party_name" text NOT NULL,
	"language" "ai_language" NOT NULL,
	"body" jsonb NOT NULL,
	"summary_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipient_summaries_recipient_id_unique" UNIQUE("recipient_id")
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"period" text NOT NULL,
	"scope_key" text NOT NULL,
	"user_id" uuid,
	"agency_id" uuid,
	"reviews_used" integer DEFAULT 0 NOT NULL,
	"revisions_used" integer DEFAULT 0 NOT NULL,
	"summaries_used" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_usage_period_scope_unique" UNIQUE("period","scope_key")
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_documents_id_fk" FOREIGN KEY ("parent_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_root_document_id_documents_id_fk" FOREIGN KEY ("root_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_reviews" ADD CONSTRAINT "ai_reviews_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_issues" ADD CONSTRAINT "ai_issues_review_id_ai_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."ai_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_messages" ADD CONSTRAINT "ai_review_messages_review_id_ai_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."ai_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_review_messages" ADD CONSTRAINT "ai_review_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_edits" ADD CONSTRAINT "ai_edits_message_id_ai_review_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_review_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_edits" ADD CONSTRAINT "ai_edits_review_id_ai_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."ai_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_edits" ADD CONSTRAINT "ai_edits_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_signature_request_id_signature_requests_id_fk" FOREIGN KEY ("signature_request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_summaries" ADD CONSTRAINT "recipient_summaries_signature_request_id_signature_requests_id_fk" FOREIGN KEY ("signature_request_id") REFERENCES "public"."signature_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipient_summaries" ADD CONSTRAINT "recipient_summaries_recipient_id_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."recipients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_owner_user_id_idx" ON "documents" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "documents_root_document_id_idx" ON "documents" USING btree ("root_document_id","version");--> statement-breakpoint
CREATE INDEX "documents_parent_document_id_idx" ON "documents" USING btree ("parent_document_id");--> statement-breakpoint
CREATE INDEX "ai_reviews_document_id_idx" ON "ai_reviews" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_reviews_requested_by_idx" ON "ai_reviews" USING btree ("requested_by_user_id");--> statement-breakpoint
CREATE INDEX "ai_issues_review_id_idx" ON "ai_issues" USING btree ("review_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_review_messages_review_id_idx" ON "ai_review_messages" USING btree ("review_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_edits_message_id_idx" ON "ai_edits" USING btree ("message_id","order_index");--> statement-breakpoint
CREATE INDEX "ai_edits_review_id_idx" ON "ai_edits" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "signature_requests_document_id_idx" ON "signature_requests" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "signature_requests_created_by_idx" ON "signature_requests" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "recipients_signature_request_id_idx" ON "recipients" USING btree ("signature_request_id");--> statement-breakpoint
CREATE INDEX "recipient_summaries_signature_request_id_idx" ON "recipient_summaries" USING btree ("signature_request_id");