// ═══════════════════════════════════════════════════════════
// Supabase Edge Function: ai-coach
// ١) ملاحظات المساعد: يقرا العملاء المهمين اللي الموظف تاركهم (من ai_coach_candidates)
//    ويكتب لكل عميل: ليش مهم · شنو آخر شي صار · الخطوة الجاية · جملة افتتاحية للمكالمة.
//    تنحفظ بـ ai_lead_notes ويوصل للموظف إشعار (وتيليغرام إذا مربوط).
// ٢) قراءة تحليل الأسباب: يقرا أرقام «ليش نخسر وشنو مشاكل العملاء» ويكتب الأسباب الجذرية والعلاج.
//
// النشر: supabase functions deploy ai-coach --no-verify-jwt
//   (نتحقق بأنفسنا: إما سر الجدولة x-cron-secret، أو جلسة مستخدم مسجّل دخول)
// الأسرار: ANTHROPIC_API_KEY · AI_MONITOR_CRON_SECRET (نفس أسرار المراقب — لا تكتب قيمتها بأي ملف)
//
// الخصوصية: للمساعد يروح الاسم الأول للعميل بس (للجملة الافتتاحية) — بلا أرقام هواتف.
//
// السرعة (تحديث): الرد JSON مضمون عبر «المخرجات المهيكلة» (output_config.format) بدل إجبار أداة —
//   إجبار الأداة يرجّع 400 على Sonnet 5.5 فكان كل طلب يفشل أول مرة ويروح للاحتياط. والتفكير على أقل درجة (effort: low)،
//   والاحتياط Haiku 5.5.
// ═══════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CRON_SECRET = Deno.env.get("AI_MONITOR_CRON_SECRET") ?? "";
const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];
const EFFORT = "low";         // أسرع رد — medium لو حسّيت القراءة سطحية
const PER_OWNER = 8;          // أكثر شي ٨ عملاء لكل موظف بالمرة الوحدة
const MAX_OWNERS = 20;
const REFRESH_EVERY_MIN = 15; // التحديث اليدوي: مرة كل ربع ساعة لكل موظف

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const STAGE_AR: Record<string, string> = { new: "جديد", contacted: "انحجى وياه", interested: "مهتم", viewing: "معاينة", negotiation: "تفاوض" };
const KIND_AR: Record<string, string> = { call: "مكالمة", visit: "زيارة", note: "ملاحظة", voice: "ملاحظة صوتية", objection: "اعتراض", stage_change: "تغيير مرحلة", owner_changed: "تغيير موظف" };
const REASON_AR: Record<string, string> = { untouched: "جديد ما انرد عليه", overdue: "موعد متابعته فات", idle: "صار له فترة بلا تواصل", hot: "بمرحلة متقدمة", money: "عنده مقدمة/ميزانية", visited: "زار المشروع", unit: "اختار وحدة", engaged: "حجى هواي ويانا" };
const scrub = (t: unknown, n = 300) => String(t ?? "").replace(/\+?\d[\d\s\-]{6,}\d/g, "[رقم]").replace(/\s+/g, " ").trim().slice(0, n);
const firstName = (n: unknown) => String(n ?? "").trim().split(/\s+/)[0]?.slice(0, 20) || "";
const mil = (v: unknown) => (+(v as number) > 0 ? Math.round(+(v as number) / 1e5) / 10 + " مليون د.ع" : null);
const daysAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86400000));

