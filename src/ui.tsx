import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { X, Inbox, LoaderCircle } from 'lucide-react';
import type { Snapshot } from '../shared/types.ts';
import type { Repository } from './data/repository.ts';
export type Page = 'dashboard' | 'inbox' | 'flows' | 'materials' | 'leads' | 'lab' | 'settings';
export type UIContextValue = {
  data: Snapshot;
  repo: Repository;
  perform: (action: () => Promise<unknown>, message?: string) => Promise<boolean>;
  navigate: (page: Page) => void;
  openInbox: (id: string) => void;
  notify: (message: string) => void;
  busy: boolean;
};
export const UIContext = createContext<UIContextValue | null>(null);
export function useUI() {
  const value = useContext(UIContext);
  if (!value) throw new Error('Workspace context missing');
  return value;
}
export function Badge({
  children,
  tone = 'blue',
}: {
  children: ReactNode;
  tone?: 'blue' | 'green' | 'amber' | 'gray' | 'red' | 'purple';
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Inbox size={27} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,button,select,textarea')?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'input,button,select,textarea,a[href]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Закрыть" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      <span>Загружаем рабочее пространство…</span>
    </div>
  );
}
export function Avatar({ name, size = 'normal' }: { name: string; size?: 'normal' | 'small' }) {
  const letters =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((x) => x[0])
      .join('') || '?';
  return <span className={`avatar ${size}`}>{letters}</span>;
}
export function time(value: string) {
  return new Intl.DateTimeFormat('ru', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Minsk',
  }).format(new Date(value));
}
export function day(value: string) {
  return new Intl.DateTimeFormat('ru', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Minsk',
  }).format(new Date(value));
}
export const leadLabels = {
  new: 'Новая',
  qualified: 'Заинтересован',
  contacted: 'Связались',
  enrolled: 'Начал обучение',
  archived: 'В архиве',
} as const;
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
