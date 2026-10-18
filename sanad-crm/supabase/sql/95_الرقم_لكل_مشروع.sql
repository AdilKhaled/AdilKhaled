-- ═══════════════════════════════════════════════════════════
-- ٩٥ · نفس رقم العميل على مشروع ثاني
-- الوضع المطلوب: العميل يسجّل بمشروع (أ) عند موظف، وبعدين يتصل على موظف ثاني بخصوص مشروع (ب)
-- → الموظف الثاني يقدر يفتح له ملف ثاني بمشروع (ب). التكرار الممنوع هو نفس الرقم بنفس المشروع بس.
--
-- شغّله من SQL Editor مرة وحدة. الخطوة ٣ تعرض تعريف دالة add_lead_self — إذا بيها فحص تكرار على الرقم
-- بدون المشروع، أرسل لي التعريف حتى أعدّله (ما أقدر أعدّل دالة ما أشوفها).
-- ═══════════════════════════════════════════════════════════

-- ١) القيود والفهارس الفريدة الحالية على جدول العملاء (للاطلاع — تظهر بنتائج التنفيذ)
select conname as "القيد", pg_get_constraintdef(oid) as "التعريف"
from pg_constraint where conrelid = 'public.leads'::regclass and contype = 'u';

select indexname as "الفهرس", indexdef as "التعريف"
from pg_indexes where schemaname = 'public' and tablename = 'leads' and indexdef ilike '%unique%';

-- ٢) نشيل أي قيد/فهرس فريد على الرقم لحاله (بلا المشروع)، ونحط بداله فريد على (الرقم + المشروع)
do $$
declare r record;
begin
  -- قيود فريدة تشمل عمود الهاتف ولا تشمل المشروع
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.leads'::regclass and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ~* '(phone|phone_raw)'
      and pg_get_constraintdef(c.oid) !~* 'project_id'
  loop
    execute format('alter table public.leads drop constraint %I', r.conname);
    raise notice 'انشال القيد %', r.conname;
  end loop;

  -- فهارس فريدة تشمل الهاتف ولا تشمل المشروع
  for r in
    select i.indexname
    from pg_indexes i
    where i.schemaname = 'public' and i.tablename = 'leads'
      and i.indexdef ilike '%unique%'
      and i.indexdef ~* '(phone|phone_raw)'
      and i.indexdef !~* 'project_id'
  loop
    execute format('drop index if exists public.%I', i.indexname);
    raise notice 'انشال الفهرس %', r.indexname;
  end loop;
end $$;

-- فريد جديد: نفس الرقم ما يتكرر بنفس المشروع — ويُسمح بمشروع مختلف
create unique index if not exists leads_phone_project_uniq
  on public.leads (phone, project_id)
  where phone is not null and project_id is not null;

-- ٣) تعريف دالة فتح الملف — إذا بيها "exists ... where phone =" بلا project_id فهي اللي تمنع، أرسل لي ناتج هذا الاستعلام
select pg_get_functiondef(p.oid) as "add_lead_self"
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'add_lead_self';
