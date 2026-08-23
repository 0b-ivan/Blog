const fs = require('node:fs');
const path = require('node:path');

describe('blog container healthchecks', () => {
  const root = path.resolve(__dirname, '..');

  it.each(['docker-compose.yml', 'docker-compose.prod.yml'])(
    '%s uses the distroless Node executable for the blog healthcheck',
    (fileName) => {
      const compose = fs.readFileSync(path.join(root, fileName), 'utf8');
      const blogSection = compose.split(/\n  blog:\n/)[1];

      expect(blogSection).toBeDefined();
      expect(blogSection).toContain('/nodejs/bin/node');
      expect(blogSection).not.toContain('test: ["CMD", "wget"');
    }
  );
});
