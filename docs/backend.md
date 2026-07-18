# 後台與資料庫設定

這個專案的公開合作表單採用：

```text
Astro Static
→ Contact.astro
→ POST /api/inquiries
→ Cloudflare Pages Functions
→ Supabase public.collaboration_requests
```

正式啟用前需要在 Cloudflare 完成以下設定：

1. 在 Supabase 建立 `public.collaboration_requests` 資料表。
2. 在 Cloudflare Pages 專案設定環境變數：
   - `SUPABASE_URL`
   - `SUPABASE_SECRET_KEY`
3. `SUPABASE_SECRET_KEY` 必須設為 Secret，不要使用 `PUBLIC_` 前綴。
4. 部署後到首頁底部送出測試資料，再到 Supabase Table Editor 確認新增資料。

公開端點：

- `POST /api/inquiries`：首頁聯絡表單送出資料，唯一公開寫入入口。

公開表單預期資料表：

```sql
create table if not exists public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  contact_method text not null,
  contact_account text not null,

  collaboration_type text not null,
  preferred_date text,
  description text,

  consent boolean not null default false,

  status text not null default 'new'
    check (status in ('new', 'reviewing', 'contacted', 'closed')),

  created_at timestamptz not null default now()
);
```

目前管理端點仍是舊 D1 架構：

- `GET /api/admin/inquiries`
- `PATCH /api/admin/inquiries/:id`

因此公開表單寫入 Supabase 後，現有 `/admin/` 後台不會自動看到 Supabase 新資料。若要讓後台讀取新資料，需要另外把管理 API 從 D1 改成 Supabase。
