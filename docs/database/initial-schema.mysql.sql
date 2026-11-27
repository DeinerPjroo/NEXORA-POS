-- Nexora POS: DDL de modelado para MySQL Workbench; generado desde las migraciones.
-- Runtime: instalar con php artisan migrate --seed, no importar este archivo en una base operativa.

create table `users` (`id` bigint unsigned not null auto_increment primary key, `name` varchar(255) not null, `email` varchar(255) not null, `email_verified_at` timestamp null, `password` varchar(255) not null, `remember_token` varchar(100) null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `users` add unique `users_email_unique`(`email`);

create table `password_reset_tokens` (`email` varchar(255) not null, `token` varchar(255) not null, `created_at` timestamp null, primary key (`email`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

create table `sessions` (`id` varchar(255) not null, `user_id` bigint unsigned null, `ip_address` varchar(45) null, `user_agent` text null, `payload` longtext not null, `last_activity` int not null, primary key (`id`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `sessions` add index `sessions_user_id_index`(`user_id`);

alter table `sessions` add index `sessions_last_activity_index`(`last_activity`);

create table `cache` (`key` varchar(255) not null, `value` mediumtext not null, `expiration` bigint not null, primary key (`key`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `cache` add index `cache_expiration_index`(`expiration`);

create table `cache_locks` (`key` varchar(255) not null, `owner` varchar(255) not null, `expiration` bigint not null, primary key (`key`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `cache_locks` add index `cache_locks_expiration_index`(`expiration`);

create table `jobs` (`id` bigint unsigned not null auto_increment primary key, `queue` varchar(255) not null, `payload` longtext not null, `attempts` tinyint unsigned not null, `reserved_at` int unsigned null, `available_at` int unsigned not null, `created_at` int unsigned not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `jobs` add index `jobs_queue_index`(`queue`);

create table `job_batches` (`id` varchar(255) not null, `name` varchar(255) not null, `total_jobs` int not null, `pending_jobs` int not null, `failed_jobs` int not null, `failed_job_ids` longtext not null, `options` mediumtext null, `cancelled_at` int null, `created_at` int not null, `finished_at` int null, primary key (`id`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

create table `failed_jobs` (`id` bigint unsigned not null auto_increment primary key, `uuid` varchar(255) not null, `connection` text not null, `queue` text not null, `payload` longtext not null, `exception` longtext not null, `failed_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `failed_jobs` add unique `failed_jobs_uuid_unique`(`uuid`);

create table `tenants` (`id` bigint unsigned not null auto_increment primary key, `public_id` char(36) not null, `name` varchar(120) not null, `business_type` varchar(40) not null, `status` varchar(20) not null default 'active', `currency` varchar(3) not null default 'COP', `timezone` varchar(64) not null default 'America/Bogota', `locale` varchar(10) not null default 'es-CO', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `tenants` add unique `tenants_public_id_unique`(`public_id`);

alter table `tenants` add index `tenants_status_index`(`status`);

create table `permissions` (`id` bigint unsigned not null auto_increment primary key, `key` varchar(80) not null, `name` varchar(100) not null, `group` varchar(50) not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `permissions` add unique `permissions_key_unique`(`key`);

create table `roles` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `name` varchar(80) not null, `is_owner` tinyint(1) not null default '0', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `roles` add constraint `roles_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `roles` add unique `roles_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `roles` add unique `roles_tenant_id_name_unique`(`tenant_id`, `name`);

create table `role_permission` (`tenant_id` bigint unsigned not null, `role_id` bigint unsigned not null, `permission_id` bigint unsigned not null, primary key (`role_id`, `permission_id`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `role_permission` add constraint `role_permission_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `role_permission` add constraint `role_permission_permission_id_foreign` foreign key (`permission_id`) references `permissions` (`id`) on delete restrict;

alter table `role_permission` add constraint `role_permission_tenant_id_role_id_foreign` foreign key (`tenant_id`, `role_id`) references `roles` (`tenant_id`, `id`) on delete restrict;

alter table `users` add `tenant_id` bigint unsigned not null;

alter table `users` add constraint `users_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `users` add `role_id` bigint unsigned not null;

alter table `users` add `is_active` tinyint(1) not null default '1';

alter table `users` add unique `users_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `users` add constraint `users_tenant_id_role_id_foreign` foreign key (`tenant_id`, `role_id`) references `roles` (`tenant_id`, `id`) on delete restrict;

create table `branches` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `name` varchar(100) not null, `code` varchar(20) not null, `address` varchar(200) null, `city` varchar(80) null, `phone` varchar(30) null, `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `branches` add constraint `branches_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `branches` add unique `branches_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `branches` add unique `branches_tenant_id_code_unique`(`tenant_id`, `code`);

alter table `branches` add index `branches_tenant_id_is_active_index`(`tenant_id`, `is_active`);

create table `workspace_settings` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `revision` int unsigned not null default '1', `theme` json not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `workspace_settings` add constraint `workspace_settings_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `workspace_settings` add unique `workspace_settings_tenant_id_unique`(`tenant_id`);

create table `theme_versions` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `version` int unsigned not null, `schema_version` int unsigned not null default '1', `theme` json not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `theme_versions` add constraint `theme_versions_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `theme_versions` add unique `theme_versions_tenant_id_version_unique`(`tenant_id`, `version`);

create table `audit_logs` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `actor_id` bigint unsigned null, `action` varchar(80) not null, `description` varchar(255) not null, `ip_address` varchar(45) null, `metadata` json null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `audit_logs` add constraint `audit_logs_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `audit_logs` add constraint `audit_logs_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `audit_logs` add index `audit_logs_tenant_id_created_at_index`(`tenant_id`, `created_at`);

create table `categories` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `name` varchar(100) not null, `description` varchar(500) null, `color` varchar(7) not null default '#8271FF', `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `categories` add constraint `categories_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `categories` add unique `categories_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `categories` add unique `categories_tenant_id_name_unique`(`tenant_id`, `name`);

create table `products` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `category_id` bigint unsigned not null, `name` varchar(150) not null, `sku` varchar(40) not null, `barcode` varchar(64) null, `description` text null, `sale_price` decimal(19, 4) not null, `cost_price` decimal(19, 4) not null default '0', `is_active` tinyint(1) not null default '1', `is_available` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `products` add constraint `products_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `products` add unique `products_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `products` add unique `products_tenant_id_sku_unique`(`tenant_id`, `sku`);

alter table `products` add unique `products_tenant_id_barcode_unique`(`tenant_id`, `barcode`);

alter table `products` add index `products_tenant_id_category_id_is_active_index`(`tenant_id`, `category_id`, `is_active`);

alter table `products` add index `products_tenant_id_name_index`(`tenant_id`, `name`);

alter table `products` add constraint `products_tenant_id_category_id_foreign` foreign key (`tenant_id`, `category_id`) references `categories` (`tenant_id`, `id`) on delete restrict;

alter table `products` add `image_path` varchar(255) null;

alter table `products` add `image_mime` varchar(30) null;

create table `product_variants` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `name` varchar(80) not null, `sku` varchar(40) not null, `barcode` varchar(64) null, `sale_price` decimal(19, 4) not null, `cost_price` decimal(19, 4) not null default '0', `is_active` tinyint(1) not null default '1', `is_available` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_variants` add constraint `product_variants_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_variants` add unique `product_variants_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `product_variants` add unique `product_variants_tenant_id_sku_unique`(`tenant_id`, `sku`);

alter table `product_variants` add unique `product_variants_tenant_id_barcode_unique`(`tenant_id`, `barcode`);

alter table `product_variants` add unique `product_variants_tenant_id_product_id_name_unique`(`tenant_id`, `product_id`, `name`);

alter table `product_variants` add index `product_variants_tenant_id_product_id_is_active_index`(`tenant_id`, `product_id`, `is_active`);

alter table `product_variants` add constraint `product_variants_tenant_id_product_id_foreign` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_variants` add unique `variants_product_identity`(`tenant_id`, `product_id`, `id`);

create table `cash_registers` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `name` varchar(80) not null, `code` varchar(20) not null, `is_active` tinyint(1) not null default '1', `active_session_id` bigint unsigned null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `cash_registers` add constraint `cash_registers_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `cash_registers` add unique `cash_registers_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `cash_registers` add unique `cash_registers_tenant_id_branch_id_id_unique`(`tenant_id`, `branch_id`, `id`);

alter table `cash_registers` add unique `cash_registers_tenant_id_branch_id_code_unique`(`tenant_id`, `branch_id`, `code`);

alter table `cash_registers` add constraint `cash_registers_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

create table `cash_sessions` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `cash_register_id` bigint unsigned not null, `opened_by` bigint unsigned not null, `closed_by` bigint unsigned null, `currency` varchar(3) not null, `status` varchar(20) not null default 'open', `opening_amount` decimal(19, 4) not null, `expected_amount` decimal(19, 4) not null, `counted_amount` decimal(19, 4) null, `difference` decimal(19, 4) null, `closing_note` varchar(500) null, `revision` int unsigned not null default '1', `opened_at` timestamp not null, `closed_at` timestamp null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `cash_sessions` add constraint `cash_sessions_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `cash_sessions` add unique `cash_sessions_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `cash_sessions` add unique `cash_sessions_register_identity`(`tenant_id`, `cash_register_id`, `id`);

alter table `cash_sessions` add index `cash_sessions_tenant_id_branch_id_status_index`(`tenant_id`, `branch_id`, `status`);

alter table `cash_sessions` add constraint `cash_sessions_branch_register_fk` foreign key (`tenant_id`, `branch_id`, `cash_register_id`) references `cash_registers` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `cash_sessions` add constraint `cash_sessions_tenant_id_opened_by_foreign` foreign key (`tenant_id`, `opened_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `cash_sessions` add constraint `cash_sessions_tenant_id_closed_by_foreign` foreign key (`tenant_id`, `closed_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `cash_registers` add constraint `cash_register_active_session_fk` foreign key (`tenant_id`, `id`, `active_session_id`) references `cash_sessions` (`tenant_id`, `cash_register_id`, `id`) on delete restrict;

create table `cash_movements` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `cash_session_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `type` varchar(20) not null, `amount` decimal(19, 4) not null, `reason` varchar(300) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `cash_movements` add constraint `cash_movements_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `cash_movements` add unique `cash_movements_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `cash_movements` add constraint `cash_movements_tenant_id_cash_session_id_foreign` foreign key (`tenant_id`, `cash_session_id`) references `cash_sessions` (`tenant_id`, `id`) on delete restrict;

alter table `cash_movements` add constraint `cash_movements_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `cash_movements` add index `cash_movements_tenant_id_cash_session_id_id_index`(`tenant_id`, `cash_session_id`, `id`);

create table `orders` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `public_id` char(36) not null, `branch_id` bigint unsigned not null, `created_by` bigint unsigned not null, `channel` varchar(20) not null, `reference` varchar(80) null, `customer_name` varchar(100) null, `notes` text null, `currency` varchar(3) not null, `subtotal` decimal(19, 4) not null, `status` varchar(20) not null default 'open', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `orders` add constraint `orders_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `orders` add unique `orders_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `orders` add index `orders_tenant_id_branch_id_status_id_index`(`tenant_id`, `branch_id`, `status`, `id`);

alter table `orders` add constraint `orders_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `orders` add constraint `orders_tenant_id_created_by_foreign` foreign key (`tenant_id`, `created_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `orders` add unique `orders_public_id_unique`(`public_id`);

create table `order_items` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `product_id` bigint unsigned not null, `variant_id` bigint unsigned null, `product_name` varchar(150) not null, `variant_name` varchar(80) null, `sku` varchar(40) not null, `quantity` int unsigned not null, `unit_price` decimal(19, 4) not null, `line_subtotal` decimal(19, 4) not null, `notes` varchar(300) null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `order_items` add constraint `order_items_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `order_items` add constraint `order_items_tenant_id_order_id_foreign` foreign key (`tenant_id`, `order_id`) references `orders` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add constraint `order_items_tenant_id_product_id_foreign` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add constraint `order_items_product_variant_fk` foreign key (`tenant_id`, `product_id`, `variant_id`) references `product_variants` (`tenant_id`, `product_id`, `id`) on delete restrict;

create table `order_events` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `from_status` varchar(20) null, `to_status` varchar(20) not null, `reason` varchar(300) null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `order_events` add constraint `order_events_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `order_events` add constraint `order_events_tenant_id_order_id_foreign` foreign key (`tenant_id`, `order_id`) references `orders` (`tenant_id`, `id`) on delete restrict;

alter table `order_events` add constraint `order_events_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `idempotency_records` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `key` char(36) not null, `actor_id` bigint unsigned not null, `action` varchar(60) not null, `request_hash` char(64) not null, `resource_type` varchar(100) not null, `resource_id` bigint unsigned not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `idempotency_records` add constraint `idempotency_records_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `idempotency_records` add unique `idempotency_records_tenant_id_key_unique`(`tenant_id`, `key`);

alter table `idempotency_records` add constraint `idempotency_records_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `orders` add unique `orders_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `cash_sessions` add unique `sessions_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `cash_movements` add unique `movements_session_identity`(`tenant_id`, `cash_session_id`, `id`);

create table `sales_settings` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `configured` tinyint(1) not null default '0', `tax_mode` varchar(20) not null default 'none', `tax_name` varchar(40) not null default 'Impuesto adicional', `tax_rate` decimal(7, 4) not null default '0', `revision` int unsigned not null default '1', `next_receipt_number` bigint unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `sales_settings` add constraint `sales_settings_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `sales_settings` add unique `sales_settings_tenant_id_unique`(`tenant_id`);

create table `sales` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `order_id` bigint unsigned not null, `created_by` bigint unsigned not null, `receipt_number` bigint unsigned not null, `status` varchar(20) not null default 'paid', `currency` varchar(3) not null, `business_name` varchar(120) not null, `branch_name` varchar(120) not null, `branch_address` varchar(255) null, `tax_mode` varchar(20) not null, `tax_name` varchar(40) not null, `tax_rate` decimal(7, 4) not null, `catalog_subtotal` decimal(19, 4) not null, `subtotal` decimal(19, 4) not null, `discount_amount` decimal(19, 4) not null, `taxable_base` decimal(19, 4) not null, `tax_amount` decimal(19, 4) not null, `total` decimal(19, 4) not null, `rounding_adjustment` decimal(19, 4) not null, `discount_reason` varchar(200) null, `settings_revision` int unsigned not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `sales` add constraint `sales_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `sales` add unique `sales_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `sales` add unique `sales_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `sales` add unique `sales_tenant_id_order_id_unique`(`tenant_id`, `order_id`);

alter table `sales` add unique `sales_tenant_id_receipt_number_unique`(`tenant_id`, `receipt_number`);

alter table `sales` add index `sales_tenant_id_branch_id_created_at_index`(`tenant_id`, `branch_id`, `created_at`);

alter table `sales` add constraint `sales_order_branch_fk` foreign key (`tenant_id`, `branch_id`, `order_id`) references `orders` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `sales` add constraint `sales_tenant_id_created_by_foreign` foreign key (`tenant_id`, `created_by`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `payments` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `sale_id` bigint unsigned not null, `cash_session_id` bigint unsigned not null, `cash_movement_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `amount` decimal(19, 4) not null, `method` varchar(20) not null default 'cash', `received_amount` decimal(19, 4) not null, `change_amount` decimal(19, 4) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `payments` add constraint `payments_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `payments` add unique `payments_tenant_id_sale_id_unique`(`tenant_id`, `sale_id`);

alter table `payments` add unique `payments_tenant_id_cash_movement_id_unique`(`tenant_id`, `cash_movement_id`);

alter table `payments` add constraint `payments_sale_fk` foreign key (`tenant_id`, `branch_id`, `sale_id`) references `sales` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `payments` add constraint `payments_session_fk` foreign key (`tenant_id`, `branch_id`, `cash_session_id`) references `cash_sessions` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `payments` add constraint `payments_movement_fk` foreign key (`tenant_id`, `cash_session_id`, `cash_movement_id`) references `cash_movements` (`tenant_id`, `cash_session_id`, `id`) on delete restrict;

alter table `payments` add constraint `payments_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `sale_refunds` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `sale_id` bigint unsigned not null, `cash_session_id` bigint unsigned not null, `cash_movement_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `amount` decimal(19, 4) not null, `reason` varchar(300) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `sale_refunds` add constraint `sale_refunds_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `sale_refunds` add unique `sale_refunds_tenant_id_sale_id_unique`(`tenant_id`, `sale_id`);

alter table `sale_refunds` add unique `sale_refunds_tenant_id_cash_movement_id_unique`(`tenant_id`, `cash_movement_id`);

alter table `sale_refunds` add constraint `sale_refunds_sale_fk` foreign key (`tenant_id`, `branch_id`, `sale_id`) references `sales` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `sale_refunds` add constraint `sale_refunds_session_fk` foreign key (`tenant_id`, `branch_id`, `cash_session_id`) references `cash_sessions` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `sale_refunds` add constraint `sale_refunds_movement_fk` foreign key (`tenant_id`, `cash_session_id`, `cash_movement_id`) references `cash_movements` (`tenant_id`, `cash_session_id`, `id`) on delete restrict;

alter table `sale_refunds` add constraint `sale_refunds_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `payment_methods` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `code` varchar(20) not null, `name` varchar(60) not null, `kind` varchar(20) not null, `is_active` tinyint(1) not null default '1', `is_system` tinyint(1) not null default '0', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `payment_methods` add constraint `payment_methods_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `payment_methods` add unique `payment_methods_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `payment_methods` add unique `payment_methods_tenant_id_code_unique`(`tenant_id`, `code`);

alter table `payment_methods` add unique `payment_methods_tenant_id_name_unique`(`tenant_id`, `name`);

alter table `payments` add `payment_method_id` bigint unsigned null;

alter table `payments` add `method_name` varchar(60) not null default 'Efectivo';

alter table `payments` add `method_kind` varchar(20) not null default 'cash';

alter table `payments` add `method_revision` int unsigned null;

alter table `payments` add `provenance` varchar(20) not null default 'operator';

alter table `payments` add `reference` varchar(120) null;

alter table `payments` add constraint `payments_method_fk` foreign key (`tenant_id`, `payment_method_id`) references `payment_methods` (`tenant_id`, `id`) on delete restrict;

alter table `payments` drop foreign key `payments_movement_fk`;

alter table `payments` modify `cash_movement_id` bigint unsigned null;

alter table `payments` add constraint `payments_movement_fk` foreign key (`tenant_id`, `cash_session_id`, `cash_movement_id`) references `cash_movements` (`tenant_id`, `cash_session_id`, `id`) on delete restrict;

alter table `sale_refunds` drop foreign key `sale_refunds_movement_fk`;

alter table `sale_refunds` modify `cash_movement_id` bigint unsigned null;

alter table `sale_refunds` add constraint `sale_refunds_movement_fk` foreign key (`tenant_id`, `cash_session_id`, `cash_movement_id`) references `cash_movements` (`tenant_id`, `cash_session_id`, `id`) on delete restrict;

alter table `sale_refunds` add `reference` varchar(120) null;

alter table `sales` add `revision` int unsigned not null default '1';

alter table `payments` add unique `payments_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `payments` add unique `payments_sale_identity`(`tenant_id`, `sale_id`, `id`);

alter table `sale_refunds` add `payment_id` bigint unsigned null;

alter table `sale_refunds` modify `payment_id` bigint unsigned not null;

alter table `sale_refunds` add unique `sale_refunds_tenant_id_payment_id_unique`(`tenant_id`, `payment_id`);

alter table `sale_refunds` add constraint `refunds_original_payment_fk` foreign key (`tenant_id`, `sale_id`, `payment_id`) references `payments` (`tenant_id`, `sale_id`, `id`) on delete restrict;

alter table `payments` add index `payments_sale_lookup`(`tenant_id`, `sale_id`);

alter table `sale_refunds` add index `refunds_sale_lookup`(`tenant_id`, `sale_id`);

alter table `payments` drop index `payments_tenant_id_sale_id_unique`;

alter table `sale_refunds` drop index `sale_refunds_tenant_id_sale_id_unique`;

alter table `sales_settings` add `tip_enabled` tinyint(1) not null default '0';

alter table `sales_settings` add `tip_tax_mode` varchar(20) null;

alter table `sales` add `discount_type` varchar(20) not null default 'fixed';

alter table `sales` add `discount_value` decimal(19, 4) not null default '0';

alter table `sales` add `tip_amount` decimal(19, 4) not null default '0';

alter table `sales` add `tip_confirmed` tinyint(1) not null default '0';

alter table `sales` add `tip_tax_mode` varchar(20) not null default 'disabled';

alter table `sale_refunds` add index `refunds_payment_lookup`(`tenant_id`, `payment_id`);

alter table `sale_refunds` drop index `sale_refunds_tenant_id_payment_id_unique`;

create table `sale_accounts` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `sale_id` bigint unsigned not null, `number` tinyint unsigned not null, `label` varchar(40) not null, `amount` decimal(19, 4) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `sale_accounts` add constraint `sale_accounts_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `sale_accounts` add unique `accounts_sale_identity`(`tenant_id`, `sale_id`, `id`);

alter table `sale_accounts` add unique `accounts_sale_number`(`tenant_id`, `sale_id`, `number`);

alter table `sale_accounts` add constraint `accounts_sale_fk` foreign key (`tenant_id`, `sale_id`) references `sales` (`tenant_id`, `id`) on delete restrict;

alter table `payments` add `account_id` bigint unsigned null;

alter table `payments` add constraint `payments_account_fk` foreign key (`tenant_id`, `sale_id`, `account_id`) references `sale_accounts` (`tenant_id`, `sale_id`, `id`) on delete restrict;

alter table `sales` add `calculation_version` smallint unsigned not null default '1';

create table `tax_profiles` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `name` varchar(60) not null, `price_mode` varchar(20) not null, `rates` json not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `tax_profiles` add constraint `tax_profiles_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `tax_profiles` add unique `tax_profiles_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `tax_profiles` add unique `tax_profiles_tenant_id_name_unique`(`tenant_id`, `name`);

alter table `products` add `tax_profile_id` bigint unsigned null;

alter table `products` add constraint `products_tax_profile_fk` foreign key (`tenant_id`, `tax_profile_id`) references `tax_profiles` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add `tax_snapshot` json null;

alter table `sales_settings` add `tip_tax_snapshot` json null;

alter table `sales` add `tax_breakdown` json null;

alter table `payments` add index `payments_history_company_idx`(`tenant_id`, `created_at`, `id`);

alter table `payments` add index `payments_history_branch_idx`(`tenant_id`, `branch_id`, `created_at`, `id`);

create table `payment_reviews` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `sale_id` bigint unsigned not null, `payment_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `actor_name` varchar(120) not null, `version` int unsigned not null, `sale_revision` int unsigned not null, `currency` char(3) not null, `status` varchar(20) not null, `expected_net_amount` decimal(19, 4) not null, `observed_amount` decimal(19, 4) null, `difference_amount` decimal(19, 4) null, `reference` varchar(120) null, `notes` varchar(300) null, `review_confirmed` tinyint(1) not null, `provenance` varchar(30) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `payment_reviews` add constraint `payment_reviews_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `payment_reviews` add unique `payment_reviews_tenant_id_payment_id_version_unique`(`tenant_id`, `payment_id`, `version`);

alter table `payment_reviews` add index `payment_reviews_tenant_id_payment_id_id_index`(`tenant_id`, `payment_id`, `id`);

alter table `payment_reviews` add constraint `payment_reviews_payment_fk` foreign key (`tenant_id`, `sale_id`, `payment_id`) references `payments` (`tenant_id`, `sale_id`, `id`) on delete restrict;

alter table `payment_reviews` add constraint `payment_reviews_sale_fk` foreign key (`tenant_id`, `branch_id`, `sale_id`) references `sales` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `payment_reviews` add constraint `payment_reviews_actor_fk` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `categories` add `parent_id` bigint unsigned null;

alter table `categories` add constraint `categories_parent_fk` foreign key (`tenant_id`, `parent_id`) references `categories` (`tenant_id`, `id`) on delete restrict;

alter table `categories` add index `categories_tenant_id_parent_id_name_index`(`tenant_id`, `parent_id`, `name`);

create table `product_modifier_groups` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `name` varchar(80) not null, `kind` varchar(20) not null, `min_select` tinyint unsigned not null, `max_select` tinyint unsigned not null, `is_active` tinyint(1) not null default '1', `position` smallint unsigned not null default '0', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_modifier_groups` add constraint `product_modifier_groups_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_modifier_groups` add unique `modifier_groups_product_identity`(`tenant_id`, `product_id`, `id`);

alter table `product_modifier_groups` add unique `modifier_groups_product_name`(`tenant_id`, `product_id`, `name`);

alter table `product_modifier_groups` add index `modifier_groups_menu_idx`(`tenant_id`, `product_id`, `is_active`, `position`);

alter table `product_modifier_groups` add constraint `modifier_groups_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

create table `product_modifier_options` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `modifier_group_id` bigint unsigned not null, `name` varchar(80) not null, `extra_price` decimal(19, 4) not null, `is_active` tinyint(1) not null default '1', `position` smallint unsigned not null default '0', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_modifier_options` add constraint `product_modifier_options_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_modifier_options` add unique `modifier_options_group_name`(`tenant_id`, `modifier_group_id`, `name`);

alter table `product_modifier_options` add index `modifier_options_menu_idx`(`tenant_id`, `modifier_group_id`, `is_active`, `position`);

alter table `product_modifier_options` add constraint `modifier_options_group_fk` foreign key (`tenant_id`, `product_id`, `modifier_group_id`) references `product_modifier_groups` (`tenant_id`, `product_id`, `id`) on delete restrict;

alter table `order_items` add `base_unit_price` decimal(19, 4) null;

alter table `order_items` add `modifiers_snapshot` json null;

create table `product_context_prices` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `variant_id` bigint unsigned null, `branch_id` bigint unsigned null, `channel` varchar(20) not null, `amount` decimal(19, 4) not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `variant_scope` bigint unsigned as (coalesce(variant_id, 0)) stored, `branch_scope` bigint unsigned as (coalesce(branch_id, 0)) stored, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_context_prices` add constraint `product_context_prices_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_context_prices` add unique `context_prices_scope_unique`(`tenant_id`, `product_id`, `variant_scope`, `branch_scope`, `channel`);

alter table `product_context_prices` add constraint `context_prices_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_context_prices` add constraint `context_prices_variant_fk` foreign key (`tenant_id`, `product_id`, `variant_id`) references `product_variants` (`tenant_id`, `product_id`, `id`) on delete restrict;

alter table `product_context_prices` add constraint `context_prices_branch_fk` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add `price_snapshot` json null;

alter table `products` add `availability_schedule_enabled` tinyint(1) not null default '0';

create table `product_availability_windows` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `name` varchar(80) not null, `weekday` tinyint unsigned not null, `start_time` varchar(5) not null, `end_time` varchar(5) not null, `ends_next_day` tinyint(1) not null default '0', `valid_from` date null, `valid_until` date null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_availability_windows` add constraint `product_availability_windows_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_availability_windows` add constraint `availability_windows_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_availability_windows` add index `availability_windows_active_index`(`tenant_id`, `product_id`, `is_active`);

alter table `order_items` add `availability_snapshot` json null;

alter table `products` add `kind` varchar(12) not null default 'regular';

alter table `products` add `combo_allocation_mode` varchar(20) null;

create table `product_combo_components` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `component_product_id` bigint unsigned not null, `component_variant_id` bigint unsigned null, `units` tinyint unsigned not null default '1', `position` smallint unsigned not null default '0', `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_combo_components` add constraint `product_combo_components_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_combo_components` add index `combo_components_active_index`(`tenant_id`, `product_id`, `is_active`);

alter table `product_combo_components` add constraint `combo_components_root_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_combo_components` add constraint `combo_components_product_fk` foreign key (`tenant_id`, `component_product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_combo_components` add constraint `combo_components_variant_fk` foreign key (`tenant_id`, `component_product_id`, `component_variant_id`) references `product_variants` (`tenant_id`, `product_id`, `id`) on delete restrict;

create table `order_combos` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `product_id` bigint unsigned not null, `product_name` varchar(150) not null, `sku` varchar(40) not null, `quantity` int unsigned not null, `unit_price` decimal(19, 4) not null, `line_subtotal` decimal(19, 4) not null, `notes` varchar(300) null, `snapshot` json not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `order_combos` add constraint `order_combos_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `order_combos` add unique `order_combos_order_identity`(`tenant_id`, `order_id`, `id`);

alter table `order_combos` add constraint `order_combos_order_fk` foreign key (`tenant_id`, `order_id`) references `orders` (`tenant_id`, `id`) on delete restrict;

alter table `order_combos` add constraint `order_combos_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add `order_combo_id` bigint unsigned null;

alter table `order_items` add `combo_position` tinyint unsigned null;

alter table `order_items` add constraint `order_items_combo_fk` foreign key (`tenant_id`, `order_id`, `order_combo_id`) references `order_combos` (`tenant_id`, `order_id`, `id`) on delete restrict;

create table `product_combo_groups` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `name` varchar(80) not null, `min_select` tinyint unsigned not null default '0', `max_select` tinyint unsigned not null default '1', `position` smallint unsigned not null default '0', `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_combo_groups` add constraint `product_combo_groups_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_combo_groups` add unique `combo_groups_root_identity`(`tenant_id`, `product_id`, `id`);

alter table `product_combo_groups` add constraint `combo_groups_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_combo_components` add `combo_group_id` bigint unsigned null;

alter table `product_combo_components` add constraint `combo_components_group_fk` foreign key (`tenant_id`, `product_id`, `combo_group_id`) references `product_combo_groups` (`tenant_id`, `product_id`, `id`) on delete restrict;

create table `product_promotions` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `variant_id` bigint unsigned null, `branch_id` bigint unsigned null, `channel` varchar(20) not null, `name` varchar(80) not null, `discount_type` varchar(12) not null, `discount_value` decimal(19, 4) not null, `priority` smallint unsigned not null default '0', `valid_from` varchar(10) null, `valid_until` varchar(10) null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_promotions` add constraint `product_promotions_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_promotions` add index `promotions_active_product`(`tenant_id`, `product_id`, `is_active`);

alter table `product_promotions` add constraint `promotions_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_promotions` add constraint `promotions_variant_fk` foreign key (`tenant_id`, `product_id`, `variant_id`) references `product_variants` (`tenant_id`, `product_id`, `id`) on delete restrict;

alter table `product_promotions` add constraint `promotions_branch_fk` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

create table `product_images` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `product_id` bigint unsigned not null, `path` varchar(255) not null, `mime` varchar(30) not null, `position` tinyint unsigned not null default '0', `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `product_images` add constraint `product_images_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `product_images` add unique `product_images_identity`(`tenant_id`, `product_id`, `id`);

alter table `product_images` add constraint `product_images_product_fk` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

alter table `product_images` add index `product_images_order`(`tenant_id`, `product_id`, `is_active`, `position`);

alter table `products` add `cover_image_id` bigint unsigned null;

alter table `products` add constraint `products_cover_image_fk` foreign key (`tenant_id`, `id`, `cover_image_id`) references `product_images` (`tenant_id`, `product_id`, `id`) on delete restrict;

create table `dining_rooms` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `name` varchar(80) not null, `color` varchar(7) not null default '#F5F7FB', `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `layout_schema_version` tinyint unsigned not null default '1', `objects` json null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_rooms` add constraint `dining_rooms_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_rooms` add unique `dining_rooms_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `dining_rooms` add unique `dining_rooms_name_unique`(`tenant_id`, `branch_id`, `name`);

alter table `dining_rooms` add constraint `dining_rooms_branch_fk` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

create table `dining_tables` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `dining_room_id` bigint unsigned not null, `name` varchar(50) not null, `shape` varchar(12) not null, `color` varchar(7) not null, `capacity` tinyint unsigned not null, `x` smallint unsigned not null, `y` smallint unsigned not null, `width` smallint unsigned not null, `height` smallint unsigned not null, `rotation` smallint unsigned not null default '0', `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_tables` add constraint `dining_tables_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_tables` add unique `dining_tables_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `dining_tables` add unique `dining_tables_name_unique`(`tenant_id`, `dining_room_id`, `name`);

alter table `dining_tables` add constraint `dining_tables_room_fk` foreign key (`tenant_id`, `branch_id`, `dining_room_id`) references `dining_rooms` (`tenant_id`, `branch_id`, `id`) on delete restrict;

create table `dining_sessions` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `opened_by` bigint unsigned not null, `closed_by` bigint unsigned null, `waiter_id` bigint unsigned null, `guest_count` smallint unsigned not null, `notes` varchar(300) null, `status` varchar(12) not null default 'open', `revision` int unsigned not null default '1', `opened_at` timestamp not null, `closed_at` timestamp null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_sessions` add constraint `dining_sessions_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_sessions` add unique `dining_sessions_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `dining_sessions` add unique `dining_sessions_tenant_id_id_unique`(`tenant_id`, `id`);

alter table `dining_sessions` add index `dining_sessions_tenant_id_branch_id_status_id_index`(`tenant_id`, `branch_id`, `status`, `id`);

alter table `dining_sessions` add constraint `dining_sessions_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `dining_sessions` add constraint `dining_sessions_tenant_id_opened_by_foreign` foreign key (`tenant_id`, `opened_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `dining_sessions` add constraint `dining_sessions_tenant_id_closed_by_foreign` foreign key (`tenant_id`, `closed_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `dining_sessions` add constraint `dining_sessions_tenant_id_waiter_id_foreign` foreign key (`tenant_id`, `waiter_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `dining_session_tables` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `dining_session_id` bigint unsigned not null, `dining_table_id` bigint unsigned not null, `table_name` varchar(50) not null, `joined_at` timestamp not null, `released_at` timestamp null, `occupied_table` bigint unsigned as (CASE WHEN released_at IS NULL THEN dining_table_id ELSE NULL END) stored) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_session_tables` add constraint `dining_session_tables_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_session_tables` add unique `dining_active_table_unique`(`tenant_id`, `occupied_table`);

alter table `dining_session_tables` add index `dining_members_session_release_idx`(`tenant_id`, `dining_session_id`, `released_at`);

alter table `dining_session_tables` add constraint `dining_members_session_fk` foreign key (`tenant_id`, `branch_id`, `dining_session_id`) references `dining_sessions` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `dining_session_tables` add constraint `dining_members_table_fk` foreign key (`tenant_id`, `branch_id`, `dining_table_id`) references `dining_tables` (`tenant_id`, `branch_id`, `id`) on delete restrict;

create table `dining_events` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `dining_session_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `action` varchar(40) not null, `details` json not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_events` add constraint `dining_events_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_events` add index `dining_events_tenant_id_dining_session_id_id_index`(`tenant_id`, `dining_session_id`, `id`);

alter table `dining_events` add constraint `dining_events_tenant_id_dining_session_id_foreign` foreign key (`tenant_id`, `dining_session_id`) references `dining_sessions` (`tenant_id`, `id`) on delete restrict;

alter table `dining_events` add constraint `dining_events_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `orders` add `dining_session_id` bigint unsigned null;

alter table `orders` add `dining_snapshot` json null;

alter table `orders` add constraint `orders_dining_session_fk` foreign key (`tenant_id`, `branch_id`, `dining_session_id`) references `dining_sessions` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `orders` add index `orders_tenant_id_dining_session_id_id_index`(`tenant_id`, `dining_session_id`, `id`);

create table `dining_reservations` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `created_by` bigint unsigned not null, `dining_session_id` bigint unsigned null, `guest_name` varchar(100) not null, `phone` varchar(30) null, `guest_count` smallint unsigned not null, `notes` varchar(300) null, `status` varchar(12) not null default 'booked', `booking_timezone` varchar(64) not null, `starts_at` datetime not null, `ends_at` datetime not null, `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_reservations` add constraint `dining_reservations_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_reservations` add unique `dining_reservations_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `dining_reservations` add index `dining_reservations_calendar_idx`(`tenant_id`, `branch_id`, `status`, `starts_at`);

alter table `dining_reservations` add constraint `dining_reservations_branch_fk` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `dining_reservations` add constraint `dining_reservations_creator_fk` foreign key (`tenant_id`, `created_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `dining_reservations` add constraint `dining_reservations_session_fk` foreign key (`tenant_id`, `branch_id`, `dining_session_id`) references `dining_sessions` (`tenant_id`, `branch_id`, `id`) on delete restrict;

create table `dining_reservation_tables` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `dining_reservation_id` bigint unsigned not null, `dining_table_id` bigint unsigned not null, `table_name` varchar(50) not null, `is_active` tinyint(1) not null default '1', `created_at` timestamp null, `updated_at` timestamp null, `current_table` bigint unsigned as (CASE WHEN is_active = 1 THEN dining_table_id ELSE NULL END) stored) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `dining_reservation_tables` add constraint `dining_reservation_tables_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `dining_reservation_tables` add unique `dining_reservation_current_table_unique`(`tenant_id`, `dining_reservation_id`, `current_table`);

alter table `dining_reservation_tables` add index `dining_reservation_table_calendar_idx`(`tenant_id`, `dining_table_id`, `is_active`);

alter table `dining_reservation_tables` add constraint `dining_reservation_members_reservation_fk` foreign key (`tenant_id`, `branch_id`, `dining_reservation_id`) references `dining_reservations` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `dining_reservation_tables` add constraint `dining_reservation_members_table_fk` foreign key (`tenant_id`, `branch_id`, `dining_table_id`) references `dining_tables` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `users` add `pin_hash` varchar(255) null;

alter table `users` add `security_revision` int unsigned not null default '1';

create table `screen_locks` (`session_hash` varchar(64) not null, `tenant_id` bigint unsigned not null, `user_id` bigint unsigned not null, `challenge` char(36) not null, `created_at` datetime not null, primary key (`session_hash`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `screen_locks` add constraint `screen_locks_tenant_id_user_id_foreign` foreign key (`tenant_id`, `user_id`) references `users` (`tenant_id`, `id`) on delete cascade;

alter table `users` add `mfa_secret` text null;

alter table `users` add `mfa_recovery_hashes` text null;

alter table `users` add `mfa_enabled_at` datetime null;

alter table `users` add `mfa_last_step` bigint unsigned null;

alter table `users` add `mfa_version` int unsigned not null default '1';

alter table `users` add `mfa_pending_secret` text null;

alter table `users` add `mfa_pending_id` char(36) null;

alter table `users` add `mfa_pending_expires_at` datetime null;

create table `kitchen_stations` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `name` varchar(80) not null, `color` varchar(7) not null, `target_minutes` smallint unsigned not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_stations` add constraint `kitchen_stations_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_stations` add unique `kitchen_station_identity`(`tenant_id`, `branch_id`, `id`);

alter table `kitchen_stations` add unique `kitchen_station_name`(`tenant_id`, `branch_id`, `name`);

alter table `kitchen_stations` add constraint `kitchen_station_branch` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `orders` add unique `orders_kitchen_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `order_items` add unique `order_item_kitchen_identity`(`tenant_id`, `order_id`, `id`);

create table `kitchen_routes` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `product_id` bigint unsigned not null, `kitchen_station_id` bigint unsigned not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_routes` add constraint `kitchen_routes_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_routes` add unique `kroute_product_branch`(`tenant_id`, `branch_id`, `product_id`);

alter table `kitchen_routes` add constraint `kroute_station` foreign key (`tenant_id`, `branch_id`, `kitchen_station_id`) references `kitchen_stations` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `kitchen_routes` add constraint `kroute_product` foreign key (`tenant_id`, `product_id`) references `products` (`tenant_id`, `id`) on delete restrict;

create table `kitchen_dispatches` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `order_id` bigint unsigned not null, `created_by` bigint unsigned not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_dispatches` add constraint `kitchen_dispatches_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_dispatches` add unique `kdispatch_identity`(`tenant_id`, `order_id`, `id`);

alter table `kitchen_dispatches` add constraint `kdispatch_order` foreign key (`tenant_id`, `branch_id`, `order_id`) references `orders` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `kitchen_dispatches` add constraint `kdispatch_actor` foreign key (`tenant_id`, `created_by`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `kitchen_tickets` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `order_id` bigint unsigned not null, `kitchen_dispatch_id` bigint unsigned not null, `kitchen_station_id` bigint unsigned not null, `station_name` varchar(80) not null, `station_color` varchar(7) not null, `target_minutes` smallint unsigned not null, `order_snapshot` json not null, `status` varchar(20) not null default 'new', `revision` int unsigned not null default '1', `started_at` datetime null, `ready_at` datetime null, `delivered_at` datetime null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_tickets` add constraint `kitchen_tickets_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_tickets` add unique `kticket_identity`(`tenant_id`, `order_id`, `id`);

alter table `kitchen_tickets` add index `kticket_board`(`tenant_id`, `branch_id`, `status`, `id`);

alter table `kitchen_tickets` add constraint `kticket_station` foreign key (`tenant_id`, `branch_id`, `kitchen_station_id`) references `kitchen_stations` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `kitchen_tickets` add constraint `kticket_dispatch` foreign key (`tenant_id`, `order_id`, `kitchen_dispatch_id`) references `kitchen_dispatches` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `kitchen_tickets` add constraint `kticket_order_branch` foreign key (`tenant_id`, `branch_id`, `order_id`) references `orders` (`tenant_id`, `branch_id`, `id`) on delete restrict;

create table `kitchen_ticket_lines` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `kitchen_ticket_id` bigint unsigned not null, `order_item_id` bigint unsigned not null, `snapshot` json not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_ticket_lines` add constraint `kitchen_ticket_lines_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_ticket_lines` add unique `kline_sent_once`(`tenant_id`, `order_item_id`);

alter table `kitchen_ticket_lines` add constraint `kline_ticket` foreign key (`tenant_id`, `order_id`, `kitchen_ticket_id`) references `kitchen_tickets` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `kitchen_ticket_lines` add constraint `kline_order_item` foreign key (`tenant_id`, `order_id`, `order_item_id`) references `order_items` (`tenant_id`, `order_id`, `id`) on delete restrict;

create table `kitchen_ticket_events` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `kitchen_ticket_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `from_status` varchar(20) null, `to_status` varchar(20) not null, `reason` varchar(300) null, `created_at` datetime not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `kitchen_ticket_events` add constraint `kitchen_ticket_events_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `kitchen_ticket_events` add constraint `kevent_ticket` foreign key (`tenant_id`, `order_id`, `kitchen_ticket_id`) references `kitchen_tickets` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `kitchen_ticket_events` add constraint `kevent_actor` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `users` add `employee_revision` int unsigned not null default '1';

alter table `users` add `all_branches` tinyint(1) not null default '1';

alter table `roles` add `revision` int unsigned not null default '1';

create table `employee_branches` (`tenant_id` bigint unsigned not null, `user_id` bigint unsigned not null, `branch_id` bigint unsigned not null, primary key (`tenant_id`, `user_id`, `branch_id`)) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `employee_branches` add constraint `employee_branches_tenant_id_user_id_foreign` foreign key (`tenant_id`, `user_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `employee_branches` add constraint `employee_branches_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `order_items` add `preparation_destination` varchar(16) null;

create table `preparation_corrections` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `order_item_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `from_destination` varchar(16) not null, `to_destination` varchar(16) not null, `reason` varchar(300) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `preparation_corrections` add constraint `preparation_item_fk` foreign key (`tenant_id`, `order_id`, `order_item_id`) references `order_items` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `preparation_corrections` add constraint `preparation_corrections_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `order_deliveries` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `order_id` bigint unsigned not null, `courier_id` bigint unsigned null, `recipient_name` varchar(100) not null, `phone` varchar(30) not null, `address` varchar(300) not null, `instructions` varchar(300) null, `status` varchar(24) not null default 'pending', `revision` int unsigned not null default '1', `out_at` timestamp null, `delivered_at` timestamp null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `order_deliveries` add unique `order_deliveries_tenant_id_order_id_unique`(`tenant_id`, `order_id`);

alter table `order_deliveries` add unique `delivery_order_identity`(`tenant_id`, `order_id`, `id`);

alter table `order_deliveries` add constraint `delivery_order_fk` foreign key (`tenant_id`, `branch_id`, `order_id`) references `orders` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `order_deliveries` add constraint `order_deliveries_tenant_id_courier_id_foreign` foreign key (`tenant_id`, `courier_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `delivery_events` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `order_delivery_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `status` varchar(24) not null, `courier_id` bigint unsigned null, `reason` varchar(250) null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `delivery_events` add constraint `delivery_event_parent` foreign key (`tenant_id`, `order_id`, `order_delivery_id`) references `order_deliveries` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `delivery_events` add constraint `delivery_events_tenant_id_actor_id_foreign` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `delivery_events` add constraint `delivery_events_tenant_id_courier_id_foreign` foreign key (`tenant_id`, `courier_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `customers` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `name` varchar(100) not null, `phone` varchar(30) not null, `phone_digits` varchar(30) not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `customers` add unique `customer_branch_identity`(`tenant_id`, `branch_id`, `id`);

alter table `customers` add index `customers_tenant_id_branch_id_phone_digits_index`(`tenant_id`, `branch_id`, `phone_digits`);

alter table `customers` add constraint `customers_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

create table `customer_addresses` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `customer_id` bigint unsigned not null, `label` varchar(60) not null, `recipient_name` varchar(100) not null, `phone` varchar(30) not null, `address` varchar(300) not null, `neighborhood` varchar(100) null, `location_reference` varchar(300) null, `instructions` varchar(300) null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `customer_addresses` add unique `address_customer_identity`(`tenant_id`, `branch_id`, `customer_id`, `id`);

alter table `customer_addresses` add constraint `address_customer_fk` foreign key (`tenant_id`, `branch_id`, `customer_id`) references `customers` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `order_deliveries` add `customer_id` bigint unsigned null;

alter table `order_deliveries` add `customer_address_id` bigint unsigned null;

alter table `order_deliveries` add `neighborhood` varchar(100) null;

alter table `order_deliveries` add `location_reference` varchar(300) null;

alter table `order_deliveries` add `customer_snapshot` json null;

alter table `order_deliveries` add constraint `delivery_customer_fk` foreign key (`tenant_id`, `branch_id`, `customer_id`) references `customers` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `order_deliveries` add constraint `delivery_address_fk` foreign key (`tenant_id`, `branch_id`, `customer_id`, `customer_address_id`) references `customer_addresses` (`tenant_id`, `branch_id`, `customer_id`, `id`) on delete restrict;

create table `delivery_policies` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `currency` varchar(3) not null, `is_enabled` tinyint(1) not null default '0', `default_fee` decimal(19, 4) not null default '0', `free_from` decimal(19, 4) null, `tax_profile_id` bigint unsigned null, `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `delivery_policies` add unique `delivery_policies_tenant_id_branch_id_unique`(`tenant_id`, `branch_id`);

alter table `delivery_policies` add unique `delivery_policy_identity`(`tenant_id`, `branch_id`, `id`);

alter table `delivery_policies` add constraint `delivery_policies_tenant_id_branch_id_foreign` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `delivery_policies` add constraint `delivery_policies_tenant_id_tax_profile_id_foreign` foreign key (`tenant_id`, `tax_profile_id`) references `tax_profiles` (`tenant_id`, `id`) on delete restrict;

create table `delivery_zones` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `branch_id` bigint unsigned not null, `delivery_policy_id` bigint unsigned not null, `name` varchar(100) not null, `fee` decimal(19, 4) not null, `is_active` tinyint(1) not null default '1', `revision` int unsigned not null default '1', `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `delivery_zones` add unique `delivery_zone_name`(`tenant_id`, `delivery_policy_id`, `name`);

alter table `delivery_zones` add unique `delivery_zone_identity`(`tenant_id`, `branch_id`, `delivery_policy_id`, `id`);

alter table `delivery_zones` add constraint `delivery_zone_policy_fk` foreign key (`tenant_id`, `branch_id`, `delivery_policy_id`) references `delivery_policies` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `order_deliveries` add `delivery_policy_id` bigint unsigned null;

alter table `order_deliveries` add `delivery_zone_id` bigint unsigned null;

alter table `order_deliveries` add `fee_snapshot` json null;

alter table `order_deliveries` add `fee_total` decimal(19, 4) not null default '0';

alter table `order_deliveries` add constraint `delivery_policy_order_fk` foreign key (`tenant_id`, `branch_id`, `delivery_policy_id`) references `delivery_policies` (`tenant_id`, `branch_id`, `id`) on delete restrict;

alter table `order_deliveries` add constraint `delivery_zone_order_fk` foreign key (`tenant_id`, `branch_id`, `delivery_policy_id`, `delivery_zone_id`) references `delivery_zones` (`tenant_id`, `branch_id`, `delivery_policy_id`, `id`) on delete restrict;

alter table `sales` add `delivery_charge` json null;

alter table `sales` add `delivery_fee_total` decimal(19, 4) not null default '0';

create table `order_item_changes` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `order_id` bigint unsigned not null, `order_item_id` bigint unsigned not null, `replacement_item_id` bigint unsigned null, `actor_id` bigint unsigned not null, `reason` varchar(300) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `order_item_changes` add constraint `order_item_changes_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `order_item_changes` add unique `ochange_original_once`(`tenant_id`, `order_item_id`);

alter table `order_item_changes` add index `ochange_recent`(`tenant_id`, `created_at`);

alter table `order_item_changes` add constraint `ochange_original_fk` foreign key (`tenant_id`, `order_id`, `order_item_id`) references `order_items` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `order_item_changes` add constraint `ochange_replacement_fk` foreign key (`tenant_id`, `order_id`, `replacement_item_id`) references `order_items` (`tenant_id`, `order_id`, `id`) on delete restrict;

alter table `order_item_changes` add constraint `ochange_actor_fk` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

create table `studio_layouts` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `surface` varchar(30) not null, `device` varchar(20) not null default 'adaptive', `branch_id` bigint unsigned null, `role_id` bigint unsigned null, `revision` int unsigned not null default '1', `draft` json not null, `published` json null, `published_revision` int unsigned null, `updated_by` bigint unsigned not null, `published_by` bigint unsigned null, `published_at` timestamp null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `studio_layouts` add constraint `studio_layouts_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `studio_layouts` add unique `studio_surface_identity`(`tenant_id`, `surface`);

alter table `studio_layouts` add constraint `studio_branch_fk` foreign key (`tenant_id`, `branch_id`) references `branches` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layouts` add constraint `studio_role_fk` foreign key (`tenant_id`, `role_id`) references `roles` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layouts` add constraint `studio_editor_fk` foreign key (`tenant_id`, `updated_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layouts` add constraint `studio_publisher_fk` foreign key (`tenant_id`, `published_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layouts` add unique `studio_layout_tenant_identity`(`tenant_id`, `id`);

alter table `studio_layouts` add `draft_revision` int unsigned null;

create table `studio_layout_versions` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `studio_layout_id` bigint unsigned not null, `revision` int unsigned not null, `kind` varchar(20) not null, `configuration` json not null, `actor_id` bigint unsigned null, `source_version_id` bigint unsigned null, `reason` varchar(300) null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `studio_layout_versions` add constraint `studio_layout_versions_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `studio_layout_versions` add unique `studio_version_revision`(`tenant_id`, `studio_layout_id`, `revision`);

alter table `studio_layout_versions` add unique `studio_version_identity`(`tenant_id`, `studio_layout_id`, `id`);

alter table `studio_layout_versions` add constraint `studio_version_layout_fk` foreign key (`tenant_id`, `studio_layout_id`) references `studio_layouts` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layout_versions` add constraint `studio_version_actor_fk` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layout_versions` add constraint `studio_version_source_fk` foreign key (`tenant_id`, `studio_layout_id`, `source_version_id`) references `studio_layout_versions` (`tenant_id`, `studio_layout_id`, `id`) on delete restrict;

create table `studio_version_archives` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `studio_layout_id` bigint unsigned not null, `studio_layout_version_id` bigint unsigned not null, `actor_id` bigint unsigned not null, `reason` varchar(300) not null, `created_at` timestamp not null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `studio_version_archives` add constraint `studio_version_archives_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `studio_version_archives` add unique `studio_archive_once`(`tenant_id`, `studio_layout_version_id`);

alter table `studio_version_archives` add constraint `studio_archive_version_fk` foreign key (`tenant_id`, `studio_layout_id`, `studio_layout_version_id`) references `studio_layout_versions` (`tenant_id`, `studio_layout_id`, `id`) on delete restrict;

alter table `studio_version_archives` add constraint `studio_archive_actor_fk` foreign key (`tenant_id`, `actor_id`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `studio_layouts` drop index `studio_surface_identity`;

alter table `studio_layouts` add `role_scope` bigint unsigned as (coalesce(role_id, 0)) stored;

alter table `studio_layouts` add unique `studio_scope_identity`(`tenant_id`, `surface`, `device`, `role_scope`);

create table `studio_templates` (`id` bigint unsigned not null auto_increment primary key, `tenant_id` bigint unsigned not null, `surface` varchar(30) not null default 'pos', `name` varchar(80) not null, `revision` int unsigned not null default '1', `configuration` json not null, `updated_by` bigint unsigned not null, `created_at` timestamp null, `updated_at` timestamp null) default character set utf8mb4 collate 'utf8mb4_unicode_ci';

alter table `studio_templates` add constraint `studio_templates_tenant_id_foreign` foreign key (`tenant_id`) references `tenants` (`id`) on delete restrict;

alter table `studio_templates` add unique `studio_template_name`(`tenant_id`, `surface`, `name`);

alter table `studio_templates` add constraint `studio_template_actor_fk` foreign key (`tenant_id`, `updated_by`) references `users` (`tenant_id`, `id`) on delete restrict;

alter table `kitchen_tickets` add `priority` tinyint unsigned not null default '0';

alter table `kitchen_tickets` add index `kitchen_priority_queue`(`tenant_id`, `branch_id`, `priority`, `created_at`, `id`);

alter table `kitchen_stations` add `display_settings` json null;

alter table `kitchen_tickets` add `display_snapshot` json null;

