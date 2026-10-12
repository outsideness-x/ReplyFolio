import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Command, Search, X } from 'lucide-react';
import { Modal, useUI, type Page } from '../ui.tsx';
const destinations: [Page, string][] = [
  ['dashboard', 'Обзор'],
  ['inbox', 'Диалоги'],
  ['flows', 'Сценарии'],
  ['materials', 'Материалы'],
  ['leads', 'Заявки'],
  ['lab', 'Симулятор'],
  ['settings', 'Настройки'],
];
export function CommandPalette() {
  const { data, navigate, openInbox } = useUI(),
    [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(0),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery('');
        setSelected(0);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => input.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [open]);
  const normalized = query.trim().toLowerCase();
  const items = [
    ...destinations
      .filter(([, title]) => title.toLowerCase().includes(normalized))
      .map(([page, title]) => ({ id: page, title, hint: 'Раздел', choose: () => navigate(page) })),
    ...(normalized
      ? data.contacts
          .filter((c) => [c.name, c.username, c.email].join(' ').toLowerCase().includes(normalized))
          .slice(0, 6)
          .flatMap((c) => {
            const chat = data.conversations.find((v) => v.contact_id === c.id);
            return chat
              ? [
                  {
                    id: c.id,
                    title: c.name || c.username || 'Контакт Instagram',
                    hint: 'Диалог',
                    choose: () => openInbox(chat.id),
                  },
                ]
              : [];
          })
      : []),
  ];
  function choose(index: number) {
    const item = items[index];
    if (item) {
      setOpen(false);
      setQuery('');
      item.choose();
    }
  }
  return (
    <>
      <button
        className="command-trigger"
        onClick={() => {
          setOpen(true);
          setQuery('');
          setSelected(0);
        }}
      >
        <Search size={15} />
        <span>Поиск или переход…</span>
        <kbd>
          <Command size={10} /> K
        </kbd>
      </button>
      {open && (
        <Modal title="Быстрый переход" onClose={() => setOpen(false)} wide>
          <div className="command-palette">
            <div className="command-input">
              <Search size={20} />
              <input
                ref={input}
                aria-label="Быстрый поиск"
                placeholder="Раздел, имя или email…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelected((v) => Math.min(items.length - 1, v + 1));
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelected((v) => Math.max(0, v - 1));
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    choose(selected);
                  }
                }}
              />
              {query && (
                <button
                  className="icon-button"
                  aria-label="Очистить поиск"
                  onClick={() => {
                    setQuery('');
                    setSelected(0);
                  }}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="command-results">
              {items.length ? (
                items.map((item, index) => (
                  <button
                    className={index === selected ? 'selected' : ''}
                    key={item.id}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => choose(index)}
                  >
                    <span className="command-result-icon">
                      {item.hint === 'Диалог' ? '@' : '/'}
                    </span>
                    <span>
                      {item.title}
                      <small>{item.hint}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <p>Ничего не нашли. Попробуйте другое название.</p>
              )}
            </div>
            <footer>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>выбрать
              </span>
              <span>
                <kbd>↵</kbd>открыть
              </span>
              <span>
                <kbd>esc</kbd>закрыть
              </span>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
