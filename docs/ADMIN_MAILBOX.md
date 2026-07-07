# Admin Mailbox (Inbox)

Read and reply to emails sent to **contact@tvmusicstore.com** directly from
`/admin → Inbox`. Replies go out from contact@tvmusicstore.com via Resend, and
every message (in and out) is stored per person in D1.

## How it works

Cloudflare **Pages Functions cannot receive email**, so inbound mail is handled
by a small, separate **Email Worker** that writes into the *same* D1 database the
site uses:

```
customer emails contact@  ─▶  Cloudflare Email Routing  ─▶  tvms-mail-worker
                                                              │ (writes to D1)
                                                              ▼
   /admin → Inbox  ◀──  Pages Functions (/api/admin/mail)  ◀── mail_threads / mail_messages
        │
        └─ Reply ─▶ Resend (from contact@tvmusicstore.com) ─▶ customer
```

- Code: `mail-worker/` (the Worker), `functions/api/admin/mail.ts` (admin read/reply),
  `functions/api/_mail.ts` (shared D1 helpers), `src/components/AdminInbox.tsx` (UI).
- Tables `mail_threads` + `mail_messages` are in `migrations/0001_init.sql` and are
  also created lazily, so they self-heal on first use.
- One **thread per correspondent** (their email address). If the sender matches a
  registered user, the conversation header shows their plan / purchases / downloads.

## One-time setup (owner) — detailed

### Step 1 — Deploy the Email Worker

The Worker is what actually receives the mail. It lives in `mail-worker/` and is
deployed **separately** from the site (not via deploy.bat).

1. Open a terminal in the project (Command Prompt or PowerShell on Windows) and go
   into the worker folder:
   ```bash
   cd mail-worker
   npm install
   ```
2. Connect Wrangler to your Cloudflare account (opens a browser to approve — first
   time only):
   ```bash
   npx wrangler login
   ```
3. Get the D1 database id (copy the id shown next to `tvmusicstore-db`):
   ```bash
   npx wrangler d1 list
   ```
4. Open `mail-worker/wrangler.toml` and paste that id in place of
   `REPLACE_WITH_YOUR_D1_DATABASE_ID`. Save.
5. Deploy:
   ```bash
   npx wrangler deploy
   ```
   Success looks like "Uploaded tvms-mail-worker" / "Deployed tvms-mail-worker".
   The Worker has no web address — it only runs when an email arrives.

`FORWARD_TO` in wrangler.toml (default `tvmusicstore@gmail.com`) keeps a backup copy
in Gmail. It must be a **verified destination** in Email Routing (yours already is,
since contact@ forwards there today). Clear it to disable the Gmail copy.

### Step 2 — Route contact@ to the Worker

1. Cloudflare dashboard → pick the domain **tvmusicstore.com**.
2. Left sidebar → **Email** → **Email Routing** → tab **Routing rules**.
3. Find the existing rule for **contact@tvmusicstore.com** (today it forwards to
   Gmail) and **Edit** it — or **Create address** if it isn't there:
   - Custom address: `contact@tvmusicstore.com`
   - Action: **Send to a Worker** → select **tvms-mail-worker**
   - Save.

   Note: a routing rule has only ONE action, so contact@ now goes to the Worker
   instead of straight to Gmail — but the Worker re-forwards a copy to Gmail
   (`FORWARD_TO`), so you still get it there.
4. Test: from any personal email, send a message to contact@tvmusicstore.com, wait
   ~1 minute, open **/admin → Inbox → Refresh**. It should appear (and still land in
   Gmail). If it doesn't, run `npx wrangler tail` inside `mail-worker/` and send
   again to watch the Worker logs.

### Step 3 — Turn on replies (Resend root domain)

Reading works after steps 1–2. **Replying** sends from contact@tvmusicstore.com,
which Resend only allows once the **root domain is verified**.

1. Log into **resend.com** → **Domains**. You already have `e.tvmusicstore.com`;
   now click **Add Domain** and enter **tvmusicstore.com**.
2. Resend shows a few DNS records (SPF/TXT, DKIM). Add each one in Cloudflare →
   **DNS** for tvmusicstore.com (Type / Name / Value exactly as Resend gives).
   - ⚠️ Do **not** touch or delete the existing **MX** records — those belong to
     Email Routing and are what receive your mail. Resend's records are TXT/CNAME
     (and any MX it needs sits on a `send`-style subdomain), so they don't clash.
3. Back in Resend, click **Verify**. When it flips to **Verified** (minutes to ~an
   hour) replies will send. `RESEND_API_KEY` is already set on the site — no code or
   env change needed.
4. Test: open a thread in **/admin → Inbox**, type a reply, **Send**. The customer
   receives it from contact@tvmusicstore.com. If it errors, the toast shows the
   Resend reason (almost always "domain not verified yet").

## Notes
- Reading/threads work as soon as steps 1–2 are done; replying needs step 3.
- Archive hides a thread; Delete removes it and its messages permanently.
- Larger volume later: add search/labels, or attachments (not stored yet — only
  the text body is kept).