// ── المساعد ──
const SYSTEM_COACH =
  "إنت مدرب مبيعات عقارية أول بشركة «سند العقارية للتسويق والاستثمار العقاري» بالعراق (مجمعات سكنية — مقدمة وأقساط). " +
  "تكتب لموظف المبيعات ملاحظات قصيرة وعملية عن عملائه المهمين اللي صار له فترة ما تابعهم، حتى يرجع يمسكهم قبل ما يبردون. " +
  "اللغة: عربية واضحة بلمسة عراقية مهذبة (هسه، أكو، زين، هواي) — مباشرة ومحترمة، بلا مجاملة وبلا لوم جارح، ولا تستعمل حرف گ. " +
  "قواعد صارمة: ١) لا تخترع ولا معلومة — اعتمد على السجل والأرقام الموجودة بس. إذا ما أكو تفاصيل گول هذا بصراحة واقترح سؤال يكشف الوضع. " +
  "٢) لكل عميل: headline = عنوان قصير (أقل من ١٠ كلمات) يوضح المشكلة؛ note = جملتين أو ثلاث: ليش هذا العميل مهم وشنو آخر شي صار وياه ووين واكف؛ " +
  "action = خطوة جاية وحدة محددة وواقعية ووقتها (مثلاً: اتصل اليوم قبل ٥ واعرض خطة دفع بمقدمة أقل)؛ " +
  "opener = جملة يبدأ بيها الموظف المكالمة أو رسالة الواتساب، طبيعية ومهذبة بلهجة عراقية، تخاطب العميل باسمه الأول إذا موجود، وتربط بآخر شي حجوا بيه؛ " +
  "priority = عاجل (تفاوض/معاينة أو موعد فايت أو جديد ما انرد عليه) أو اليوم أو هذا الأسبوع. " +
  "٣) إذا بالسجل اعتراض (سعر، دفعات، موقع، أهل، تسليم) خلّي الخطوة تعالجه بالتحديد. " +
  "٤) ref لازم يطابق رمز العميل بالبيانات (L1، L2…). اكتب الجواب بصيغة JSON: {\"items\":[{ref, priority, headline, note, action, opener}]}.";

// شكل الرد (JSON Schema للمخرجات المهيكلة): كل كائن additionalProperties:false وكل حقوله مطلوبة
const S = { type: "string" };
const obj = (properties: Record<string, unknown>) =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const NOTES_SCHEMA = obj({ items: { type: "array", items: obj({
  ref: S, priority: { type: "string", enum: ["عاجل", "اليوم", "هذا الأسبوع"] }, headline: S, note: S, action: S, opener: S }) } });

const SYSTEM_INS =
  "إنت محلل مبيعات عقارية أول بشركة «سند العقارية» بالعراق. توصلك أرقام مصنّفة عن أسباب رفض العملاء ومشاكلهم (دفعات، سعر، موقع، أهل، تسليم، ثقة، مساحة، منافس، تأجيل، ما يرد…) " +
  "وعيّنات من كلام العملاء والموظفين (بلا أسماء). تكتب قراءة إدارية: شنو السبب الجذري، وشنو العلاج العملي لكل سبب. " +
  "اللغة: عربية واضحة بلمسة عراقية مهذبة، بلا مبالغة، ولا تستعمل حرف گ. " +
  "قواعد: ١) لا تخترع رقم — كل رقم من البيانات. ٢) إذا العدد أقل من ٥ گول إن الاستنتاج مبدئي. ٣) فرّق بين مشكلة بالعرض نفسه (سعر، دفعات، موقع) ومشكلة بالشغل (ما يرد، تأخير المتابعة، سبب ما انكتب). " +
  "٤) العيّنات اللي ما انصنفت اقرأها واقترح إذا تحتاج تصنيف جديد. ٥) الإيجاز شرط: جمل قصيرة ومباشرة، كل سبب جملتين أو ثلاث، بلا تكرار. " +
  "اكتب الجواب بصيغة JSON: {verdict, summary, causes:[{theme, reading, fix}], training:[], offer:[], data_quality, new_themes:[{label, why}], actions:[{priority, text, owner}]}.";
const INS_SCHEMA = obj({
  verdict: S, summary: S,
  causes: { type: "array", items: obj({ theme: S, reading: S, fix: S }) },
  training: { type: "array", items: S },
  offer: { type: "array", items: S },
  data_quality: S,
  new_themes: { type: "array", items: obj({ label: S, why: S }) },
  actions: { type: "array", items: obj({ priority: { type: "string", enum: ["عاجل", "هذا الأسبوع", "هذا الشهر"] }, text: S, owner: S }) },
});

// نص فيه JSON (احتياط إذا رجع نص حول الـJSON)
function toObj(x: unknown): any {
  if (x && typeof x === "object") return x;
  const txt = String(x ?? ""), a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("ما رجع JSON");
  return JSON.parse(txt.slice(a, b + 1));
}

