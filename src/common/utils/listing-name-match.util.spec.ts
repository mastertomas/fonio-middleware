import {
  listingNameMatches,
  normalizeListingNameTerm,
  parseListingAliasesInput,
} from './listing-name-match.util';

describe('listingNameMatches', () => {
  const listing = {
    name: '2-Bedroom Apartment Wiesenblick',
    aliases: ['Wiesenblick', 'Wiesen Blick'],
  };

  it('matches official name substring', () => {
    expect(listingNameMatches('Wiesenblick', listing)).toBe(true);
  });

  it('matches configured alias', () => {
    expect(listingNameMatches('wiesenblick', listing)).toBe(true);
  });

  it('matches speech-to-text spacing variant via normalization', () => {
    expect(listingNameMatches('Wiesen Blick', listing)).toBe(true);
  });

  it('rejects unrelated names', () => {
    expect(listingNameMatches('Bergblick', listing)).toBe(false);
  });

  it('rejects too-short input', () => {
    expect(listingNameMatches('A', listing)).toBe(false);
  });
});

describe('parseListingAliasesInput', () => {
  it('parses comma and newline separated values', () => {
    expect(parseListingAliasesInput('Wiesenblick, Bergblick\nWiesen Blick')).toEqual([
      'Wiesenblick',
      'Bergblick',
      'Wiesen Blick',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(parseListingAliasesInput('Wiesenblick, wiesenblick')).toEqual(['Wiesenblick']);
  });
});

describe('normalizeListingNameTerm', () => {
  it('removes spaces and hyphens', () => {
    expect(normalizeListingNameTerm('Wiesen Blick')).toBe('wiesenblick');
  });
});
