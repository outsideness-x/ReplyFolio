import { expect, it } from 'vitest';
import { csvCell } from '../shared/export.ts';
it('keeps contact exports from being interpreted as spreadsheet formulas', () => {
  expect(csvCell('=HYPERLINK("https://example.com")')).toBe(
    '"\'=HYPERLINK(""https://example.com"")"',
  );
  expect(csvCell('  +123')).toBe('"\'  +123"');
  expect(csvCell('Анна, "ученица"')).toBe('"Анна, ""ученица"""');
});
