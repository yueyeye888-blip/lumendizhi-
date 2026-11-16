CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`resource_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resource_ownership` (
	`resource_id` text PRIMARY KEY NOT NULL,
	`supplier` text DEFAULT 'eSIMAccess' NOT NULL,
	`order_no` text,
	`owner_user_id` text NOT NULL,
	`owner_email` text NOT NULL,
	`owner_name` text,
	`group_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
