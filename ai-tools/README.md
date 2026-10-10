# دليل تثبيت أدوات الذكاء الاصطناعي (خطوة بخطوة)

هذا الدليل يشرح بالعربية كيف تثبّت خمس أدوات وتشغّلها. اقرأه بالترتيب، لأن كل أداة تعتمد على التي قبلها.

| # | الأداة | ما هي؟ | طريقة التثبيت |
|---|---|---|---|
| 1 | **Claude Code** | أداة سطر الأوامر الرسمية من Anthropic. كل الأدوات التالية تعمل معها. | أمر واحد في الطرفية |
| 2 | **OmniRoute** | بوابة (Gateway) محلية تجمع مئات مزودي الذكاء الاصطناعي خلف عنوان API واحد. | Docker أو npm |
| 3 | **claude-mem** | ذاكرة دائمة لـ Claude Code: يتذكر ما فعلته في الجلسات السابقة. | إضافة (Plugin) |
| 4 | **Headroom** | ضغط السياق: يقلل عدد التوكنات المرسلة بنسبة كبيرة ويوفر التكلفة. | Python (uv أو pip) |
| 5 | **task-observer** | مهارة (Skill) تراقب عملك وتقترح مهارات جديدة من الأخطاء والتصحيحات المتكررة. | مهارة |

> **اختصار:** إذا أردت تثبيت كل شيء بأمر واحد على Linux أو macOS، شغّل `bash ai-tools/install-all.sh`. الدليل التالي يشرح ما يفعله هذا السكربت خطوة بخطوة.

---

## المتطلبات قبل البدء

افتح الطرفية (Terminal) وتأكد من وجود هذه البرامج:

```bash
node --version     # يجب أن يكون 22.22.2 أو أحدث، أو 24.x  (النسخة 23 غير مدعومة)
npm --version
python3 --version  # 3.10 أو أحدث
```

- **Node.js:** حمّله من https://nodejs.org (اختر نسخة LTS).
- **Python:** حمّله من https://python.org
- **uv** (مدير حزم Python، مطلوب لـ Headroom):
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Docker** (اختياري، لـ OmniRoute فقط): https://docs.docker.com/get-docker/

---

## 1. Claude Code (أداة Anthropic الأساسية)

### التثبيت

على Linux أو macOS:

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

على Windows (PowerShell):

```powershell
irm https://claude.ai/install.ps1 | iex
```

بديل عبر npm (طريقة أقدم لكنها تعمل):

```bash
npm install -g @anthropic-ai/claude-code
```

### التحقق والتشغيل

```bash
claude --version
cd مجلد-مشروعك
claude
```

عند أول تشغيل سيفتح المتصفح لتسجيل الدخول بحسابك في claude.ai. بعد ذلك تكتب طلبك مباشرة داخل الطرفية.

---

## 2. OmniRoute (بوابة الذكاء الاصطناعي)

**الفكرة ببساطة:** بدل أن تضع مفتاح OpenAI في برنامج، ومفتاح Gemini في برنامج آخر، تضع كل المفاتيح في OmniRoute مرة واحدة، ثم توجّه كل برامجك إلى عنوان واحد: `http://localhost:20128/v1`. OmniRoute يختار المزود المناسب ويبدّل تلقائياً عند الفشل.

### الطريقة أ: Docker (الأفضل للاستخدام الدائم)

```bash
cd omniroute
cp .env.example .env
```

افتح ملف `.env` وغيّر السطر `INITIAL_PASSWORD=CHANGEME` إلى كلمة سر قوية. ثم:

```bash
docker compose up -d
```

### الطريقة ب: npm (الأسرع للتجربة)

```bash
npm install -g omniroute
INITIAL_PASSWORD='كلمة-سر-قوية' omniroute
```

### ما بعد التثبيت

