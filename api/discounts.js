const { readDiscounts } = require('../lib/github-store');

// Public read endpoint the widget fetches on load. CORS is wide open
// because the widget is pasted into Staffbase pages on arbitrary domains.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const formId = req.query.formId;
  const expectedFormId = process.env.STAFFBASE_FORM_ID;
  if (expectedFormId && formId && formId !== expectedFormId) {
    return res.status(200).json({
      discounts: [],
      warning: "formId query param does not match this deployment's STAFFBASE_FORM_ID",
    });
  }

  try {
    const { discounts } = await readDiscounts();
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    return res.status(200).json({ discounts });
  } catch (err) {
    console.error('Failed to read discounts', err);
    return res.status(500).json({ error: 'Failed to load discounts' });
  }
};
