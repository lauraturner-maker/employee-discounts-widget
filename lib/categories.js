const CATEGORIES = [
  { key: 'food', label: 'Food', aliases: ['food', 'food & dining', 'dining'] },
  { key: 'fitness', label: 'Fitness & Recreation', aliases: ['fitness', 'fitness & recreation', 'recreation'] },
  { key: 'misc', label: 'Misc. Goods & Services', aliases: ['misc', 'misc. goods & services', 'misc goods & services', 'goods & services'] },
  { key: 'household', label: 'Household Furnishings', aliases: ['household', 'household furnishings', 'furnishings'] },
  { key: 'moving', label: 'Moving Companies', aliases: ['moving', 'moving companies'] },
  { key: 'cell', label: 'Cell Phones', aliases: ['cell', 'cell phones', 'mobile', 'phones'] },
  { key: 'travel', label: 'Travel', aliases: ['travel'] },
  { key: 'auto', label: 'Automotive', aliases: ['auto', 'automotive'] },
  { key: 'computers', label: 'Computers', aliases: ['computers', 'computer'] },
  { key: 'hardware', label: 'Hardware & Home Improvement', aliases: ['hardware', 'hardware & home improvement', 'home improvement'] },
  { key: 'apartments', label: 'Apartments', aliases: ['apartments', 'apartment'] },
  { key: 'paint', label: 'Paint & Retail', aliases: ['paint', 'paint & retail', 'retail'] },
];

// Matches a free-text Category value submitted through the Staffbase form
// against the widget's fixed 12-category taxonomy. Falls back to 'misc'
// so a typo'd or missing category never breaks ingestion.
function resolveCategory(rawValue) {
  if (!rawValue) return 'misc';
  const norm = String(rawValue).trim().toLowerCase();
  const match = CATEGORIES.find(
    (c) => c.key === norm || c.label.toLowerCase() === norm || c.aliases.includes(norm)
  );
  return match ? match.key : 'misc';
}

module.exports = { CATEGORIES, resolveCategory };
