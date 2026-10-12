import type { Contact } from './types.ts';
export function csvCell(value: string): string {
  const safe = /^\s*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function contactsCsv(contacts: Contact[]): string {
  const rows = [
    ['Имя', 'Instagram', 'Email', 'Телефон', 'Статус', 'Теги', 'Источник', 'Создан'],
    ...contacts.map((c) => [
      c.name,
      c.username,
      c.email,
      c.phone,
      c.status,
      c.tags.join(', '),
      c.source,
      c.created_at,
    ]),
  ];
  return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}
