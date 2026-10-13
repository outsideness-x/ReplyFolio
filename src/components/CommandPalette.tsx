import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Command, Search, X } from 'lucide-react';
import { Modal, useUI } from '../ui.tsx';
import { navigation } from '../navigation.ts';
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
    ...navigation
      .filter((item) => [item.title, item.keywords].join(' ').toLowerCase().includes(normalized))
      .map(({ id, title, upcoming }) => ({
        id,
        title,
        hint: upcoming ? 'Section · Coming soon' : 'Section',
        choose: () => navigate(id),
      })),
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
                    title: c.name || c.username || 'Instagram contact',
                    hint: 'Conversation',
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
        <span>Search or jump to…</span>
        <kbd>
          <Command size={10} /> K
        </kbd>
      </button>
      {open && (
        <Modal title="Quick navigation" onClose={() => setOpen(false)} wide>
          <div className="command-palette">
            <div className="command-input">
              <Search size={20} />
              <input
                ref={input}
                aria-label="Quick search"
                placeholder="Section, name or email…"
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
                  aria-label="Clear search"
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
                      {item.hint === 'Conversation' ? '@' : '/'}
                    </span>
                    <span>
                      {item.title}
                      <small>{item.hint}</small>
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <p>No matches. Try a different name.</p>
              )}
            </div>
            <footer>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd>select
              </span>
              <span>
                <kbd>↵</kbd>open
              </span>
              <span>
                <kbd>esc</kbd>close
              </span>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
