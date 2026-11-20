CREATE TYPE "public"."delivery_channel" AS ENUM('email', 'telegram', 'sms', 'link');--> statement-breakpoint
CREATE TYPE "public"."recipient_source" AS ENUM('invite', 'open_link');--> statement-breakpoint
CREATE TYPE "public"."signature_method" AS ENUM('typed', 'drawn', 'uploaded');--> statement-breakpoint
ALTER TYPE "public"."signature_request_status" ADD VALUE 'draft';--> statement-breakpoint
ALTER TABLE "recipient_summaries" DROP CONSTRAINT "recipient_summaries_recipient_id_unique";--> statement-breakpoint
ALTER TABLE "recipients" DROP CONSTRAINT "recipients_email_normalized";--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "recipients" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipients" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipient_summaries" ALTER COLUMN "recipient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "title" text;--> statement-breakpoint
-- Existing sends: title = the document name.
UPDATE "signature_requests" SET "title" = d."name" FROM "documents" d WHERE d."id" = "signature_requests"."document_id";--> statement-breakpoint
ALTER TABLE "signature_requests" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "message" text;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "party_name" text;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "page_count" integer;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "page_sizes" jsonb;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "open_link_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "public_token" text;--> statement-breakpoint
ALTER TABLE "signature_requests" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "channel" "delivery_channel" DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "contact" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "source" "recipient_source" DEFAULT 'invite' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signer_name" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "field_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signature_method" "signature_method";--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signature_image_key" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signer_ip" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signer_user_agent" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signed_pdf_key" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "certificate_key" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "signed_hash" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "seal_signature" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "seal_kid" text;--> statement-breakpoint
ALTER TABLE "recipients" ADD COLUMN "failed_password_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "signature_requests_created_by_created_at_idx" ON "signature_requests" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
CREATE INDEX "recipients_email_idx" ON "recipients" USING btree ("email");--> statement-breakpoint
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_public_token_unique" UNIQUE("public_token");--> statement-breakpoint
-- One summary per send: keep the oldest row of each old per-recipient set.
DELETE FROM "recipient_summaries" a USING "recipient_summaries" b WHERE a."signature_request_id" = b."signature_request_id" AND a."id" > b."id";--> statement-breakpoint
ALTER TABLE "recipient_summaries" ADD CONSTRAINT "recipient_summaries_signature_request_id_unique" UNIQUE("signature_request_id");--> statement-breakpoint
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_email_normalized" CHECK ("recipients"."email" is null or "recipients"."email" = lower(trim("recipients"."email")));