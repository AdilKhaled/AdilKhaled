// ═══════════════════════════════════════════════════════════
// Supabase Edge Function: ai-report
// «التقرير التحليلي» بالتحليلات — المساعد الذكي يقرأ الأرقام ويكتب:
// الخلاصة · قراءة كل مشروع · قراءة الفريق · نقاط القوة · المخاطر · خطة العمل
//
// النشر: supabase functions deploy ai-report
//        (بلا ‎--no-verify-jwt‎ — لازم المستخدم يكون مسجّل دخول)
//
// الحماية:
//   ١) Supabase تتأكد إن الطلب من مستخدم مسجّل دخول
//   ٢) نتأكد من دوره بالقاعدة بهويته هو: أدمن · مدير مشروع · مشرف بس
//   ٣) اللي يوصل هنا أرقام مجمّعة بس — بلا أسماء عملاء ولا أرقام هواتف
//
// السر المطلوب: ANTHROPIC_API_KEY (نفس اللي يستعمله ai-monitor)
//
// السرعة (تحديث):
//   · الرد يرجع بصيغة JSON مضمونة عبر «المخرجات المهيكلة» (output_config.format) بدل إجبار أداة —
//     إجبار الأداة (tool_choice: tool) يرجّع 400 على Sonnet 5.5، فكان كل طلب يفشل أول مرة ويروح للاحتياط.
//   · التفكير على أقل درجة (effort: low): التقرير مبني على أرقام محسوبة مسبقاً، فالتفكير الطويل قبل الكتابة
//     كان يضيف عشرات الثواني بلا فائدة تذكر.
//   · الاحتياط Haiku 5.5 (أسرع وأرخص من Haiku 4.5).
//   · الطول المطلوب بالتقرير صار محدد بدقة — طول الرد هو العامل الأول بوقت الانتظار.
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELS = ["claude-sonnet-5-5", "claude-haiku-5-5"];   // الأول أدق، والثاني احتياط أسرع
const EFFORT = "low";                                         // low = أسرع رد · medium لو حسّيت التحليل سطحي
const MAX_TOKENS = 12000;                                     // التفكير يُحسب منها — نخلي مجال كافي
const STAFF = ["admin", "manager", "supervisor"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const GLOSSARY =
  "مصطلحات نظام سند — التزم بيها حرفياً: «البركة» = عملاء ما انوزّعوا على موظف بعد (مو بركة ماء ولا عقار). " +
  "«عميل» أو «ليد» = شخص مهتم يشتري وحدة سكنية. «مباع» = صفقة مسجّلة + عميل مرحلته بيع وينتظر تسجيل العقد. " +
  "«التاركت» = هدف مبيعات الموظف. «المشروع» = مجمع سكني تسوّقه سند. «راكد» = بلا حركة أكثر من ٧ أيام. " +
  "«ما انلمس» = عميل جديد ما أحد اتصل بيه. «نسبة التحويل» = المباع ÷ العملاء الجداد بالفترة. " +
  "«نسبة الفوز» = المباع ÷ (المباع + المرفوض).";

const ACTIONS =
  "الإجراءات اللي النظام يدعمها: توزيع البركة على الموظفين · تسجيل العقد · إرسال ملاحظة أو نصيحة أو إنذار للموظف · " +
  "تحديد تاركت · نقل عميل لموظف ثاني · نشر إعلان أو مسابقة للفريق · متابعة العملاء الراكدين والجداد. " +
  "وتقدر تقترح إجراءات تسويقية وتشغيلية عامة (تقوية مصدر عملاء، تدريب على اعتراض متكرر، تسريع الرد) " +
  "بشرط تكون مبنية على رقم موجود بالبيانات.";

const BREVITY =
  "الإيجاز شرط: جمل قصيرة ومباشرة، كل معلومة تنذكر بمكان واحد بس، بلا مقدمات وبلا تكرار الأرقام نفسها بأكثر من حقل. ";

const SYSTEM =
  "إنت محلل مبيعات أول بشركة «سند العقارية للتسويق والاستثمار العقاري» بالعراق. " +
  "تكتب تقرير إداري لصاحب الشركة: موضوعي، مباشر، مبني على الأرقام بس. " +
  "اللغة: عربية واضحة بلمسة عراقية مهذبة (مثل: هسه، أكو، ماكو، زين، هواي) — بلا مبالغة وبلا مجاملة، ولا تستعمل حرف گ. " +
  "قواعد صارمة: ١) لا تخترع ولا رقم — كل رقم تذكره لازم يكون بالبيانات أو محسوب منها مباشرة. " +
  "٢) قارن دائماً بالفترة السابقة وبين المشاريع وبين الموظفين، وفسّر الفرق. " +
  "٣) إذا العدد صغير (أقل من ٥) قول إن الاستنتاج مبدئي. " +
  "٤) إذا الفترة لسه ماشية (period_in_progress) خذ هذا بالحسبان. " +
  "٥) كل مخاطرة لازم يقابلها إجراء عملي بخطة العمل. " +
  "٦) ركّز على الأسباب: وين يتسرّب العميل بالقمع، أي مصدر يجيب عملاء يشترون، أي سبب رفض يتكرر، سرعة الرد، توزيع الحمل على الفريق. " +
  "٧) " + BREVITY +
  GLOSSARY + " " + ACTIONS + " " +
  "اكتب التقرير بصيغة JSON بهذي الحقول بالضبط: " +
  '{"verdict":"جملة وحدة تلخص الوضع","summary":"٣ إلى ٤ جمل: شنو صار، ليش، وشنو الأهم هسه",' +
  '"projects":[{"name":"اسم المشروع مثل ما بالبيانات","reading":"جملتين أو ثلاث لهذا المشروع بالذات مقارنة بالسابق وبباقي المشاريع","actions":["إجراء محدد — إجراء أو اثنين بس"]}],' +
  '"team":"جملتين أو ثلاث عن الفريق: منو متقدم ومنو يحتاج دعم وليش — بأرقام",' +
  '"strengths":["نقطة قوة بالرقم"],"risks":["مخاطرة بالرقم"],' +
  '"actions":[{"priority":"عاجل أو هذا الأسبوع أو هذا الشهر","text":"الإجراء بالتحديد","owner":"الإدارة أو المدير أو الموظفين أو اسم الموظف"}]}' +
  " — ٣ نقاط قوة و٣ مخاطر، ومن ٤ لـ٦ إجراءات مرتبة حسب الأولوية. إذا التقرير لموظف واحد (focus_employee) ركّز عليه وقارنه بمعدّل الفريق.";

// ── التقرير التجاري (المولات والمشاريع التجارية — B2B) ──
const SYSTEM_COM =
  "إنت مستشار تأجير وتسويق مولات ومشاريع تجارية أول، تشتغل ويا «سند العقارية» بالعراق. تكتب تقرير إداري لصاحب الشركة عن بوابة التسويق التجاري " +
  "(شركات وبراندات نتفاوض وياهم يستأجرون أو يشترون محلات بالمشروع). موضوعي، مباشر، مبني على الأرقام بس. " +
  "اللغة: عربية واضحة بلمسة عراقية مهذبة — بلا مبالغة ولا مجاملة، ولا تستعمل حرف گ. " +
  "قواعد صارمة: ١) لا تخترع ولا رقم — كل رقم لازم يكون بالبيانات أو محسوب منها مباشرة. ٢) قارن بالفترة السابقة وبين الموظفين والمشاريع. " +
  "٣) إذا العدد صغير (أقل من ٥) قول إن الاستنتاج مبدئي. ٤) كل مخاطرة يقابلها إجراء. " +
  "٥) فكّر مثل مدير تأجير مول: المستأجر الرئيسي (anchor) يجيب الزوار ويسحب الباقين — بلاه المشروع ضعيف؛ توزيع النشاطات (tenant mix) لازم يكون متوازن " +
  "(أزياء · مطاعم وكافيهات · ترفيه · هايبر · خدمات) وما يتكرر نشاط هواي؛ الإشغال (occupancy) ونسبة المساحة المتعاقد عليها؛ سعر المتر والإيجار؛ " +
  "سرعة الدورة من الاستهداف للعقد؛ الحركة (اتصالات · اجتماعات · زيارات موقع · عروض رسمية) لكل فرصة؛ الفرص الراكدة والمواعيد الفايتة؛ جودة البحث الذكي (كم براند صار فرصة حقيقية). " +
  "٦) " + BREVITY +
  "مراحل البوابة: استهداف ← أول تواصل ← اجتماع ← زيارة الموقع ← عرض رسمي ← تفاوض ← خطاب نوايا ← عقد ← تسليم وافتتاح. " +
  "اكتب التقرير بصيغة JSON بهذي الحقول بالضبط: " +
  '{"verdict":"جملة وحدة تلخص الوضع","summary":"٣ إلى ٤ جمل","pipeline":"جملتين أو ثلاث عن البوابة والقمع ووين نخسر","mix":"جملتين عن توزيع النشاطات والمستأجرين الرئيسيين والمساحة",' +
  '"team":"جملتين عن الفريق بأرقام","forecast":"جملتين: شنو المتوقع الأشهر الجاية إذا استمر نفس الأداء",' +
  '"strengths":["نقطة قوة بالرقم"],"risks":["مخاطرة بالرقم"],' +
  '"decisions":[{"title":"قرار إداري واضح","why":"ليش — بالرقم","impact":"شنو راح يتغير"}],' +
  '"advice":[{"area":"المجال (مثل: الاستهداف · العروض · التسعير · الفريق · المستأجر الرئيسي · المتابعة)","text":"نصيحة عملية لتطوير الشغل"}],' +
  '"actions":[{"priority":"عاجل أو هذا الأسبوع أو هذا الشهر","text":"الإجراء بالتحديد","owner":"الإدارة أو اسم الموظف أو فريق التجاري","kpi":"شلون نقيس إنه نجح"}]}' +
  " — ٣ نقاط قوة و٣ مخاطر، ٢ إلى ٣ قرارات، ٣ إلى ٤ نصائح، ٤ إلى ٦ إجراءات مرتبة حسب الأولوية.";

// ── شكل الرد (JSON Schema للمخرجات المهيكلة): كل كائن لازم additionalProperties:false وكل حقوله مطلوبة ──
const S = { type: "string" }, SA = { type: "array", items: S };
const obj = (properties: Record<string, unknown>) =>
  ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const PRIORITY = { type: "string", enum: ["عاجل", "هذا الأسبوع", "هذا الشهر"] };
export const RES_SCHEMA = obj({
  verdict: S, summary: S, team: S, strengths: SA, risks: SA,
  projects: { type: "array", items: obj({ name: S, reading: S, actions: SA }) },
  actions: { type: "array", items: obj({ priority: PRIORITY, text: S, owner: S }) },
});
export const COM_SCHEMA = obj({
  verdict: S, summary: S, pipeline: S, mix: S, team: S, forecast: S, strengths: SA, risks: SA,
  decisions: { type: "array", items: obj({ title: S, why: S, impact: S }) },
  advice: { type: "array", items: obj({ area: S, text: S }) },
  actions: { type: "array", items: obj({ priority: PRIORITY, text: S, owner: S, kpi: S }) },
});
// نص فيه JSON (احتياط إذا رجع نص حول الـJSON)
export function toObj(x: unknown): any {
  if (x && typeof x === "object") return x;
  const txt = String(x ?? ""), a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("ما رجع JSON");
  return JSON.parse(txt.slice(a, b + 1));
}
export function parseCom(src: unknown) {
  const j = toObj(src);
  const arr = (x: unknown) => Array.isArray(x) ? x : [];
  const str = (x: unknown, n = 900) => typeof x === "string" ? x.trim().slice(0, n) : "";
  return {
    verdict: str(j.verdict, 300), summary: str(j.summary), pipeline: str(j.pipeline), mix: str(j.mix), team: str(j.team), forecast: str(j.forecast),
    strengths: arr(j.strengths).map((x) => str(x, 300)).filter(Boolean).slice(0, 6), risks: arr(j.risks).map((x) => str(x, 300)).filter(Boolean).slice(0, 6),
    decisions: arr(j.decisions).map((d: any) => ({ title: str(d?.title, 200), why: str(d?.why, 300), impact: str(d?.impact, 300) })).filter((d) => d.title).slice(0, 5),
    advice: arr(j.advice).map((d: any) => ({ area: str(d?.area, 60), text: str(d?.text, 400) })).filter((d) => d.text).slice(0, 8),
    actions: arr(j.actions).map((x: any) => ({ priority: str(x?.priority, 30) || "هذا الأسبوع", text: str(x?.text, 400), owner: str(x?.owner, 80), kpi: str(x?.kpi, 200) })).filter((x) => x.text).slice(0, 10),
  };
}

// طلب واحد للمساعد: الرد JSON مضمون بالشكل (schema) — بلا أدوات ولا إجبار أداة
async function askClaude(model: string, user: string, system = SYSTEM, schema: unknown = RES_SCHEMA): Promise<unknown> {
  const headers: Record<string, string> = { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" };
  const body: Record<string, unknown> = {
    model, max_tokens: MAX_TOKENS, system,
    output_config: { effort: EFFORT, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content: user }],
  };
  // Sonnet 5.5: لو رفض الطلب بسبب مصنّف الأمان، الـAPI يعيده بنفسه على نموذج احتياط (ميزة تجريبية بالـClaude API)
  if (model === "claude-sonnet-5-5") { headers["anthropic-beta"] = "server-side-fallback-2026-07-01"; body.fallbacks = "default"; }
  const t0 = Date.now();
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${model}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  console.log("ai-report", model, d.stop_reason, Math.round((Date.now() - t0) / 100) / 10 + "s", JSON.stringify(d.usage ?? {}));
  if (d.stop_reason === "refusal") throw new Error(`${model}: رفض الطلب (${d.stop_details?.category ?? "?"})`);
  if (d.stop_reason === "max_tokens") throw new Error("الرد انقطع (طويل هواي)");
  // الجواب بكتلة نص — وقد تسبقه كتل تفكير، فنقرأ حسب النوع مو حسب الترتيب
  const text = (d.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text ?? "").join("");
  return toObj(text);
}
function parse(src: unknown) {
  const j = toObj(src);
  const arr = (x: unknown) => Array.isArray(x) ? x : [];
  const str = (x: unknown) => typeof x === "string" ? x.trim() : "";
  return {
    verdict: str(j.verdict), summary: str(j.summary), team: str(j.team),
    projects: arr(j.projects).map((p: any) => ({ name: str(p?.name), reading: str(p?.reading), actions: arr(p?.actions).map(str).filter(Boolean) })),
    strengths: arr(j.strengths).map(str).filter(Boolean), risks: arr(j.risks).map(str).filter(Boolean),
    actions: arr(j.actions).map((a: any) => ({ priority: str(a?.priority) || "هذا الأسبوع", text: str(a?.text), owner: str(a?.owner) })).filter((a) => a.text),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST بس" }, 405);
  if (!ANTHROPIC_KEY) return json({ error: "مفتاح المساعد ANTHROPIC_API_KEY مو محطوط بالأسرار" }, 503);

  const jwt = req.headers.get("Authorization") ?? "";
  if (!jwt.startsWith("Bearer ")) return json({ error: "لازم تسجّل دخول" }, 401);

  // ── منو المستخدم وشنو دوره — بهويته هو، مو بمفتاح الخدمة ──
  const h = { apikey: ANON_KEY, Authorization: jwt };
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!u.ok) return json({ error: "الجلسة منتهية — سجّل دخول مرة ثانية" }, 401);
  const uid = (await u.json())?.id;
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${uid}&select=role,is_active`, { headers: h });
  const me = pr.ok ? (await pr.json())?.[0] : null;
  if (!me || !me.is_active || !STAFF.includes(me.role)) return json({ error: "التقرير التحليلي للإدارة بس" }, 403);

  let report: unknown = null, kind = "";
  try { const b = await req.json(); report = b?.report; kind = String(b?.kind ?? ""); } catch { /* تحت */ }
  if (!report || typeof report !== "object") return json({ error: "ما وصلت أرقام التقرير" }, 400);
  const data = JSON.stringify(report);
  if (data.length > 120_000) return json({ error: "التقرير كبير هواي — صغّر الفلتر" }, 413);

  const prompt = "هذي أرقام الفترة من نظام سند (JSON). حللها واكتب التقرير بالشكل المطلوب:\n" + data;
  const t0 = Date.now();
  let lastErr = "";
  if (kind === "commercial") {
    if (me.role !== "admin") return json({ error: "تقرير التجاري للأدمن بس" }, 403);
    for (const m of MODELS) {
      try {
        const out = parseCom(await askClaude(m, prompt, SYSTEM_COM, COM_SCHEMA));
        if (!out.summary) throw new Error("خلاصة فارغة");
        return json({ ...out, model: m, took_ms: Date.now() - t0 });
      } catch (e) { lastErr = String(e); console.error("ai-report com", lastErr); }
    }
    return json({ error: "المساعد ما رجّع تحليل هسه", detail: lastErr.replace(/\s+/g, " ").slice(0, 300) }, 502);
  }
  for (const m of MODELS) {
    try {
      const out = parse(await askClaude(m, prompt));
      if (!out.summary) throw new Error("خلاصة فارغة");
      return json({ ...out, model: m, took_ms: Date.now() - t0 });
    } catch (e) { lastErr = String(e); console.error("ai-report", lastErr); }
  }
  return json({ error: "المساعد ما رجّع تحليل هسه — جرّب بعد دقيقة", detail: lastErr.replace(/\s+/g, " ").slice(0, 300) }, 502);
});
