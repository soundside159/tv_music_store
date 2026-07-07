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

## One-time setup (owner)

### 1. Deploy the Email Worker
```bash
cd mail-worker
#  put your D1 id into wrangler.toml  (find it with:  npx wrangler d1 list)
npm install
npx wrangler deploy
```
`wrangler.toml` binds the D1 database (variable `DB`) and has an optional
`FORWARD_TO` var (a Gmail backup copy — must be a verified Email Routing
destination, else forwarding is silently skipped).

### 2. Point contact@ at the Worker
Cloudflare dashboard → your domain → **Email → Email Routing → Routing rules**:
- Custom address `contact@tvmusicstore.com` → Action **Send to a Worker** →
  `tvms-mail-worker`.
- (Optional) keep a catch-all/forward to Gmail as before — the Worker also forwards
  a copy when `FORWARD_TO` is set.

### 3. Enable replies (Resend)
Replies send **from contact@tvmusicstore.com**, so the **root domain
tvmusicstore.com must be verified in Resend** (Resend → Domains → Add
`tvmusicstore.com` → add the DNS records). Until that's done, reading works but
sending a reply fails with the Resend error shown in a toast. `RESEND_API_KEY`
is already set for the site.

## Notes
- Reading/threads work as soon as steps 1–2 are done; replying needs step 3.
- Archive hides a thread; Delete removes it and its messages permanently.
- Larger volume later: add search/labels, or attachments (not stored yet — only
  the text body is kept).
