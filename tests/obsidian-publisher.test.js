/* global vi */
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  GitHubPublisher,
  StableTracker,
  branchForFile,
  modeTitle,
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

  it('uses distinct PR titles for each publication state', () => {
    expect(modeTitle('publish', 'Test')).toBe('Publish: Test');
    expect(modeTitle('unpublish', 'Test')).toBe('Unpublish: Test');
    expect(modeTitle('archive', 'Test')).toBe('Archive: Test');
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
    await fs.writeFile(path.join(vaultPath, '2026-08-23-test.md'), '---\ntitle: Test\nstatus: draft\n---\n\n# Test\n', 'utf8');
    const tracker = new StableTracker(0);
    const publisher = {
      baseBranch: 'main',
      publish: vi.fn(),
      archive: vi.fn(),
      unpublish: vi.fn().mockResolvedValue({
        action: 'created-unpublish-pr',
        branch: 'obsidian/2026-08-23-test',
        pullRequest: { html_url: 'https://example.invalid/pr/1' }
      })
    };
    try {
      await runCycle({ vaultPath, tracker, publisher });
      await runCycle({ vaultPath, tracker, publisher });
      expect(publisher.unpublish).toHaveBeenCalledWith({ fileName: '2026-08-23-test.md', title: 'Test' });
      expect(publisher.publish).not.toHaveBeenCalled();
      expect(publisher.archive).not.toHaveBeenCalled();
    } finally {
      await fs.rm(vaultPath, { recursive: true, force: true });
    }
  });

  it('routes a stable archived article to archive', async () => {
    const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), 'obsidian-publisher-'));
    const raw = '---\ntitle: Test\nstatus: archived\n---\n\n# Test\n';
    await fs.writeFile(path.join(vaultPath, '2026-08-23-test.md'), raw, 'utf8');
    const tracker = new StableTracker(0);
    const publisher = {
      baseBranch: 'main',
      publish: vi.fn(),
      unpublish: vi.fn(),
      archive: vi.fn().mockResolvedValue({
        action: 'created-archive-pr',
        branch: 'obsidian/2026-08-23-test',
        pullRequest: { html_url: 'https://example.invalid/pr/2' }
      })
    };

    try {
      await runCycle({ vaultPath, tracker, publisher });
      await runCycle({ vaultPath, tracker, publisher });
      expect(publisher.archive).toHaveBeenCalledWith({
        fileName: '2026-08-23-test.md',
        raw,
        title: 'Test'
      });
      expect(publisher.publish).not.toHaveBeenCalled();
      expect(publisher.unpublish).not.toHaveBeenCalled();
    } finally {
      await fs.rm(vaultPath, { recursive: true, force: true });
    }
  });

  it('creates a deletion PR when a published article returns to draft', async () => {
    const publisher = new GitHubPublisher({ token: 'x', repository: '0b-ivan/Blog', baseBranch: 'main' });
    publisher.file = vi.fn(async (filePath, ref) => {
      if (ref === 'main' && filePath.startsWith('posts/')) {
        return { sha: 'main-file-sha', content: 'published' };
      }
      return null;
    });
    publisher.openPullRequest = vi.fn().mockResolvedValue(null);
    publisher.ensureBranch = vi.fn();
    publisher.deleteFile = vi.fn().mockResolvedValue(true);
    publisher.createPullRequest = vi.fn().mockResolvedValue({ number: 42, html_url: 'https://example.invalid/pr/42' });

    const result = await publisher.unpublish({ fileName: '2026-08-23-test.md', title: 'Test' });
    expect(publisher.deleteFile).toHaveBeenCalledWith(
      'posts/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      'Test',
      'unpublish'
    );
    expect(publisher.deleteFile).toHaveBeenCalledWith(
      'archive/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      'Test',
      'unpublish'
    );
    expect(publisher.createPullRequest).toHaveBeenCalledWith(
      'obsidian/2026-08-23-test',
      'Test',
      'posts/2026-08-23-test.md',
      'unpublish'
    );
    expect(result.action).toBe('created-unpublish-pr');
  });

  it('moves a published article into archive when status becomes archived', async () => {
    const publisher = new GitHubPublisher({ token: 'x', repository: '0b-ivan/Blog', baseBranch: 'main' });
    const raw = '---\ntitle: Test\nstatus: archived\n---\n\n# Test\n';
    publisher.file = vi.fn(async (filePath, ref) => {
      if (ref === 'main' && filePath.startsWith('posts/')) {
        return { sha: 'main-post-sha', content: 'published' };
      }
      return null;
    });
    publisher.openPullRequest = vi.fn().mockResolvedValue(null);
    publisher.ensureBranch = vi.fn();
    publisher.writeFile = vi.fn();
    publisher.deleteFile = vi.fn().mockResolvedValue(true);
    publisher.createPullRequest = vi.fn().mockResolvedValue({ number: 43, html_url: 'https://example.invalid/pr/43' });

    const result = await publisher.archive({ fileName: '2026-08-23-test.md', raw, title: 'Test' });
    expect(publisher.writeFile).toHaveBeenCalledWith(
      'archive/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      raw,
      'Test',
      'archive'
    );
    expect(publisher.deleteFile).toHaveBeenCalledWith(
      'posts/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      'Test',
      'archive'
    );
    expect(publisher.createPullRequest).toHaveBeenCalledWith(
      'obsidian/2026-08-23-test',
      'Test',
      'posts/2026-08-23-test.md',
      'archive'
    );
    expect(result.action).toBe('created-archive-pr');
  });

  it('restores an archived article when status becomes publish', async () => {
    const publisher = new GitHubPublisher({ token: 'x', repository: '0b-ivan/Blog', baseBranch: 'main' });
    const raw = '---\ntitle: Test\nstatus: publish\n---\n\n# Test\n';
    publisher.file = vi.fn(async (filePath, ref) => {
      if (ref === 'main' && filePath.startsWith('archive/')) {
        return { sha: 'main-archive-sha', content: 'archived' };
      }
      return null;
    });
    publisher.openPullRequest = vi.fn().mockResolvedValue(null);
    publisher.ensureBranch = vi.fn();
    publisher.writeFile = vi.fn();
    publisher.deleteFile = vi.fn().mockResolvedValue(true);
    publisher.createPullRequest = vi.fn().mockResolvedValue({ number: 44, html_url: 'https://example.invalid/pr/44' });

    const result = await publisher.publish({ fileName: '2026-08-23-test.md', raw, title: 'Test' });
    expect(publisher.writeFile).toHaveBeenCalledWith(
      'posts/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      raw,
      'Test',
      'publish'
    );
    expect(publisher.deleteFile).toHaveBeenCalledWith(
      'archive/2026-08-23-test.md',
      'obsidian/2026-08-23-test',
      'Test',
      'publish'
    );
    expect(result.action).toBe('created-pr');
  });

  it('closes a pending publish PR when a never-published article returns to draft', async () => {
    const publisher = new GitHubPublisher({ token: 'x', repository: '0b-ivan/Blog', baseBranch: 'main' });
    const pullRequest = { number: 7, html_url: 'https://example.invalid/pr/7' };
    publisher.file = vi.fn().mockResolvedValue(null);
    publisher.openPullRequest = vi.fn().mockResolvedValue(pullRequest);
    publisher.closePullRequest = vi.fn();

    const result = await publisher.unpublish({ fileName: '2026-08-23-test.md', title: 'Test' });
    expect(publisher.closePullRequest).toHaveBeenCalledWith(pullRequest);
    expect(result.action).toBe('closed-pending-publish');
  });
});
