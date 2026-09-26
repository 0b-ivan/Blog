const {
  commonsFileTitle,
  detectImageType,
  licenseIsReusable,
  validateManifest,
  validateOutputPath,
  verifyArticleBinding
} = require('../scripts/ingest-article-photos');

describe('article photo connection', () => {
  it('accepts reusable Commons licenses and rejects unclear ones', () => {
    expect(licenseIsReusable('CC0 1.0')).toBe(true);
    expect(licenseIsReusable('CC BY 2.0')).toBe(true);
    expect(licenseIsReusable('CC BY-SA 4.0')).toBe(true);
    expect(licenseIsReusable('Public domain')).toBe(true);
    expect(licenseIsReusable('All rights reserved')).toBe(false);
  });

  it('extracts a Commons file title from a File page', () => {
    expect(
      commonsFileTitle('https://commons.wikimedia.org/wiki/File:Toru_Iwatani,_creator_of_Pac-Man,_at_GDC_2011.jpg')
    ).toBe('File:Toru Iwatani, creator of Pac-Man, at GDC 2011.jpg');
  });

  it('keeps outputs below assets/posts', () => {
    expect(validateOutputPath('assets/posts/pac-man/01-photo.jpg')).toBe(
      'assets/posts/pac-man/01-photo.jpg'
    );
    expect(() => validateOutputPath('../secret.jpg')).toThrow();
    expect(() => validateOutputPath('assets/covers/photo.jpg')).toThrow();
  });

  it('detects supported raster image signatures', () => {
    expect(detectImageType(Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0,0,0,0,0]))).toBe('jpeg');
    expect(detectImageType(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]))).toBe('png');
    expect(detectImageType(Buffer.from('RIFF1234WEBP', 'ascii'))).toBe('webp');
    expect(detectImageType(Buffer.from('not an image'))).toBe(null);
  });

  it('validates manifest bindings and source IDs', () => {
    const manifest = {
      version: 1,
      post: 'posts/2026-09-24-pac-man.md',
      photos: [{
        source_id: 'pacman-iwatani',
        provider: 'wikimedia-commons',
        source: 'https://commons.wikimedia.org/wiki/File:Toru_Iwatani,_creator_of_Pac-Man,_at_GDC_2011.jpg',
        output: 'assets/posts/pac-man/01-iwatani.jpg',
        alt: 'Tōru Iwatani bei der GDC 2011',
        expected_license: 'CC BY 2.0'
      }]
    };

    expect(validateManifest(manifest)).toEqual(manifest);

    const markdown = [
      '![Tōru Iwatani bei der GDC 2011](/assets/posts/pac-man/01-iwatani.jpg)',
      '',
      '*Foto: [Wikimedia Commons](/sources.html#pacman-iwatani).*'
    ].join('\n');

    expect(() => verifyArticleBinding(markdown, manifest.photos[0])).not.toThrow();
  });
});
