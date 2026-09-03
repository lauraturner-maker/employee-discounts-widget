const { readDiscounts, writeDiscounts } = require('../lib/github-store');
const { resolveCategory } = require('../lib/categories');

// Staffbase's Forms "Trigger URL" payload shape isn't publicly documented,
// so this accepts several common shapes and matches fields by label. Check
// the Vercel function logs after a real submission (logged below) and add
// aliases here if a field isn't being picked up.
const FIELD_ALIASES = {
  name: ['name', 'business name', 'shop name', 'merchant', 'company'],
  address: ['address', 'location', 'business address'],
  category: ['category', 'discount category'],
  description: ['discount description', 'description', 'discount', 'blurb'],
  phone: ['phone', 'phone number', 'contact phone'],
  website: ['website', 'url', 'web site'],
  terms: ['terms and details', 'terms & details', 'terms', 'details'],
  redeem: ['how to redeem', 'redeem', 'redemption instructions'],
};

function normalizeKey(k) {
  return String(k).trim().toLowerCase().replace(/\s+/g, ' ');
}

function extractFields(body) {
  const candidates = [body, body?.data, body?.fields, body?.answers, body?.submission, body?.formData, body?.values].filter(
    Boolean
  );

  const flat = {};
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        const label = entry?.label ?? entry?.name ?? entry?.key ?? entry?.question;
        const value = entry?.value ?? entry?.answer ?? entry?.response;
        if (label !== undefined) flat[normalizeKey(label)] = value;
      }
    } else if (candidate && typeof candidate === 'object') {
      for (const [key, value] of Object.entries(candidate)) {
        flat[normalizeKey(key)] = value;
      }
    }
  }

  const result = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (flat[alias] !== undefined && flat[alias] !== '') {
        result[field] = flat[alias];
        break;
      }
    }
  }
  return result;
}

function truncate(text, max) {
  if (!text) return '';
  const s = String(text);
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Invalid or missing secret' });
  }

  const expectedFormId = process.env.STAFFBASE_FORM_ID;
  if (expectedFormId && req.query.formId && req.query.formId !== expectedFormId) {
    return res.status(403).json({ error: "formId query param does not match this webhook's configured form" });
  }

  console.log('Incoming Staffbase forms webhook payload:', JSON.stringify(req.body));

  const fields = extractFields(req.body || {});
  if (!fields.name || !fields.description) {
    return res.status(422).json({
      error:
        'Could not find required fields (Name, Discount Description) in the payload. Check the Vercel function logs for the raw payload shape and add aliases in api/webhook.js if needed.',
      parsed: fields,
    });
  }

  const newDiscount = {
    name: fields.name,
    category: resolveCategory(fields.category),
    address: fields.address || '—',
    phone: fields.phone || '—',
    website: fields.website || '—',
    highlight: truncate(fields.description, 40),
    blurb: fields.description,
    details: fields.terms || '',
    redeem: fields.redeem || '',
  };

  // Retry once on a sha mismatch (a second submission landing between our
  // read and write) rather than dropping the card silently.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { discounts, sha } = await readDiscounts();
      const nextId = discounts.reduce((max, d) => Math.max(max, d.id), 0) + 1;
      const record = { id: nextId, ...newDiscount };
      discounts.push(record);
      await writeDiscounts(discounts, sha, `Add discount: ${record.name} (via Staffbase Forms webhook)`);
      return res.status(200).json({ ok: true, discount: record });
    } catch (err) {
      if (attempt === 1) {
        console.error('Failed to save discount', err);
        return res.status(500).json({ error: 'Failed to save discount' });
      }
    }
  }
};
