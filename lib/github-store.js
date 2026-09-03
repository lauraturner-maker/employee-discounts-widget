const GITHUB_API = 'https://api.github.com';
const DATA_PATH = 'data/discounts.json';

function repoSlug() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) throw new Error('GITHUB_REPO environment variable is not set (expected "owner/repo")');
  return repo;
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN environment variable is not set');
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} ${res.statusText}: ${body}`);
  }
  return res.json();
}

// Reads data/discounts.json straight from the repo so the API always
// reflects the latest committed data, with no extra database to run.
async function readDiscounts() {
  const repo = repoSlug();
  const branch = process.env.GITHUB_BRANCH || 'main';
  const file = await githubRequest(`/repos/${repo}/contents/${DATA_PATH}?ref=${branch}`);
  const content = Buffer.from(file.content, 'base64').toString('utf-8');
  return { discounts: JSON.parse(content), sha: file.sha };
}

// Commits the updated discount list back to the repo. `sha` must be the
// blob sha returned by readDiscounts(), so GitHub rejects the write if
// the file changed in between (avoids clobbering a concurrent submission).
async function writeDiscounts(discounts, sha, message) {
  const repo = repoSlug();
  const branch = process.env.GITHUB_BRANCH || 'main';
  const content = Buffer.from(JSON.stringify(discounts, null, 2) + '\n', 'utf-8').toString('base64');
  return githubRequest(`/repos/${repo}/contents/${DATA_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({ message, content, sha, branch }),
  });
}

module.exports = { readDiscounts, writeDiscounts };
