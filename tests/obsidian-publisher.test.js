const { jest } = require('@jest/globals');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  GitHubPublisher,
  StableTracker,
  branchForFile,
  parseFrontmatter,
  parsePositiveInteger,
  runCycle,
  stripYamlQuotes
} = require('../ops/obsidian-livesync/scripts/obsidian-publisher');

describe('obsidian publisher', () => {
  it('reads publish metadata from YAML frontmatter', () => {
    const parsed = parseFrontmatter(`---\ntitle: "Mein Artikel"\nstatus: publish\ntags:\n  - Docker\n---\n\nText\n`);

    expect(parsed.title).toBe('Mein Artikel');
    expect(parsed.status).toBe('publish');
  });

  it('ignores files without valid frontmatter', () => {
    expect(parseFrontmatter('# Kein Frontmatter')).toEqual({});
    expect(parseFrontmatter('---\nstatus: publish\n')).toEqual({});
  });

  it('creates one deterministic branch per article', () => {
    expect(branchForFile('2026-08-23-Mein Artikel.md')).toBe('obsidian/2026-08-23-mein-artikel');
  });

  it('waits until content is stable for the debounce window', () => {
    const tracker = new StableTracker(300000);

    expect(tracker.observe('post.md', 'hash-a', 0)).toBe(false);
    expect(tracker.observe('post.md', 'hash-a', 299999)).toBe(false);
    expect(tracker.observe('post.md', 'hash-a', 300000)).toBe(true);

    tracker.markProcessed('post.md', 'hash-a');
    expect(tracker.observe('post.md', 'hash-a', 600000)).toBe(false);

    expect(tracker.observe('post.md', 'hash-b', 600000)).toBe(false);
    expect(tracker.observe('post.md', 'hash-b', 900000)).toBe(true);
  });

  it('normalizes simple YAML strings and numeric settings', () => {
    expect(stripYamlQuotes('"publish"')).toBe('publish');
    expect(stripYamlQuotes("'draft'")).toBe('draft');
    expect(parsePositiveInteger('15', 30)).toBe(15);
    expect(parsePositiveInteger('0', 30)).toBe(30);
  });

  it('routes a stable draft article to unpublish', async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-publisher-'));
    await fs.writeFile(
      path.join(vaultPath, '2026-08-23-test.md'),
      '---\ntitle: Test\nstatus: draft\n---\n\n# Test\n',
      'utf8'
    );

    const tracker = new StableTracker(0);
    const publisher = {
      baseBranch: 'main',
      publish: jest.fn(),
      unpublish: jest.fn().mockResolvedValue({
        action: 'created-unpublish-pr',
        branch: 'obsidian/2026-08-23-test',
        pullRequest: { html_url: 'https://example.invalid/pr/1' }
      })
    };

    try {
      await runCycle({ vaultPath, tracker, publisher });
      await runCycle({ vaultPath, tracker, publisher });

      expect(publisher.unpublish).toHaveBeenCalledWith({
        fileName: '2026-08-23-test.md',
        title: 'Test'
      });
      expect(publisher.publish).not.toHaveBeenCalled();
    } finally {
      await fs.rm(vaultPath, { recursive: true, force: true });
    }
  });

  it('creates a deletion PR when a published article returns to draft', async () => {
    const publisher = new GitHubPublisher({
      token: 'test-token',
      repository: '0b-ivan/Blog',
      baseBranch: 'main'
    });

    publisher.file = jest.fn(async (_filePath, ref) => {
      if (ref === 'main') {
        return { sha: 'main-file-sha', content: 'published' };
      }
      return { sha: 'branch-file-sha', content: 'published' };
    });
    publisher.openPullRequest = jest.fn().mockResolvedValue(null);
    publisher.ensureBranch = jest.fn();
    publisher.deleteFile = jest.fn().mockResolvedValue(true);
    publisher.createPullRequest = jest.fn().mockResolvedValue({
      number: 42,
      html_url: 'https://example.invalid/pr/42'
    });

    const result = await publisher.unpublish({
      fileName: '2026-08-23-test.md',
      title: 'Test'
    });

    expect(publisher.deleteFile).toHaveBeenCalledWith(
      'posts/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      'Test'
    );
    expect(publisher.createPullRequest).toHaveBeenCalledWith(
      'obsidian/2026-08-23-test',
      'Test',
      'posts/2026-08-23-test.md',
      'unpublish'
    );
    expect(result.action).toBe('created-unpublish-pr');
  });

  it('closes a pending publish PR when a never-published article returns to draft', async () => {
    const publisher = new GitHubPublisher({
      token: 'test-token',
      repository: '0b-ivan/Blog',
      baseBranch: 'main'
    });
    const pullRequest = { number: 7, html_url: 'https://example.invalid/pr/7' };

    publisher.file = jest.fn().mockResolvedValue(null);
    publisher.openPullRequest = jest.fn().mockResolvedValue(pullRequest);
    publisher.closePullRequest = jest.fn();

    const result = await publisher.unpublish({
      fileName: '2026-08-23-test.md',
      title: 'Test'
    });

    expect(publisher.closePullRequest).toHaveBeenCalledWith(pullRequest);
    expect(result.action).toBe('closed-pending-publish');
  });
});
