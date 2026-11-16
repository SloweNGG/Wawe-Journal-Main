// Otomatik sitemap (scripts/sitemap.mjs): hangi sayfa girer, adres ve XML biçimi
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageEntry, renderSitemap } from '../scripts/sitemap.mjs';

const SITE = 'https://wawejournal.com';
const page = (head) => `<!DOCTYPE html><html><head>${head}</head><body><a rel="canonical" href="/x">body</a></body></html>`;

test('dizine eklenebilir sayfa: canonical adresi alınır', () => {
  const e = pageEntry(page('<meta name="robots" content="index, follow"><link rel="canonical" href="https://wawejournal.com/about">'), SITE + '/about');
  assert.deepEqual(e, { loc: 'https://wawejournal.com/about', alternates: [] });
});

test('noindex sayfa alınmaz (uygulama, giriş, 404)', () => {
  assert.equal(pageEntry(page('<meta name="robots" content="noindex, nofollow"><link rel="canonical" href="https://wawejournal.com/login">'), SITE + '/login'), null);
  assert.equal(pageEntry(page('<meta content="noindex" name="googlebot"><link rel="canonical" href="https://wawejournal.com/a">'), SITE + '/a'), null);
});

test('canonical yoksa ya da başka adresi gösteriyorsa alınmaz', () => {
  assert.equal(pageEntry(page('<meta name="robots" content="index">'), SITE + '/x'), null);
  assert.equal(pageEntry(page('<link rel="canonical" href="https://wawejournal.com/">'), SITE + '/copy'), null);
});

test('ana sayfa: sondaki / farkı aynı adres sayılır', () => {
  assert.ok(pageEntry(page('<link rel="canonical" href="https://wawejournal.com/">'), SITE + '/'));
});

test('body içindeki etiketler okunmaz', () => {
  assert.equal(pageEntry('<html><head></head><body><link rel="canonical" href="https://wawejournal.com/x"></body></html>', SITE + '/x'), null);
});

test('hreflang alternatifleri xhtml:link olarak yazılır', () => {
  const e = pageEntry(
    page(
      '<link rel="canonical" href="https://wawejournal.com/tr/">' +
        '<link rel="alternate" hreflang="en" href="https://wawejournal.com/">' +
        '<link rel="alternate" hreflang="tr" href="https://wawejournal.com/tr/">'
    ),
    SITE + '/tr/'
  );
  const xml = renderSitemap([{ ...e, lastmod: '2026-11-16' }]);
  assert.match(xml, /xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml"/);
  assert.match(xml, /<loc>https:\/\/wawejournal\.com\/tr\/<\/loc>/);
  assert.match(xml, /<lastmod>2026-11-16<\/lastmod>/);
  assert.match(xml, /<xhtml:link rel="alternate" hreflang="en" href="https:\/\/wawejournal\.com\/"\/>/);
});

test('lastmod yoksa yazılmaz, alternatif yoksa xhtml ad alanı eklenmez, & kaçışlanır', () => {
  const xml = renderSitemap([{ loc: 'https://wawejournal.com/a?b=1&c=2', alternates: [] }]);
  assert.doesNotMatch(xml, /lastmod|xmlns:xhtml/);
  assert.match(xml, /a\?b=1&amp;c=2/);
});
