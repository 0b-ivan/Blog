const { setTimeout: delay } = require('node:timers');
const {
  GitHubPublisher,
  StableTracker,
  parsePositiveInteger,
  runCycle
} = require('./obsidian-publisher');

const DEFAULT_VAULT_PATH = '/vault';
const DEFAULT_REPOSITORY = '0b-ivan/Blog';
const DEFAULT_BASE_BRANCH = 'main';
const DEFAULT_DEBOUNCE_SECONDS = 300;
const DEFAULT_POLL_SECONDS = 30;

function topLevelBlock(raw, key) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return null;
  }

  const closing = normalized.indexOf('\n---\n', 4);
  if (closing === -1) {
    return null;
  }

  const lines = normalized.slice(4, closing).split('\n');
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line));
  if (start === -1) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[A-Za-z_][A-Za-z0-9_-]*:\s*/.test(lines[index])) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function preserveTopLevelBlock(raw, baseRaw, key) {
  if (topLevelBlock(raw, key)) {
    return raw;
  }

  const block = topLevelBlock(baseRaw, key);
  if (!block) {
    return raw;
  }

  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  const closing = normalized.indexOf('\n---\n', 4);
  if (!normalized.startsWith('---\n') || closing === -1) {
    return raw;
  }

  return `${normalized.slice(0, closing)}\n${block}${normalized.slice(closing)}`;
}

function normalizeTagToken(value) {
  const token = String(value || '').trim();
  if (!token) {
    return token;
  }

  const quote = token[0];
  if ((quote === '"' || quote === "'") && token[token.length - 1] === quote) {
    return `${quote}${token.slice(1, -1).trim().replace(/\s+/g, '-')}${quote}`;
  }

  return token.replace(/\s+/g, '-');
}

function normalizeTagList(value) {
  return String(value || '')
    .split(',')
    .map((item) => normalizeTagToken(item))
    .join(', ');
}

function normalizeTagWhitespace(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  const block = topLevelBlock(normalized, 'tags');
  if (!block) {
    return normalized;
  }

  const lines = block.split('\n');
  const inline = lines[0].match(/^(tags:\s*)\[(.*)\]\s*$/);
  const scalar = lines[0].match(/^(tags:\s*)(.+?)\s*$/);

  if (inline) {
    lines[0] = `${inline[1]}[${normalizeTagList(inline[2])}]`;
  } else if (scalar && lines.length === 1) {
    lines[0] = `${scalar[1]}${normalizeTagList(scalar[2])}`;
  } else {
    for (let index = 1; index < lines.length; index += 1) {
      const item = lines[index].match(/^(\s*-\s*)(.+?)\s*$/);
      if (item) {
        lines[index] = `${item[1]}${normalizeTagToken(item[2])}`;
      }
    }
  }

  return normalized.replace(block, lines.join('\n'));
}

function normalizeEmptyListField(raw, key) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  const block = topLevelBlock(normalized, key);
  if (!block) {
    return normalized;
  }

  if (block === `${key}:` || block === `${key}: null` || block === `${key}: ~`) {
    return normalized.replace(block, `${key}: []`);
  }

  return normalized;
}

class PreservingGitHubPublisher extends GitHubPublisher {
  async preserveSearchQueries(fileName, raw) {
    if (topLevelBlock(raw, 'search_queries')) {
      return raw;
    }

    const current = await this.file(`posts/${fileName}`, this.baseBranch)
      || await this.file(`archive/${fileName}`, this.baseBranch);

    return preserveTopLevelBlock(raw, current?.content, 'search_queries');
  }

  async preparedContent(fileName, raw) {
    const preserved = await this.preserveSearchQueries(fileName, raw);
    const normalizedTags = normalizeTagWhitespace(preserved);
    if (normalizedTags !== preserved) {
      console.log(`[publisher] ${fileName}: normalized whitespace in tags`);
    }

    const normalizedSnippets = normalizeEmptyListField(normalizedTags, 'snippets');
    if (normalizedSnippets !== normalizedTags) {
      console.log(`[publisher] ${fileName}: normalized empty snippets to []`);
    }

    return normalizedSnippets;
  }

  async publish({ fileName, raw, title }) {
    return super.publish({
      fileName,
      raw: await this.preparedContent(fileName, raw),
      title
    });
  }

  async archive({ fileName, raw, title }) {
    return super.archive({
      fileName,
      raw: await this.preparedContent(fileName, raw),
      title
    });
  }
}

function sleep(ms) {
  return new Promise((resolve) => delay(resolve, ms));
}

async function main() {
  const token = String(process.env.OBSIDIAN_PUBLISHER_GITHUB_TOKEN || '').trim();
  if (!token) {
    throw new Error('OBSIDIAN_PUBLISHER_GITHUB_TOKEN is required');
  }

  const vaultPath = process.env.PUBLISHER_VAULT_PATH || DEFAULT_VAULT_PATH;
  const repository = process.env.PUBLISHER_GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const baseBranch = process.env.PUBLISHER_BASE_BRANCH || DEFAULT_BASE_BRANCH;
  const debounceSeconds = parsePositiveInteger(
    process.env.PUBLISHER_DEBOUNCE_SECONDS,
    DEFAULT_DEBOUNCE_SECONDS
  );
  const pollSeconds = parsePositiveInteger(
    process.env.PUBLISHER_POLL_SECONDS,
    DEFAULT_POLL_SECONDS
  );

  const tracker = new StableTracker(debounceSeconds * 1000);
  const publisher = new PreservingGitHubPublisher({ token, repository, baseBranch });

  console.log(`[publisher] watching ${vaultPath}`);
  console.log(`[publisher] repository ${repository}, base ${baseBranch}`);
  console.log('[publisher] preserving search_queries from base when absent in Obsidian');
  console.log('[publisher] normalizing tag whitespace to hyphens before publishing');
  console.log('[publisher] normalizing empty snippets metadata before publishing');

  while (true) {
    await runCycle({ vaultPath, tracker, publisher });
    await sleep(pollSeconds * 1000);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[publisher] fatal: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  PreservingGitHubPublisher,
  normalizeEmptyListField,
  normalizeTagWhitespace,
  preserveTopLevelBlock,
  topLevelBlock
};