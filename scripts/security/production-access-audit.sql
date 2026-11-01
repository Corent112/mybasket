-- READ ONLY. Run in the production Supabase SQL editor; no data is modified.
-- Confirm isolation AND column-level access before changing policies.
select c.relname as table_name,c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname in
('profiles','orders','order_items','payments','subscriptions','free_access_grants','institutional_players','training_candidates','training_document_versions');
select tablename,policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename in
('profiles','orders','order_items','payments','subscriptions','free_access_grants','institutional_players','training_candidates','training_document_versions') order by tablename,policyname;
select grantee,table_name,privilege_type from information_schema.role_table_grants
where table_schema='public' and grantee in ('anon','authenticated') and table_name in
('profiles','orders','order_items','payments','subscriptions','free_access_grants') order by table_name,grantee;
select grantee,table_name,column_name,privilege_type from information_schema.column_privileges
where table_schema='public' and grantee in ('anon','authenticated') and table_name='profiles'
and column_name in ('platform_role','status','id');
-- Also review Storage bucket privacy and policies, without exposing file contents.
select id,public,file_size_limit,allowed_mime_types from storage.buckets;
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
