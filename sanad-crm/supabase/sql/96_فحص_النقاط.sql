-- ═══════════════════════════════════════════════════════════
-- ٩٦ · فحص النقاط: هل تسجيل العميل يعطي نقاط أصلاً؟ ومن وين تجي النقاط؟
-- شغّله من SQL Editor وأرسل لي النتائج — منها أعرف إذا نحتاج قاعدة جديدة «تسجيل عميل».
-- (قراءة فقط — ما يغيّر شي)
-- ═══════════════════════════════════════════════════════════

-- ١) آخر ١٥ حدث نقاط بالقاعدة: إذا ما أكو صف بعد تسجيلك العميل → ما أكو قاعدة تعطي نقاط للتسجيل
select created_at, agent_id, rule_code, points, week_start
from public.points_events
order by created_at desc
limit 15;

-- ٢) أعمدة جدول النقاط (حتى أكتب القاعدة الجديدة بنفس الشكل)
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'points_events'
order by ordinal_position;

-- ٣) القواعد الموجودة (إذا أكو جدول قواعد) — أسماء الجداول اللي بيها «point» أو «rule»
select table_name
from information_schema.tables
where table_schema = 'public' and (table_name ilike '%point%' or table_name ilike '%rule%')
order by table_name;

-- ٤) الدوال والمحفّزات اللي تكتب بالنقاط: منو يعطي النقاط ومتى
select p.proname as "الدالة"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%points_events%'
order by 1;

select tgname as "المحفّز", tgrelid::regclass as "على جدول"
from pg_trigger
where not tgisinternal and tgrelid::regclass::text in ('leads','lead_events','deals','tasks','points_events');

-- ٥) هل جدول النقاط ضمن البث المباشر؟ (لو لا: الفرقعة تطلع بالتحديث الدوري بدل اللحظة نفسها)
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'points_events';
-- لإضافته للبث (اختياري): alter publication supabase_realtime add table public.points_events;