1. افتح المتصفح على `http://localhost:20128`
2. سجّل الدخول بكلمة السر التي وضعتها.
3. اذهب إلى **Providers** وأضف مزوداً واحداً على الأقل (OpenAI، Anthropic، Gemini، أو مزود مجاني).
4. اذهب إلى **Endpoints** وأنشئ API Key وانسخه.
5. اختبر:
   ```bash
   curl http://localhost:20128/v1/models -H "Authorization: Bearer المفتاح-الذي-نسخته"
   ```
6. في أي برنامج (Cursor، Cline، Codex...) ضع:
   - Base URL: `http://localhost:20128/v1`
   - API Key: المفتاح الذي نسخته

تفاصيل أكثر ومشاكل شائعة في [omniroute/README.md](../omniroute/README.md).

---

## 3. claude-mem (الذاكرة الدائمة)

**الفكرة ببساطة:** Claude Code عادةً ينسى كل شيء عند إغلاق الجلسة. claude-mem يسجّل ملاحظات عن ما قرأه وعدّله ونفّذه، ويعيد حقنها في الجلسة التالية من نفس المشروع.

### التثبيت (أمر واحد)

```bash
npx claude-mem install
```

المثبّت يفعل كل شيء تلقائياً: يسجّل الإضافة في Claude Code، ويثبّت Bun وuv إذا لم يكونا موجودين، ويثبّت الاعتماديات.

> **لا تستخدم** `npm install -g claude-mem` وحده، لأنه يثبّت المكتبة فقط بدون تسجيل الإضافة.

### بديل من داخل Claude Code

```text
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

ثم أعد تشغيل Claude Code.

### التحقق

```bash
claude plugin list        # يجب أن ترى claude-mem@thedotmack بحالة enabled
npx claude-mem start      # تشغيل خدمة الذاكرة إذا لم تبدأ تلقائياً
```

افتح `http://127.0.0.1:37700` في المتصفح لمشاهدة الذاكرة وهي تُبنى مباشرة. الذاكرة تُحقن ابتداءً من **الجلسة الثانية** في نفس المشروع.

نصيحة: لإخفاء محتوى حساس من الذاكرة اكتبه داخل وسم `<private> ... </private>`.

---

## 4. Headroom (ضغط السياق وتوفير التوكنات)

**الفكرة ببساطة:** نتائج الأوامر وملفات البحث الطويلة تستهلك توكنات كثيرة. Headroom يجلس بين Claude Code والـ API ويضغط هذه النتائج، مع الاحتفاظ بالنسخة الأصلية محلياً إذا احتاجها النموذج.

### التثبيت

الطريقة الموصى بها (uv):

```bash
uv tool install --python 3.13 "headroom-ai[all]"
```

أو بـ pip:

```bash
pip install "headroom-ai[all]"
```

> `npm install headroom-ai` يثبّت مكتبة TypeScript فقط بدون أمر `headroom`. استخدم uv أو pip.

### التحقق

```bash
headroom --version
```

### طرق الاستخدام مع Claude Code (اختر واحدة)

**أ. التغليف (الأسهل):**

```bash
headroom wrap claude
```

يشغّل وكيلاً محلياً ويفتح Claude Code من خلاله. للتراجع: `headroom unwrap claude`

**ب. وكيل مستقل:**

```bash
# في طرفية أولى
headroom proxy --port 8787
# في طرفية ثانية
export ANTHROPIC_BASE_URL=http://127.0.0.1:8787
claude
```

**ج. خادم MCP:**

```bash
headroom mcp install
```

### مشاهدة التوفير

```bash
headroom stats
headroom dashboard
headroom doctor      # فحص أن كل شيء مضبوط
```

---

## 5. task-observer (مراقب المهام)

**الفكرة ببساطة:** مهارة من مشروع "One Skill to Rule Them All". تراقب جلسات العمل متعددة الخطوات، وتسجّل التصحيحات التي تعطيها لـ Claude والأنماط المتكررة، ثم تقترح تحويلها إلى مهارات قابلة لإعادة الاستخدام. لا تغيّر شيئاً بدون موافقتك.

