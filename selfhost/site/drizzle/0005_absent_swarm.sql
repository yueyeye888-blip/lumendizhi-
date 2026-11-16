CREATE TABLE `sample_document_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`request_no` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`user_name` text NOT NULL,
	`document_type` text NOT NULL,
	`country` text NOT NULL,
	`subject_name` text NOT NULL,
	`address_line` text NOT NULL,
	`purpose` text NOT NULL,
	`recipient_email` text NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	`email_status` text DEFAULT 'pending' NOT NULL,
	`email_provider_id` text,
	`email_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
