// Loading a public GitHub repository, against a fake GitHub.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createGitHubClient, parseRepoUrl, classify } = require('../src/github');
const { createApp } = require('../server');
const demo = require('../src/examiners/demoExaminer');

function reply(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] || null },
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const TREE = {
  truncated: false,
  tree: [
    { type: 'blob', path: 'README.md', size: 900 },
    { type: 'blob', path: 'package-lock.json', size: 40000 },
    { type: 'blob', path: 'node_modules/express/index.js', size: 500 },
    { type: 'blob', path: 'src/server.js', size: 3000 },
    { type: 'blob', path: 'src/latest.py', size: 1200 },
    { type: 'blob', path: 'src/big.js', size: 58000 },
    { type: 'blob', path: 'src/app.min.js', size: 9000 },
    { type: 'blob', path: 'test/server.test.js', size: 2000 },
    { type: 'blob', path: 'src/main/java/QueueTest.java', size: 800 },
    { type: 'blob', path: 'logo.png', size: 5000 },
    { type: 'tree', path: 'src', size: 0 },
  ],
};

function fakeGitHub(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    for (const [pattern, response] of routes) {
      if (url.includes(pattern)) {
        return typeof response === 'function' ? response(url) : response;
      }
    }
    return reply(404, { message: 'Not Found' });
  };
  return { fetchImpl, calls };
}

test('repository links in common shapes are understood', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/Nafis8709/codeviva'), { owner: 'Nafis8709', repo: 'codeviva', branch: null, folder: '' });
  assert.deepEqual(parseRepoUrl('github.com/a/b.git/'), { owner: 'a', repo: 'b', branch: null, folder: '' });
  assert.deepEqual(parseRepoUrl('a/b'), { owner: 'a', repo: 'b', branch: null, folder: '' });
  assert.deepEqual(parseRepoUrl('https://github.com/a/b/tree/dev/backend/app'), { owner: 'a', repo: 'b', branch: 'dev', folder: 'backend/app' });
  assert.throws(() => parseRepoUrl('https://gitlab.com/a/b'), /not a GitHub link/);
  assert.throws(() => parseRepoUrl('just-a-word'), /owner\/repo/);
  assert.throws(() => parseRepoUrl('https://github.com/a/../../etc'), /owner\/repo/);
});

test('files are classified: code, tests, other text; dependencies, lockfiles and binaries are skipped', () => {
  assert.equal(classify('src/server.js', 100).kind, 'code');
  assert.equal(classify('src/latest.py', 100).kind, 'code');
  assert.equal(classify('test/server.test.js', 100).kind, 'test');
  assert.equal(classify('src/QueueTest.java', 100).kind, 'test');
  assert.equal(classify('backend/tests/test_courses.py', 100).kind, 'test');
  assert.equal(classify('README.md', 100).kind, 'other');
  assert.equal(classify('node_modules/x/index.js', 100), null);
  assert.equal(classify('package-lock.json', 100), null);
  assert.equal(classify('logo.png', 100), null);
  assert.equal(classify('app.min.js', 100), null);
  assert.equal(classify('huge.c', 200000), null);
});

test('listing preselects source files within the 60,000-character budget', async () => {
  const github = fakeGitHub([
    ['/git/trees/main', reply(200, TREE)],
    ['api.github.com/repos/a/b', reply(200, { default_branch: 'main' })],
  ]);
  const list = await createGitHubClient({ fetchImpl: github.fetchImpl, token: '' }).listRepo('https://github.com/a/b');
  assert.equal(list.branch, 'main');
  const byPath = Object.fromEntries(list.files.map((f) => [f.path, f]));
  assert.deepEqual(Object.keys(byPath).sort(), ['README.md', 'src/big.js', 'src/latest.py', 'src/main/java/QueueTest.java', 'src/server.js', 'test/server.test.js']);
  assert.equal(byPath['src/server.js'].suggested, true);
  assert.equal(byPath['src/latest.py'].suggested, true);
  assert.equal(byPath['src/big.js'].suggested, false, 'would go over the budget');
  assert.equal(byPath['test/server.test.js'].suggested, false);
  assert.equal(byPath['README.md'].suggested, false);
  assert.equal(list.skipped, 4);
});

