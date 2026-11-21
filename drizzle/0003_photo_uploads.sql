ALTER TABLE "report_images" ALTER COLUMN "report_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_images" ADD COLUMN "uploaded_by" text;--> statement-breakpoint
ALTER TABLE "report_images" ADD CONSTRAINT "report_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;