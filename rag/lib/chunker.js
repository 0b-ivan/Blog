const crypto = require('node:crypto');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeMarkdown(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim();
}

function splitIntoSections(markdown) {
  const lines = normalizeMarkdown(markdown).split('\n');
  const sections = [];
  let heading = '';
  let headingLevel = 0;
  let body = [];
  let fence = null;

  function flush() {
    const content = body.join('\n').trim();
    if (heading || content) {
      sections.push({ heading, headingLevel, content });
    }
    body = [];
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }
      body.push(line);
      continue;
    }

    if (!fence) {
      const headingMatch = line.match(/^(#{1,4})\s+(.+?)\s*$/);
      if (headingMatch) {
        flush();
        headingLevel = headingMatch[1].length;
        heading = headingMatch[2].trim();
        continue;
      }
    }

    body.push(line);
  }

  flush();
  return sections;
}

function splitIntoBlocks(content) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let current = [];
  let fence = null;

  function flush() {
    const text = current.join('\n').trim();
    if (text) {
      blocks.push(text);
    }
    current = [];
  }

  for (const line of lines) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) {
        flush();
        fence = marker;
        current.push(line);
      } else {
        current.push(line);
        if (fence === marker) {
          fence = null;
          flush();
        }
      }
      continue;
    }

    if (fence) {
      current.push(line);
      continue;
    }

    if (line.trim() === '') {
      flush();
      continue;
    }

    current.push(line);
  }

  flush();
  return blocks;
}

function chunkSection(section, maxChars) {
  const blocks = splitIntoBlocks(section.content);
  if (blocks.length === 0) {
    return section.heading ? [{ heading: section.heading, content: '' }] : [];
  }

  const chunks = [];
  let current = '';

  function flush() {
    const content = current.trim();
    if (content) {
      chunks.push({ heading: section.heading, content });
    }
    current = '';
  }

  for (const block of blocks) {
    if (!current) {
      current = block;
      continue;
    }

    const candidate = `${current}\n\n${block}`;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      flush();
      current = block;
    }
  }

  flush();
  return chunks;
}

function chunkMarkdown(markdown, options = {}) {
  const maxChars = Number(options.maxChars || 1800);
  if (!Number.isFinite(maxChars) || maxChars < 300) {
    throw new Error('maxChars must be at least 300');
  }

  const chunks = splitIntoSections(markdown)
    .flatMap((section) => chunkSection(section, maxChars))
    .filter((chunk) => chunk.content || chunk.heading);

  return chunks.map((chunk, ordinal) => ({
    ...chunk,
    ordinal,
    contentHash: sha256(`${chunk.heading}\n\0${chunk.content}`)
  }));
}

function embeddingText({ title, heading, content }) {
  return [title, heading && heading !== title ? heading : '', content]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

module.exports = {
  sha256,
  splitIntoSections,
  splitIntoBlocks,
  chunkMarkdown,
  embeddingText
};