// طلب للمساعد: الرد JSON مضمون بالشكل (schema) — بلا أدوات ولا إجبار أداة. يجرّب النماذج بالترتيب.
async function askClaude(system: string, user: string, schema: unknown, maxTokens = 8000): Promise<any> {
  let last = "";
  for (const model of MODELS) {
    try {
      const headers: Record<string, string> = { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" };
      const body: Record<string, unknown> = {
        model, max_tokens: maxTokens, system,
        output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: user }],
      };
      // Sonnet 5.5: لو رفض الطلب بسبب مصنّف الأمان، الـAPI يعيده بنفسه على نموذج احتياط (ميزة تجريبية بالـClaude API)
      if (model === "claude-sonnet-5-5") { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
      const t0 = Date.now();
      const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`${model}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      console.log("ai-coach", model, d.stop_reason, Math.round((Date.now() - t0) / 100) / 10 + "s", JSON.stringify(d.usage ?? {}));
      if (d.stop_reason === "refusal") throw new Error(`${model}: رفض الطلب (${d.stop_details?.category ?? "?"})`);
      if (d.stop_reason === "max_tokens") throw new Error(`${model}: الرد انقطع (طويل هواي)`);
      // الجواب بكتلة نص — وقد تسبقه كتل تفكير، فنقرأ حسب النوع مو حسب الترتيب
      const text = (d.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text ?? "").join("");
      return { out: toObj(text), model };
    } catch (e) { last = String(e); console.error("ai-coach", last); }
  }
  throw new Error(last || "المساعد ما رد");
}

// العميل كما يروح للمساعد — بلا هواتف
function leadForAI(c: any, ref: string) {
  return {
    ref, first_name: firstName(c.name), project: c.project, stage: STAGE_AR[c.stage] ?? c.stage,
    why_flagged: (c.reasons ?? []).map((r: string) => REASON_AR[r] ?? r),
    days_without_contact: c.idle_days, follow_up_overdue_days: c.overdue_days || 0,
    follow_up_date: c.follow_up, days_since_added: c.created_at ? daysAgo(c.created_at) : null,
    down_payment: mil(c.down), budget: mil(c.budget), installment: c.instal ? `${mil(c.instal)} ${c.instal_months ? "لمدة " + c.instal_months + " شهر" : ""}` : null,
    visited_project: !!c.visited, chose_unit: !!c.has_unit,
    objections: c.objections ?? [], notes: scrub(c.notes, 500) || null, payment_notes: scrub(c.pay, 300) || null,
    history: (c.events ?? []).slice(0, 10).map((e: any) => ({ what: KIND_AR[e.k] ?? e.k, days_ago: daysAgo(e.at), text: scrub(e.t, 260) })),
  };
}
const PRI: Record<string, string> = { "عاجل": "urgent", "اليوم": "today", "هذا الأسبوع": "week" };

async function coachOwner(ownerId: string, cands: any[]) {
  const list = cands.slice(0, PER_OWNER);
  if (!list.length) return { n: 0 };
  const refs = new Map<string, any>();
  const payload = list.map((c, i) => { const ref = "L" + (i + 1); refs.set(ref, c); return leadForAI(c, ref); });
  const today = new Date().toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad", weekday: "long", day: "numeric", month: "long" });
  const user = `اليوم ${today}. هذولا عملاء موظف المبيعات المهمين اللي صار له فترة ما تابعهم (JSON). اكتب ملاحظة لكل واحد:\n` + JSON.stringify(payload);
  const { out, model } = await askClaude(SYSTEM_COACH, user, NOTES_SCHEMA);
  const items = (Array.isArray(out?.items) ? out.items : []).map((x: any) => {
    const c = refs.get(String(x?.ref ?? "").trim()); if (!c) return null;
    const str = (v: unknown, n: number) => typeof v === "string" ? v.trim().slice(0, n) : "";
    return { lead_id: c.id, priority: PRI[x.priority] ?? "today", headline: str(x.headline, 200), note: str(x.note, 1500),
      action: str(x.action, 700), opener: str(x.opener, 700), score: c.score, reasons: c.reasons ?? [] };
  }).filter((x: any) => x && x.headline && x.note);
  const { data: n, error } = await sb.rpc("ai_coach_save", { p_owner: ownerId, p_items: items, p_source: "ai", p_model: model });
  if (error) throw new Error(error.message);
  return { n: +(n ?? 0), urgent: items.filter((x: any) => x.priority === "urgent").length, model };
}

async function notify(userId: string, title: string, body: string) {
  const row = { user_id: userId, kind: "personal_alert", title, body };
  const { error } = await sb.from("notifications").insert(row);
  if (error) await sb.from("notifications").insert({ ...row, kind: "system_alert" });
}
const plural = (n: number) => n === 1 ? "عميل مهم" : n === 2 ? "عميلين مهمين" : `${n} عملاء مهمين`;

async function runOwners(byOwner: Map<string, any[]>, mode: string, byUser: string | null, notifyOwners: boolean) {
  const owners = [...byOwner.keys()].slice(0, MAX_OWNERS);
  const res: any[] = [];
  let i = 0;
  const worker = async () => {
    while (i < owners.length) {
      const o = owners[i++]; const cands = byOwner.get(o)!;
      try {
        const r = await coachOwner(o, cands);
        res.push({ owner: o, name: cands[0]?.owner_name, ...r });
        await sb.from("ai_coach_runs").insert({ owner_id: o, by_user: byUser, mode, n: r.n, ok: true });
        if (notifyOwners && r.n > 0)
          await notify(o, `🧠 ملاحظات المساعد: ${plural(r.n)} محتاجين حركة`,
            (r.urgent ? `منهم ${r.urgent} عاجل · ` : "") + "افتح لوحة الملاحظات — بيها ليش كل عميل مهم وشنو تسوي وياه وجملة تبدأ بيها.");
      } catch (e) {
        res.push({ owner: o, n: 0, err: String(e).slice(0, 200) });
        await sb.from("ai_coach_runs").insert({ owner_id: o, by_user: byUser, mode, n: 0, ok: false, err: String(e).slice(0, 300) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return res;
}
function group(cands: any[]) {
  const m = new Map<string, any[]>();
  for (const c of cands ?? []) { if (!c?.owner_id) continue; (m.get(c.owner_id) ?? m.set(c.owner_id, []).get(c.owner_id)!).push(c); }
  return m;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST بس" }, 405);
  let body: any = {}; try { body = await req.json(); } catch { /* فارغ */ }

  // ── ١) الجدولة اليومية ──
  const cron = req.headers.get("x-cron-secret");
  if (cron !== null) {
    if (!CRON_SECRET) return new Response("cron secret not configured", { status: 503 });
    if (cron !== CRON_SECRET) return new Response("unauthorized", { status: 401 });
    if (!ANTHROPIC_KEY) return new Response("no ANTHROPIC_API_KEY", { status: 503 });
    const { data, error } = await sb.rpc("_ai_coach_candidates", { p_owner: null, p_limit: PER_OWNER, p_viewer: null, p_fresh: true });
    if (error) { console.error(error); return new Response("error", { status: 500 }); }
    const res = await runOwners(group(data as any[]), "cron", null, true);
    const total = res.reduce((t, r) => t + (r.n || 0), 0);
    if (total > 0) {
      const { data: admins } = await sb.from("profiles").select("id").eq("role", "admin").eq("is_active", true);
      const top = res.filter((r) => r.n).sort((a, b) => b.n - a.n).slice(0, 4).map((r) => `${r.name ?? "موظف"} ${r.n}`).join(" · ");
      for (const a of admins ?? [])
        await notify(a.id, `🧠 ملاحظات المساعد للفريق: ${plural(total)} متروكين`, `عند ${res.filter((r) => r.n).length} موظف — ${top}. افتح لوحة الملاحظات وتابعهم.`);
    }
    return new Response("ok " + total);
  }

  // ── بقية الأوضاع: لازم مستخدم مسجّل دخول ──
  const jwt = req.headers.get("Authorization") ?? "";
  if (!jwt.startsWith("Bearer ")) return json({ error: "لازم تسجّل دخول" }, 401);
  const h = { apikey: ANON_KEY, Authorization: jwt };
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return json({ error: "الجلسة منتهية — سجّل دخول مرة ثانية" }, 401);
  const uid = (await u.json())?.id as string;
  const { data: me } = await sb.from("profiles").select("role,is_active").eq("id", uid).maybeSingle();
  if (!me || !me.is_active) return json({ error: "حسابك مو فعّال" }, 403);
  if (!ANTHROPIC_KEY) return json({ error: "مفتاح المساعد ANTHROPIC_API_KEY مو محطوط بالأسرار" }, 503);
  const staff = ["admin", "manager", "supervisor"].includes(me.role);
  const mode = String(body?.mode ?? "refresh");

  // ── ٢) قراءة تحليل الأسباب ──
  if (mode === "insights") {
    const data = JSON.stringify(body?.data ?? null);
    if (!body?.data || data.length > 90_000) return json({ error: "بيانات التحليل ناقصة أو كبيرة هواي" }, 400);
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await sb.from("ai_coach_runs").select("id", { count: "exact", head: true }).eq("by_user", uid).eq("mode", "insights").gte("created_at", since);
    if ((count ?? 0) >= (staff ? 30 : 8)) return json({ error: "وصلت حد القراءات الذكية لليوم — جرّب باچر" }, 429);
    const t0 = Date.now();
    try {
      const { out, model } = await askClaude(SYSTEM_INS, "هذي أرقام وعيّنات تحليل الأسباب من نظام سند (JSON). اكتب القراءة:\n" + data, INS_SCHEMA, 8000);
      await sb.from("ai_coach_runs").insert({ owner_id: null, by_user: uid, mode: "insights", n: 1, ok: true });
      return json({ ...out, model, took_ms: Date.now() - t0 });
    } catch (e) {
      await sb.from("ai_coach_runs").insert({ owner_id: null, by_user: uid, mode: "insights", n: 0, ok: false, err: String(e).slice(0, 300) });
      return json({ error: "المساعد ما رجّع قراءة هسه — جرّب بعد دقيقة" }, 502);
    }
  }

  // ── ٣) تحديث الملاحظات يدوياً ──
  // الموظف: عملاءه بس · الإدارة: موظف محدد أو كل الفريق — والصلاحية تتحقق بالقاعدة بهوية المستخدم نفسه
  const owner = staff ? (body?.owner || null) : uid;
  const userDb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: jwt } } });
  const { data: cands, error } = await userDb.rpc("ai_coach_candidates", { p_owner: owner, p_limit: PER_OWNER, p_fresh: true });
  if (error) return json({ error: error.message }, 400);
  const byOwner = group(cands as any[]);
  // ما نعيد لنفس الموظف قبل ربع ساعة
  const since = new Date(Date.now() - REFRESH_EVERY_MIN * 60000).toISOString();
  const { data: recent } = await sb.from("ai_coach_runs").select("owner_id").in("owner_id", [...byOwner.keys(), uid]).eq("ok", true).neq("mode", "insights").gte("created_at", since);
  const skipped: string[] = [];
  for (const r of recent ?? []) if (byOwner.delete(r.owner_id)) skipped.push(r.owner_id);
  if (!byOwner.size) return json({ ok: true, n: 0, skipped: skipped.length, note: skipped.length ? "الملاحظات انحدثت قبل شوي — جرّب بعد ربع ساعة" : "ما أكو عملاء مهمين متروكين هسه 👍" });
  if (!staff && byOwner.size > 1) return json({ error: "مو من صلاحيتك" }, 403);
  const res = await runOwners(byOwner, staff ? "refresh_staff" : "refresh", uid, staff && owner !== null && owner !== uid);
  return json({ ok: true, n: res.reduce((t, r) => t + (r.n || 0), 0), owners: res.map((r) => ({ name: r.name, n: r.n, err: r.err ? "تعذّر" : undefined })), skipped: skipped.length });
});
