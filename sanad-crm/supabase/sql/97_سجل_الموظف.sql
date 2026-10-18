-- ═══════════════════════════════════════════════════════════
-- ٩٧ · سجل الموظف: التقييمات الشهرية (متابعة وتقييم)
-- الإدارة (أدمن · مدير · مشرف) تكتب تقييم لكل موظف بفترة (شهر): درجات من ١ إلى ٥ على خمس نقاط
-- + نقاط قوة + يحتاج يتحسّن + أهداف الفترة الجاية. الموظف يشوف تقييماته من «ملفي ← سجلي».
-- شغّله مرة وحدة من SQL Editor. آمن يعاد تشغيله.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.staff_reviews (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id),
  period      text not null,                        -- 'YYYY-MM'
  score       numeric(3,1) not null,                -- معدل الدرجات من ٥
  scores      jsonb not null default '{}'::jsonb,   -- {"commit":4,"followup":3,...}
  strengths   text,
  improve     text,
  goals       text,
  created_at  timestamptz not null default now()
);
create index if not exists staff_reviews_agent_idx on public.staff_reviews (agent_id, created_at desc);

alter table public.staff_reviews enable row level security;
revoke all on public.staff_reviews from anon;

-- قراءة مباشرة (احتياط — النظام يستخدم الدوال تحت): الموظف تقييماته، والإدارة الكل
drop policy if exists staff_reviews_read on public.staff_reviews;
create policy staff_reviews_read on public.staff_reviews for select to authenticated
  using (agent_id = auth.uid()
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','manager','supervisor')));

-- ١) قائمة تقييمات موظف
create or replace function public.staff_review_list(p_agent uuid)
returns table (id uuid, agent_id uuid, reviewer_id uuid, reviewer_name text, period text, score numeric,
               scores jsonb, strengths text, improve text, goals text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.agent_id, r.reviewer_id, p.full_name, r.period, r.score, r.scores, r.strengths, r.improve, r.goals, r.created_at
  from public.staff_reviews r
  left join public.profiles p on p.id = r.reviewer_id
  where r.agent_id = p_agent
    and (p_agent = auth.uid()
         or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role in ('admin','manager','supervisor')))
  order by r.created_at desc;
$$;

-- ٢) تقييم جديد — الإدارة بس، وما تقيّم نفسها
create or replace function public.staff_review_add(p_agent uuid, p_period text, p_scores jsonb,
                                                   p_strengths text default null, p_improve text default null, p_goals text default null)
returns public.staff_reviews
language plpgsql security definer set search_path = public as $$
declare v_role text; v_avg numeric; v_row public.staff_reviews; v_name text;
begin
  select role, full_name into v_role, v_name from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('admin','manager','supervisor') then raise exception 'التقييم صلاحية الإدارة بس'; end if;
  if p_agent = auth.uid() then raise exception 'ما تقدر تقيّم نفسك'; end if;
  if not exists (select 1 from public.profiles where id = p_agent) then raise exception 'الموظف مو موجود'; end if;
  if p_period !~ '^\d{4}-\d{2}$' then raise exception 'الفترة لازم تكون بصيغة سنة-شهر'; end if;

  select avg(v::numeric) into v_avg
  from jsonb_each_text(coalesce(p_scores, '{}'::jsonb)) as t(k, v)
  where v ~ '^[1-5]$';
  if v_avg is null then raise exception 'حدّد درجة وحدة على الأقل'; end if;

  insert into public.staff_reviews (agent_id, reviewer_id, period, score, scores, strengths, improve, goals)
  values (p_agent, auth.uid(), p_period, round(v_avg, 1), coalesce(p_scores, '{}'::jsonb),
          nullif(trim(p_strengths), ''), nullif(trim(p_improve), ''), nullif(trim(p_goals), ''))
  returning * into v_row;

  -- إشعار للموظف (إذا جدول الإشعارات بشكله المعروف — وإلا نكمل بلا إشعار)
  begin
    insert into public.notifications (user_id, kind, title, body, from_user_id)
    values (p_agent, 'review', 'تقييم جديد بسجلك', coalesce(v_name,'الإدارة') || ' كتب تقييمك لفترة ' || p_period || ' — ' || round(v_avg,1) || ' من ٥. شوفه من ملفي ← سجلي', auth.uid());
  exception when others then null;
  end;

  return v_row;
end $$;

-- ٣) حذف تقييم — الأدمن أي تقييم، والمدير/المشرف تقييمه هو
create or replace function public.staff_review_del(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  delete from public.staff_reviews r
  where r.id = p_id
    and (v_role = 'admin' or (v_role in ('manager','supervisor') and r.reviewer_id = auth.uid()));
  if not found then raise exception 'ما أكو تقييم بهذا الرقم أو ما إلك صلاحية تحذفه'; end if;
end $$;

grant execute on function public.staff_review_list(uuid) to authenticated;
grant execute on function public.staff_review_add(uuid, text, jsonb, text, text, text) to authenticated;
grant execute on function public.staff_review_del(uuid) to authenticated;

-- تأكيد: يطبع عدد التقييمات الموجودة (٠ أول مرة)
select count(*) as "تقييمات مسجّلة" from public.staff_reviews;
