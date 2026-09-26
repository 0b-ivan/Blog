const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const request = require('supertest');

const {
  createApp,
  findRelatedPosts,
  relatedPostScore,
  renderPostPage
} = require('../server');

async function writePost(dir, name, content) {
  await fs.writeFile(path.join(dir, name), content, 'utf-8');
}

describe('related posts', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kernel-notes-related-'));
  });

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('scores category, shared tags and shared title terms', () => {
    const current = {
      slug: 'ec2-ohne-public-ip',
      title: 'EC2 ohne Public IP',
      category: 'AWS',
      tags: ['EC2', 'Security']
    };

    const candidate = {
      slug: 'session-manager-fuer-ec2',
      title: 'Session Manager fuer EC2',
      category: 'AWS',
      tags: ['EC2', 'Security']
    };

    expect(relatedPostScore(current, candidate)).toBe(12);
  });

  it('returns the strongest related posts and excludes unrelated content', () => {
    const current = {
      slug: 'ec2-ohne-public-ip',
      title: 'EC2 ohne Public IP',
      date: '2026-08-19',
      category: 'AWS',
      tags: ['EC2', 'Security']
    };

    const posts = [
      current,
      {
        slug: 'session-manager-fuer-ec2',
        title: 'Session Manager fuer EC2',
        date: '2026-08-18',
        category: 'AWS',
        tags: ['EC2', 'Security']
      },
      {
        slug: 'vpc-netzwerkplanung',
        title: 'VPC Netzwerkplanung',
        date: '2026-08-17',
        category: 'AWS',
        tags: ['Networking']
      },
      {
        slug: 'linux-hardening',
        title: 'Linux Hardening',
        date: '2026-08-16',
        category: 'Linux',
        tags: ['Security']
      },
      {
        slug: 'reetdach-pflege',
        title: 'Reetdach Pflege',
        date: '2026-08-15',
        category: 'Haus',
        tags: ['Dach']
      }
    ];

    expect(findRelatedPosts(posts, current, 3).map((post) => post.slug)).toEqual([
      'session-manager-fuer-ec2',
      'vpc-netzwerkplanung',
      'linux-hardening'
    ]);
  });

  it('does not treat generic question words as evidence of relatedness', () => {
    const current = {
      slug: 'pac-man-puck-man',
      title: 'Warum Pac-Man zuerst Puck Man hieß – und was paku paku damit zu tun hat',
      date: '2026-09-24',
      category: 'Gaming',
      tags: ['Pac-Man', 'Arcade', 'Retro-Gaming']
    };

    const posts = [
      current,
      {
        slug: 'golden-images',
        title: 'Gold glänzt nicht immer: Warum ich Golden Images trotzdem mag',
        date: '2026-09-04',
        category: 'AWS',
        tags: ['AWS', 'EC2', 'AMI', 'DevOps']
      },
      {
        slug: 'immich-webdav',
        title: 'Warum ich Immich nicht synchronisiere: WebDAV, rclone und Provisionierung statt Dateikopien',
        date: '2026-08-27',
        category: 'Self-Hosting',
        tags: ['Immich', 'Nextcloud', 'WebDAV']
      }
    ];

    expect(relatedPostScore(current, posts[1])).toBe(0);
    expect(relatedPostScore(current, posts[2])).toBe(0);
    expect(findRelatedPosts(posts, current, 3)).toEqual([]);
  });

  it('renders related posts below an article', () => {
    const html = renderPostPage(
      {
        slug: 'current',
        title: 'Current Post',
        date: '2026-08-19',
        category: 'AWS',
        tags: ['Security'],
        excerpt: 'Current excerpt',
        html: '<p>Body</p>'
      },
      [
        {
          slug: 'related',
          title: 'Related Post',
          date: '2026-08-18',
          category: 'AWS',
          tags: ['Security'],
          excerpt: 'Related excerpt'
        }
      ]
    );

    expect(html).toContain('Verwandte Beiträge');
    expect(html).toContain('href="/posts/related"');
    expect(html).toContain('Related Post');
    expect(html).toContain('/assets/related-posts.css');
  });

  it('article route calculates and renders related posts automatically', async () => {
    await writePost(
      tmpDir,
      'current.md',
      '---\ntitle: EC2 ohne Public IP\ndate: 2026-08-19\ncategory: AWS\ntags: EC2,Security\n---\nCurrent body'
    );
    await writePost(
      tmpDir,
      'related.md',
      '---\ntitle: Session Manager fuer EC2\ndate: 2026-08-18\ncategory: AWS\ntags: EC2,Security\nexcerpt: Passender Artikel\n---\nRelated body'
    );
    await writePost(
      tmpDir,
      'unrelated.md',
      '---\ntitle: Reetdach Pflege\ndate: 2026-08-17\ncategory: Haus\ntags: Dach\n---\nUnrelated body'
    );

    const app = createApp({ postsDir: tmpDir });
    const response = await request(app).get('/posts/current');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Verwandte Beiträge');
    expect(response.text).toContain('Session Manager fuer EC2');
    expect(response.text).not.toContain('Reetdach Pflege');
  });
});
