const { readDiscounts, writeDiscounts } = require('../lib/github-store');
const { resolveCategory } = require('../lib/categories');

// Staffbase's Forms "Trigger URL" payload shape isn't publicly documented.
// Confirmed by inspecting a real submission (2026-09-02): the POST body is
//   { "values": "{\"_0\":\"...\",\"_1\":\"...\", ...}" }
// i.e. a JSON *string* under "values", keyed by the field's zero-based
// position in the form — not by label. FIELD_ORDER below assumes the form
// fields are added in exactly this order: Name, Address, Category,
// Discount Description, Phone, Website, Terms and Details, How to Redeem.
// If the form's field order ever changes, update FIELD_ORDER to match.
const FIELD_ORDER = ['name', 'address', 'category', 'description', 'phone', 'website', 'terms', 'redeem'];

// Fallback for label-keyed shapes, in case a different form/integration
// sends field data by name instead of position.
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

function extractFromValuesBlob(body) {
  if (typeof body?.values !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(body.values);
  } catch (e) {
    return null;
  }
  const result = {};
  FIELD_ORDER.forEach((field, i) => {
    const value = parsed['_' + i];
    if (value !== undefined && value !== '') result[field] = value;
  });
  return result;
}

function extractFromLabeledShape(body) {
  const candidates = [body, body?.data, body?.fields, body?.answers, body?.submission, body?.formData].filter(Boolean);

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

function extractFields(body) {
  const fromValues = extractFromValuesBlob(body);
  if (fromValues && fromValues.name && fromValues.description) return fromValues;
  return extractFromLabeledShape(body || {});
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