test('a folder link lists only that folder, without an extra API call for the branch', async () => {
  const github = fakeGitHub([['/git/trees/dev', reply(200, TREE)]]);
  const list = await createGitHubClient({ fetchImpl: github.fetchImpl, token: '' }).listRepo('https://github.com/a/b/tree/dev/src');
  assert.equal(github.calls.length, 1);
  assert.ok(list.files.every((f) => f.path.startsWith('src/')));
});

test('private or missing repositories and rate limits give clear, different messages', async () => {
  const missing = createGitHubClient({ fetchImpl: fakeGitHub([]).fetchImpl, token: '' });
  await assert.rejects(missing.listRepo('a/private-repo'), (error) => error.status === 404 && /private/.test(error.message));

  const limited = createGitHubClient({ fetchImpl: fakeGitHub([['api.github.com', reply(403, { message: 'rate limit' }, { 'x-ratelimit-remaining': '0' })]]).fetchImpl, token: '' });
  await assert.rejects(limited.listRepo('a/b'), (error) => error.status === 429 && /rate limit/.test(error.message));

  const offline = createGitHubClient({ fetchImpl: async () => { throw new Error('ENOTFOUND'); }, token: '' });
  await assert.rejects(offline.listRepo('a/b'), (error) => error.status === 504 && /internet/.test(error.message));
});

test('a token, when set, is sent to the API', async () => {
  const github = fakeGitHub([['/git/trees/', reply(200, TREE)], ['api.github.com/repos/a/b', reply(200, { default_branch: 'main' })]]);
  await createGitHubClient({ fetchImpl: github.fetchImpl, token: 'secret' }).listRepo('a/b');
  assert.equal(github.calls[0].init.headers.Authorization, 'Bearer secret');
});

test('chosen files are read from raw.githubusercontent.com only, with path checks and the budget', async () => {
  const github = fakeGitHub([['raw.githubusercontent.com', (url) => reply(200, `// ${url.split('/').pop()}\r\nint x;`)]]);
  const client = createGitHubClient({ fetchImpl: github.fetchImpl, token: '' });
  const files = await client.fetchFiles({ owner: 'a', repo: 'b', branch: 'main', paths: ['src/server.js', 'src/my file.c'] });
  assert.deepEqual(files.map((f) => f.name), ['src/server.js', 'src/my file.c']);
  assert.equal(files[0].content, '// server.js\nint x;');
  assert.ok(github.calls.every((c) => c.url.startsWith('https://raw.githubusercontent.com/a/b/main/')));
  assert.match(github.calls[1].url, /my%20file\.c$/);

  await assert.rejects(client.fetchFiles({ owner: 'a', repo: 'b', branch: 'main', paths: ['../../etc/passwd'] }), /not valid/);
  await assert.rejects(client.fetchFiles({ owner: 'evil.com/x', repo: 'b', branch: 'main', paths: ['a.c'] }), /Unknown repository/);
  await assert.rejects(client.fetchFiles({ owner: 'a', repo: 'b', branch: 'main', paths: [] }), /at least one/);

  const huge = createGitHubClient({ fetchImpl: fakeGitHub([['raw.', reply(200, 'x'.repeat(40000))]]).fetchImpl, token: '' });
  await assert.rejects(huge.fetchFiles({ owner: 'a', repo: 'b', branch: 'main', paths: ['a.c', 'b.c'] }), /more than 60,000/);
});

test('the HTTP routes return readable errors', async () => {
  const github = createGitHubClient({ fetchImpl: fakeGitHub([]).fetchImpl, token: '' });
  const { app } = createApp({ examiner: demo, github });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const bad = await post('/api/repo/list', { url: 'not a link' });
  assert.equal(bad.status, 400);
  const missing = await post('/api/repo/list', { url: 'a/b' });
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /not found/);
  server.close();
});