### التثبيت

لكل المشاريع (عام):

```bash
npx skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g -a claude-code -y
```

لمشروع واحد فقط: احذف `-g` ونفّذ الأمر داخل مجلد المشروع.

### التحقق

```bash
ls ~/.claude/skills/task-observer/SKILL.md
```

### التفعيل (خطوة مهمة لا تنسها)

التثبيت وحده لا يكفي. يجب أن تخبر Claude Code أن يشغّل المهارة في بداية كل جلسة. أضف هذا السطر إلى ملف `CLAUDE.md` في مشروعك (أو `~/.claude/CLAUDE.md` لكل المشاريع):

```text
Before the first tool call of any session, invoke the task-observer skill
and execute its Session Start Protocol.
The task-observer workspace for this project is: /المسار/الكامل/للمشروع
```

النص الكامل للتفعيل موجود في `~/.claude/skills/task-observer/references/environments.md` تحت عنوان "The activation block".

**كيف تعرف أنه يعمل؟** بعد عدة جلسات عمل حقيقية يجب أن يظهر مجلد `skill-observations/observation-log/` في مساحة العمل. إذا لم يظهر، التفعيل لم يحدث.

---

## ملخص سريع للأوامر

```bash
# 1. Claude Code
curl -fsSL https://claude.ai/install.sh | bash

# 2. OmniRoute
npm install -g omniroute && INITIAL_PASSWORD='كلمة-سر' omniroute

# 3. claude-mem
npx claude-mem install

# 4. Headroom
uv tool install --python 3.13 "headroom-ai[all]"
headroom wrap claude

# 5. task-observer
npx skills add rebelytics/one-skill-to-rule-them-all --skill task-observer -g -a claude-code -y
```

## حل المشاكل الشائعة

- **`command not found` بعد التثبيت:** أغلق الطرفية وافتحها من جديد، أو نفّذ `source ~/.bashrc` (أو `~/.zshrc`).
- **خطأ نسخة Node:** ثبّت Node 24 LTS من nodejs.org، أو استخدم `nvm install 24`.
- **`uv: command not found`:** ثبّته بالأمر في قسم المتطلبات ثم أعد فتح الطرفية.
- **claude-mem لا يحقن الذاكرة:** الحقن يبدأ من الجلسة الثانية في نفس المشروع. تأكد أن الخدمة تعمل بـ `npx claude-mem start`.
- **OmniRoute نسيت كلمة السر:** نفّذ `omniroute-reset-password`.

## المصادر الرسمية

- Claude Code: https://code.claude.com/docs
- OmniRoute: https://github.com/diegosouzapw/OmniRoute
- claude-mem: https://github.com/thedotmack/claude-mem
- Headroom: https://github.com/chopratejas/headroom
- task-observer: https://github.com/rebelytics/one-skill-to-rule-them-all

---

## 6. Taste Skill (تصميم واجهات غير مملّة)

**الفكرة ببساطة:** مهارة من مشروع [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) تجعل Claude Code يصمم صفحات ويب وواجهات بذوق عالٍ (خطوط، ألوان، حركة، مسافات) بدل القوالب المتكررة. مناسبة لصفحات الهبوط والمواقع الشخصية وإعادة التصميم.

### التثبيت

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend -g -a claude-code -y
```

### التحقق

```bash
ls ~/.claude/skills/design-taste-frontend/SKILL.md
```

### الاستخدام

لا تحتاج تفعيلاً. تعمل تلقائياً عندما تطلب من Claude Code تصميم صفحة أو واجهة. لتأكيد استخدامها اكتب في طلبك: `use the design-taste-frontend skill`.

مهارات أخرى في نفس المستودع تُثبَّت بنفس الأمر مع تغيير الاسم بعد `--skill`: `minimalist-ui`، `industrial-brutalist-ui`، `redesign-existing-projects`، `image-to-code`.
