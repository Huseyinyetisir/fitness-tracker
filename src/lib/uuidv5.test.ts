import { describe, it, expect } from 'vitest';
import { DNS_NAMESPACE, deterministicId, sha1Hex, uuidv5 } from './uuidv5';

describe('sha1Hex', () => {
  it('hashes the empty string', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('hashes "abc"', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('hashes input that spans two blocks', () => {
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
  });

  it('hashes non-ASCII text as UTF-8', () => {
    expect(sha1Hex('Hüseyin')).toHaveLength(40);
    expect(sha1Hex('Hüseyin')).not.toBe(sha1Hex('Huseyin'));
  });
});

describe('uuidv5', () => {
  it('matches the RFC 4122 reference value', () => {
    expect(uuidv5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
});

describe('deterministicId', () => {
  it('is stable for the same name', () => {
    expect(deterministicId('user:planned:2026-10-06')).toBe(deterministicId('user:planned:2026-10-06'));
  });

  it('differs for different names', () => {
    expect(deterministicId('a')).not.toBe(deterministicId('b'));
  });

  it('is a version 5 UUID that Postgres accepts', () => {
    expect(deterministicId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
