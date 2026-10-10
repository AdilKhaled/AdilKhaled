# نصب OmniRoute

[OmniRoute](https://github.com/diegosouzapw/OmniRoute) یک گیت‌وی (Gateway) متن‌باز و self-hosted برای هوش مصنوعی است که صدها Provider را پشت یک API سازگار با OpenAI قرار می‌دهد، بین مدل‌ها fallback خودکار انجام می‌دهد و یک داشبورد وب دارد.

- داشبورد: `http://localhost:20128`
- آدرس API: `http://localhost:20128/v1`
- لایسنس: MIT

این پوشه شامل دو روش نصب است:

| روش | فایل | مناسب برای |
|---|---|---|
| Docker Compose (پیشنهادی) | `docker-compose.yml` | سرور، VPS، استفاده دائمی |
| npm | `install.sh` | لپ‌تاپ شخصی، تست سریع |

---

## روش ۱: Docker Compose (پیشنهادی)

**پیش‌نیاز:** Docker و Docker Compose نصب باشد.

```bash
cd omniroute
cp .env.example .env
# فایل .env را باز کنید و INITIAL_PASSWORD را به یک رمز قوی تغییر دهید
docker compose up -d
```

بررسی وضعیت:

```bash
docker compose logs -f omniroute
```

داده‌ها (دیتابیس SQLite، لاگ‌ها، بکاپ‌ها) در Volume به نام `omniroute-data` ذخیره می‌شوند و با ری‌استارت کانتینر از بین نمی‌روند.

به‌روزرسانی به آخرین نسخه:

```bash
docker compose pull
docker compose up -d
```

> **نکته امنیتی:** در `docker-compose.yml` پورت فقط روی `127.0.0.1` باز شده است. اگر می‌خواهید از خارج سرور به آن دسترسی داشته باشید، یک Reverse Proxy با HTTPS (مثل Caddy یا Nginx) جلوی آن بگذارید و پورت را مستقیم باز نکنید.

---

## روش ۲: نصب با npm

**پیش‌نیاز:** Node.js نسخه `22.22.2+` یا `24.x`. نسخه 23 پشتیبانی نمی‌شود.

```bash
cd omniroute
bash install.sh
```

اسکریپت نسخه Node را بررسی می‌کند، پکیج `omniroute` را به صورت global نصب می‌کند و دستور اجرا را نشان می‌دهد.

نصب دستی بدون اسکریپت:

```bash
npm install -g omniroute
INITIAL_PASSWORD='یک-رمز-قوی' omniroute
```

به صورت پیش‌فرض داده‌ها در `~/.omniroute/` ذخیره می‌شوند. برای تغییر مسیر، متغیر `DATA_DIR` را ست کنید.

---

## بعد از نصب (اولین اجرا)

1. مرورگر را باز کنید: `http://localhost:20128`
2. با رمزی که در `INITIAL_PASSWORD` گذاشتید وارد شوید. (اگر ست نکرده باشید، رمز پیش‌فرض `CHANGEME` است. حتماً از **Settings → Security** عوضش کنید.)
3. از منوی **Providers** حداقل یک Provider اضافه کنید (مثلاً OpenAI، Anthropic، Gemini یا Providerهای رایگان).
4. از **Dashboard → Endpoints** یک API Key بسازید و کپی کنید.
5. تست کنید:

```bash
curl http://localhost:20128/v1/models -H "Authorization: Bearer YOUR_KEY"
```

6. در ابزارهای خود (Cursor، Cline، Codex، Claude Code و ...) Base URL را روی `http://localhost:20128/v1` و API Key را روی کلید بالا تنظیم کنید.

---

## متغیرهای محیطی مهم

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `INITIAL_PASSWORD` | `CHANGEME` | رمز اولیه داشبورد. فقط در اولین اجرا استفاده می‌شود. |
| `PORT` | `20128` | پورت سرور |
| `DATA_DIR` | `~/.omniroute` (npm) / `/app/data` (Docker) | محل ذخیره دیتابیس و لاگ‌ها |
| `JWT_SECRET` | خودکار | کلید امضای Session. اگر خالی باشد در اولین اجرا تولید و ذخیره می‌شود. |
| `API_KEY_SECRET` | خودکار | کلید رمزنگاری API Keyها در دیتابیس |
| `OMNIROUTE_MEMORY_MB` | `1024` | حافظه Node داخل Docker. برای استفاده با Coding Agent مقدار `8192` پیشنهاد شده است. |

لیست کامل متغیرها در فایل `.env.example` داخل پکیج و در `docs/ENVIRONMENT.md` مخزن رسمی موجود است.

---

## رفع مشکل

- **خطای `EBADENGINE` یا هشدار نسخه Node:** Node را به `22.22.2+` یا `24.x` ارتقا دهید. اگر نمی‌توانید، دستور `omniroute runtime repair` را اجرا کنید.
- **خطای `better-sqlite3`:** دستور `npm rebuild better-sqlite3` یا `omniroute runtime repair` را اجرا کنید.
- **فراموشی رمز داشبورد:** دستور `omniroute-reset-password` را اجرا کنید (در Docker: `docker compose exec omniroute omniroute-reset-password`).
- **پورت 20128 اشغال است:** متغیر `PORT` را تغییر دهید و در Docker Compose مپینگ پورت را هم‌خوان کنید.
