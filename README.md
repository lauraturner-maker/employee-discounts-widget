# Employee Discounts Widget — Staffbase Forms Integration

This wires the [Employee Discounts widget](https://staffbase.github.io/solutions-monorepo/employee-discounts.html)
up to a **Staffbase Form**, so that every form submission automatically
creates a new discount card.

## How it works

```
Staffbase Form submission
        │  (Studio → Forms → your form → Workflow tab → Trigger URL)
        ▼
POST  /api/webhook   (Vercel serverless function)
        │  maps the submitted fields, appends a card,
        │  commits data/discounts.json back to this repo via the GitHub API
        ▼
GET   /api/discounts  (Vercel serverless function)
        │  reads data/discounts.json, serves it as JSON (CORS open)
        ▼
widget/employee-discounts.html
   (pasted into a Staffbase Custom HTML block — fetches /api/discounts on load)
```

`data/discounts.json` is the single source of truth and starts out seeded
with the original 19 demo discounts.

**Note on the webhook payload:** Staffbase's public docs describe how to
*set* the Trigger URL (see [Setting up an Automated Workflow With the Forms
Plugin](https://support.staffbase.com/hc/en-us/articles/360017377559)) but
don't publish the exact JSON shape it POSTs. `api/webhook.js` tries several
common shapes and matches fields by label (see `FIELD_ALIASES`). It also
logs the raw payload on every request — after your first real test
submission, check the Vercel function logs and add an alias in
`api/webhook.js` if a field isn't being picked up.

## Required form fields

Build the Staffbase Form with these fields (exact labels don't matter,
`api/webhook.js` matches on common variants — see `FIELD_ALIASES`):

| Field | Notes |
|---|---|
| Name | Business/merchant name |
| Address | |
| Category | **Recommend a dropdown** with these exact options so they map cleanly onto the widget's fixed categories: Food, Fitness & Recreation, Misc. Goods & Services, Household Furnishings, Moving Companies, Cell Phones, Travel, Automotive, Computers, Hardware & Home Improvement, Apartments, Paint & Retail. Anything that doesn't match falls back to "Misc. Goods & Services". |
| Discount Description | Shown on the card; also truncated to ~40 characters for the small green badge, since the form has no separate short-teaser field |
| Phone | |
| Website | |
| Terms and Details | Shown in the card's detail modal |
| How to Redeem | Shown in the card's detail modal |

## Setup

1. **Generate a GitHub token** (you do this — don't hand tokens to an
   assistant): a fine-grained Personal Access Token scoped to just this
   repo, with **Contents: Read and write** permission.
   https://github.com/settings/personal-access-tokens/new

2. **Import this repo into Vercel** (vercel.com → Add New → Project →
   select `lauraturner-maker/employee-discounts-widget`). Framework
   preset: "Other" (no build step needed).

3. **Set Vercel project environment variables** (Project → Settings →
   Environment Variables):
   - `GITHUB_TOKEN` — the token from step 1
   - `GITHUB_REPO` — `lauraturner-maker/employee-discounts-widget`
   - `GITHUB_BRANCH` — `main`
   - `STAFFBASE_FORM_ID` — the ID of the Staffbase form (visible in the
     Studio URL when editing the form)
   - `WEBHOOK_SECRET` — any random string you generate, used to keep the
     webhook endpoint from accepting anonymous internet POSTs

4. **Deploy**, then note your app's URL, e.g.
   `https://employee-discounts-widget.vercel.app`.

5. **In Staffbase Studio:** Forms → your form → **Workflow** tab → Trigger
   URL:
   ```
   https://employee-discounts-widget.vercel.app/api/webhook?formId=<STAFFBASE_FORM_ID>&secret=<WEBHOOK_SECRET>
   ```

6. **Paste the widget:** copy the contents of
   `widget/employee-discounts.html` into a Custom HTML block in Staffbase,
   and edit the `CONFIG` block near the top of the `<script>`:
   ```js
   const CONFIG = {
       formId: '<STAFFBASE_FORM_ID>',
       discountsApiUrl: 'https://employee-discounts-widget.vercel.app/api/discounts',
   };
   ```

7. **Test:** submit the form, then check the Vercel function logs for
   `/api/webhook` to confirm the fields were parsed correctly, and reload
   the widget to see the new card appear.

## Local files

- `widget/employee-discounts.html` — the widget, paste this into Staffbase
- `public/index.html` — same file, served as a static preview page by
  Vercel at your app's root URL (handy for checking the widget renders
  correctly without a Staffbase page around it — add `?preview=1` to skip
  the usage-counter beacon)
- `data/discounts.json` — the live data store, updated by `/api/webhook`
- `api/webhook.js`, `api/discounts.js`, `lib/` — the serverless functions
