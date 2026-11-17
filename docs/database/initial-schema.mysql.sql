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

