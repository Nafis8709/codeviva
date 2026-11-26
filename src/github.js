// Loading code from a public GitHub repository.
//
// listRepo(url)       -> the repo's code files, with a suggested selection
//                        that fits the viva's character budget (1 API call)
// fetchFiles(...)     -> the contents of the chosen files, read from
//                        raw.githubusercontent.com (a fixed host: the server
//                        never fetches a URL the user typed)
//
// Set GITHUB_TOKEN in .env to raise GitHub's rate limit for repo listing.

const { InputError, MAX_TOTAL_CHARS } = require('./code');

const MAX_FILES = 20;
const MAX_FILE_BYTES = 100000;
const TIMEOUT_MS = 15000;

const CODE_EXTENSIONS = [
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'java', 'kt', 'kts', 'scala', 'go', 'rs', 'swift', 'm', 'mm',
  'py', 'rb', 'php', 'pl', 'lua', 'r', 'jl', 'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'fs', 'vb',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'vue', 'svelte', 'sql', 'sh', 'bash', 'ps1', 'asm', 's',
];
// Readable but rarely what a viva is about: listed, not preselected.
const OTHER_TEXT_EXTENSIONS = ['html', 'css', 'scss', 'json', 'yml', 'yaml', 'toml', 'xml', 'gradle', 'md', 'txt', 'ini', 'cfg', 'mk', 'cmake'];
const OTHER_TEXT_NAMES = ['makefile', 'dockerfile', 'cmakelists.txt'];

const SKIPPED_FOLDERS = [
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'vendor', 'venv', '.venv', 'env',
  '__pycache__', '.idea', '.vscode', '.gradle', '.next', 'coverage', '.mvn', 'Pods', '.dart_tool',
];
const SKIPPED_FILES = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock', 'Cargo.lock', 'composer.lock', 'Gemfile.lock', 'go.sum'];

const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

// GitHub owner/repo names: letters, digits, - _ . — but never just dots.
function isValidName(name) {
  return NAME_PATTERN.test(String(name)) && !/^\.+$/.test(String(name));
}

class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

// Accepts https://github.com/owner/repo, .../tree/branch/sub/folder,
// github.com/owner/repo.git, or plain owner/repo.
function parseRepoUrl(input) {
  const text = String(input || '').trim().replace(/\/+$/, '').replace(/\.git$/, '');
  let rest = text;
  const match = text.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (match) {
    rest = match[1];
  } else if (/^https?:\/\//i.test(text) || text.includes('.com')) {
    throw new InputError('That is not a GitHub link. Paste a link like https://github.com/owner/repo.');
  }
  const parts = rest.split('/').filter(Boolean);
  if (parts.length < 2 || !isValidName(parts[0]) || !isValidName(parts[1])) {
    throw new InputError('Paste a GitHub repository link like https://github.com/owner/repo.');
  }
  const result = { owner: parts[0], repo: parts[1], branch: null, folder: '' };
  if (parts[2] === 'tree' && parts[3]) {
    result.branch = parts[3];
    result.folder = parts.slice(4).join('/');
  }
  return result;
}

function extensionOf(path) {
  const name = path.split('/').pop().toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1);
}

// test/, tests/, __tests__/ folders; test_x.py, x_test.go, x.test.js, x.spec.ts; FooTest.java
function looksLikeTest(path) {
  const lower = path.toLowerCase();
  if (/(^|\/)(tests?|__tests__|spec|specs)\//.test(lower)) {
    return true;
  }
  const name = lower.split('/').pop();
  return /(^|[._-])(test|spec)[._-]/.test(name)
    || /[._-](test|spec)\.[a-z]+$/.test(name)
    || /^[a-z0-9]+test\.(java|kt|scala|cs)$/.test(name);
}

const SOURCE_FOLDERS = ['src', 'lib', 'app', 'backend', 'server', 'main', 'source', 'core', 'pkg', 'cmd', 'internal'];

// 0 for files under a typical source folder, 1 for anything else.
function sourceFolderRank(path) {
  const folders = path.split('/').slice(0, -1);
  for (const folder of folders) {
    if (SOURCE_FOLDERS.includes(folder.toLowerCase())) {
      return 0;
    }
  }
  return 1;
}

// Decides whether a file from the tree is shown, and whether it is preselected.
function classify(path, size) {
  const segments = path.split('/');
  const name = segments[segments.length - 1];
  for (const segment of segments.slice(0, -1)) {
    if (SKIPPED_FOLDERS.includes(segment) || segment.startsWith('.')) {
      return null; // dependencies, build output, and hidden folders (.github, .vscode, …)
    }
  }
  if (SKIPPED_FILES.includes(name) || /\.min\.(js|css)$/i.test(name) || size > MAX_FILE_BYTES || size === 0) {
    return null;
  }
  const extension = extensionOf(path);
  if (CODE_EXTENSIONS.includes(extension)) {
    return { kind: looksLikeTest(path) ? 'test' : 'code' };
  }
  if (OTHER_TEXT_EXTENSIONS.includes(extension) || OTHER_TEXT_NAMES.includes(name.toLowerCase())) {
    return { kind: 'other' };
  }
  return null;
}

function createGitHubClient({ fetchImpl = fetch, token = process.env.GITHUB_TOKEN } = {}) {
  async function getJson(url) {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CodeViva' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    let response;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new GitHubError('Could not reach GitHub. Check your internet connection and try again.', 504);
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 404) {
      throw new GitHubError('That repository was not found. It may be private, renamed, or the link may have a typo — CodeViva can only read public repositories.', 404);
    }
    if (response.status === 403 || response.status === 429) {
      const remaining = response.headers && response.headers.get && response.headers.get('x-ratelimit-remaining');
      if (remaining === '0' || response.status === 429) {
        throw new GitHubError('GitHub\'s rate limit for this server is used up for now. Try again in a few minutes, or load the files directly.', 429);
      }
      throw new GitHubError('GitHub refused the request (403). Try again later, or load the files directly.', 502);
    }
    if (!response.ok) {
      throw new GitHubError(`GitHub answered with an error (${response.status}). Try again, or load the files directly.`, 502);
    }
    return data;
  }

  async function listRepo(url) {
    const target = parseRepoUrl(url);
    let branch = target.branch;
    if (!branch) {
      const info = await getJson(`https://api.github.com/repos/${target.owner}/${target.repo}`);
      branch = info.default_branch || 'main';
    }
    const tree = await getJson(`https://api.github.com/repos/${target.owner}/${target.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const prefix = target.folder ? `${target.folder}/` : '';

    const files = [];
    let skipped = 0;
    for (const entry of tree.tree || []) {
      if (entry.type !== 'blob' || (prefix && !entry.path.startsWith(prefix))) {
        continue;
      }
      const kind = classify(entry.path, entry.size || 0);
      if (!kind) {
        skipped++;
        continue;
      }
      files.push({ path: entry.path, size: entry.size || 0, kind: kind.kind, suggested: false });
    }

    // Preselect source files (not tests or config) until the budget is full,
    // files in source folders (src/, lib/, app/, …) first.
    const candidates = files.filter((file) => file.kind === 'code');
    candidates.sort((a, b) => sourceFolderRank(a.path) - sourceFolderRank(b.path));
    let budget = MAX_TOTAL_CHARS;
    let chosen = 0;
    for (const file of candidates) {
      if (file.size <= budget && chosen < MAX_FILES) {
        file.suggested = true;
        budget -= file.size;
        chosen++;
      }
    }

    // Show source code first, then tests, then other text files.
    const kindOrder = { code: 0, test: 1, other: 2 };
    files.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.path.localeCompare(b.path));

    return {
      owner: target.owner,
      repo: target.repo,
      branch,
      folder: target.folder,
      files,
      skipped,
      truncated: Boolean(tree.truncated),
      budget: MAX_TOTAL_CHARS,
      maxFiles: MAX_FILES,
    };
  }

  async function fetchFiles({ owner, repo, branch, paths }) {
    if (!isValidName(owner) || !isValidName(repo) || !branch || /\.\./.test(branch)) {
      throw new InputError('Unknown repository. Load the repository again.');
    }
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new InputError('Choose at least one file.');
    }
    if (paths.length > MAX_FILES) {
      throw new InputError(`Choose at most ${MAX_FILES} files — just the ones your viva covers.`);
    }
    const files = [];
    let total = 0;
    for (const path of paths) {
      if (typeof path !== 'string' || path.includes('..') || path.startsWith('/') || path.length > 300) {
        throw new InputError('One of the chosen file paths is not valid.');
      }
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
      let response;
      try {
        response = await fetchImpl(url, { headers: { 'User-Agent': 'CodeViva' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (error) {
        throw new GitHubError('Could not reach GitHub while reading the files. Try again.', 504);
      }
      if (!response.ok) {
        throw new GitHubError(`Could not read ${path} from GitHub (${response.status}). Load the repository again.`, 502);
      }
      const content = (await response.text()).replace(/\r\n?/g, '\n');
      if (content.slice(0, 2000).includes('\u0000')) {
        continue; // binary after all
      }
      total += content.length;
      if (total > MAX_TOTAL_CHARS) {
        throw new InputError(`The chosen files add up to more than ${MAX_TOTAL_CHARS.toLocaleString('en-US')} characters. Untick a few and try again.`);
      }
      files.push({ name: path, content });
    }
    return files;
  }

  return { listRepo, fetchFiles };
}

module.exports = { createGitHubClient, parseRepoUrl, classify, GitHubError, MAX_FILES };
