import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  FlaskConical,
  LogOut,
  Menu,
  X,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Moon,
  Sun,
} from 'lucide-react';
import { LocalRepository } from './data/local.ts';
import { SupabaseRepository } from './data/supabase.ts';
import { api, forceDemo, logout, type AccessState } from './data/session.ts';
import type { Repository } from './data/repository.ts';
import type { Snapshot } from '../shared/types.ts';
import { Brand } from './components/Brand.tsx';
import { MfaChallenge } from './components/MfaChallenge.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { navigation as pages, navigationGroups } from './navigation.ts';
import { AnalyticsPreview } from './pages/Analytics.tsx';
import { Landing } from './pages/Landing.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Inbox } from './pages/Inbox.tsx';
import { Materials } from './pages/Materials.tsx';
import { Leads } from './pages/Leads.tsx';
import { Flows } from './pages/Flows.tsx';
import { Lab } from './pages/Lab.tsx';
import { Settings as SettingsPage } from './pages/Settings.tsx';
import { Badge, Loading, Modal, UIContext, type Page } from './ui.tsx';
function initialPage(): Page {
  const value = location.hash.replace('#/', '').split('?')[0];
  return pages.some((p) => p.id === value) ? (value as Page) : 'dashboard';
}
export default function App() {
  const [access, setAccess] = useState<AccessState>({ state: 'anonymous' }),
    [ready, setReady] = useState(false);
  const local = useMemo(() => (forceDemo ? new LocalRepository(window.localStorage) : null), []);
  const repo = useMemo(
    () =>
      access.state === 'active' && access.workspaceId
        ? new SupabaseRepository(access.workspaceId)
        : null,
    [access.state, access.workspaceId],
  );
  useEffect(() => {
    if (forceDemo) return;
    let active = true;
    void api<AccessState>('auth')
      .then((state) => {
        if (active) {
          setAccess(state);
          setReady(true);
        }
      })
      .catch(() => {
        if (active) setReady(false);
      });
    const ended = () => {
      setAccess({ state: 'anonymous' });
      setReady(true);
    };
    window.addEventListener('replyfolio:session-ended', ended);
    return () => {
      active = false;
      window.removeEventListener('replyfolio:session-ended', ended);
    };
  }, []);
  if (local) return <WorkspaceApp repo={local} />;
  if (repo) return <WorkspaceApp key={access.workspaceId} repo={repo} />;
  return <Landing access={access} onAccess={setAccess} ready={ready} />;
}
function WorkspaceApp({ repo }: { repo: Repository }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return localStorage.getItem('replyfolio.theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('replyfolio.theme', theme);
    } catch {
      /* A theme preference is optional. */
    }
  }, [theme]);
  const [stepUp, setStepUp] = useState(false);
  useEffect(() => {
    const open = () => setStepUp(true);
    window.addEventListener('replyfolio:step-up', open);
    return () => window.removeEventListener('replyfolio:step-up', open);
  }, []);
  const [data, setData] = useState<Snapshot | null>(null),
    [page, setPage] = useState<Page>(initialPage),
    [loadError, setLoadError] = useState(''),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [query, setQuery] = useState(''),
    [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const navigate = (value: Page) => {
    if (!window.dispatchEvent(new Event('replyfolio:navigate', { cancelable: true }))) return;
    location.hash = '/' + value;
    setPage(value);
    setMobile(false);
  };
  useEffect(() => {
    const fn = () => setPage(initialPage());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void repo
          .load()
          .then((s) => {
            if (active) {
              setData(s);
              setLoadError('');
            }
          })
          .catch((e) => {
            if (active) setLoadError(e.message);
          });
      }, 50);
    };
    reload();
    const unsubscribe = repo.subscribe(reload);
    const interval = repo.processDue
      ? setInterval(() => {
          void repo.processDue?.().catch(() => undefined);
        }, 30000)
      : undefined;
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe();
      clearInterval(interval);
    };
  }, [repo]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const status = new URL(location.href).searchParams.get('instagram');
    if (status) {
      setToast(
        status === 'connected'
          ? 'Instagram подключён.'
          : 'Подключение не завершено. Проверьте настройки Meta и повторите вход.',
      );
      history.replaceState(null, '', location.pathname + location.hash);
    }
  }, []);
  async function perform(action: () => Promise<unknown>, message?: string) {
    setBusy(true);
    try {
      await action();
      setData(await repo.load());
      if (message) setToast(message);
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Не удалось выполнить операцию.');
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return loadError ? (
      <div className="auth-screen">
        <section className="auth-card">
          <Brand />
          <h1>Не удалось загрузить кабинет</h1>
          <p>{loadError}</p>
          <button className="button primary" onClick={() => location.reload()}>
            Повторить
          </button>
        </section>
      </div>
    ) : (
      <Loading />
    );
  const unread = data.conversations.reduce((sum, c) => sum + c.unread_count, 0);
  return (
    <UIContext.Provider
      value={{
        data,
        repo,
        perform,
        navigate,
        openInbox: (id) => {
          setSelectedConversation(id);
          navigate('inbox');
        },
        notify: setToast,
        busy,
      }}
    >
      <div className="app-shell" data-theme={theme}>
        {stepUp && (
          <Modal title="Подтвердите вход" onClose={() => setStepUp(false)}>
            <MfaChallenge
              onDone={() => {
                setStepUp(false);
                setToast('Вход подтверждён. Повторите действие.');
              }}
            />
          </Modal>
        )}
        <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
          <div className="sidebar-brand">
            <Brand />
            <button
              className="mobile-only icon-button"
              aria-label="Закрыть меню"
              onClick={() => setMobile(false)}
            >
              <X size={20} />
            </button>
          </div>
          <button className="workspace-switch" onClick={() => navigate('settings')}>
            <span className="workspace-monogram">{data.workspace.name[0]}</span>
            <div>
              <strong>{data.workspace.name}</strong>
              <small>
                {repo.mode === 'demo' ? 'Демонстрационный режим' : 'Рабочее пространство'}
              </small>
            </div>
            <ChevronRight size={15} />
          </button>
          <nav aria-label="Разделы рабочего пространства">
            {navigationGroups.map((group) => (
              <div className="nav-group" key={group.id}>
                {group.label && <div className="nav-label">{group.label}</div>}
                {pages
                  .filter((p) => p.group === group.id)
                  .map((p) => (
                    <button
                      key={p.id}
                      className={`nav-item ${page === p.id ? 'active' : ''}`}
                      aria-current={page === p.id ? 'page' : undefined}
                      onClick={() => navigate(p.id)}
                    >
                      <p.icon size={19} />
                      <span>{p.label || p.title}</span>
                      {p.id === 'inbox' && unread > 0 && (
                        <span className="nav-count">{unread}</span>
                      )}
                      {p.id === 'lab' && <span className="nav-mini">TEST</span>}
                      {p.upcoming && <span className="nav-mini">Скоро</span>}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="connection-small">
              <span
                className={`status-dot ${data.account?.status === 'connected' ? 'green' : 'gray'}`}
              />
              <span>
                {repo.mode === 'demo'
                  ? 'Локальный симулятор'
                  : data.account?.status === 'connected'
                    ? 'Instagram подключён'
                    : 'Instagram не подключён'}
              </span>
            </div>
            <button className="help-card" onClick={() => navigate('settings')}>
              <span className="help-icon">
                <BookOpen size={18} />
              </span>
              <div>
                <strong>Готовы подключить Instagram?</strong>
                <small>Настройка шаг за шагом</small>
              </div>
              <ArrowUpRight size={16} />
            </button>
            <div className="sidebar-version">
              GROWTHTHREAD <span>v0.1</span>
            </div>
          </div>
        </aside>
        {mobile && (
          <button
            className="sidebar-scrim"
            aria-label="Закрыть меню"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="main-shell">
          <header className="topbar">
            <div className="breadcrumb">
              <button
                className="mobile-only icon-button"
                aria-label="Открыть меню"
                onClick={() => setMobile(true)}
              >
                <Menu size={22} />
              </button>
              <span>Рабочее пространство</span>
              <ChevronRight size={14} />
              <strong>{pages.find((p) => p.id === page)?.title}</strong>
            </div>
            <div className="topbar-actions">
              <CommandPalette />
              <button
                className="icon-button theme-toggle"
                aria-label={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <span className="owner-avatar">GT</span>
            </div>
          </header>
          {repo.mode === 'demo' && (
            <div className="demo-banner">
              <FlaskConical size={15} />
              <span>
                <strong>Демо-среда.</strong> Данные хранятся в этом браузере; сообщения в Instagram
                не отправляются.
              </span>
              <button onClick={() => navigate('settings')}>
                Подключить сервисы
                <ArrowRight size={14} />
              </button>
            </div>
          )}
          {loadError && (
            <div className="inline-alert">
              <AlertCircle size={16} />
              {loadError}
            </div>
          )}
          <main className={`workspace-main ${page === 'inbox' ? 'inbox-main' : ''}`}>
            {page === 'dashboard' ? (
              <Dashboard />
            ) : page === 'app-analytics' ||
              page === 'instagram-analytics' ||
              page === 'relationships' ? (
              <AnalyticsPreview section={page} />
            ) : page === 'inbox' ? (
              <Inbox selectedId={selectedConversation} query={query} />
            ) : page === 'materials' ? (
              <Materials />
            ) : page === 'leads' ? (
              <Leads />
            ) : page === 'flows' ? (
              <Flows />
            ) : page === 'lab' ? (
              <Lab />
            ) : (
              <SettingsPage />
            )}
          </main>
          <footer className="app-footer">
            <span>GrowthThread · Диалоги и данные в одном пространстве</span>
            {repo.mode === 'demo' && (
              <a href="/">
                На главную
                <ArrowUpRight size={12} />
              </a>
            )}
            {repo.mode === 'live' && (
              <button
                className="text-button"
                onClick={() =>
                  void logout().catch(() => setToast('Не удалось выйти. Повторите действие.'))
                }
              >
                <LogOut size={14} />
                Выйти
              </button>
            )}
            <span>{repo.mode === 'demo' ? 'LOCAL DEMO' : 'SUPABASE CONNECTED'}</span>
          </footer>
        </div>
        {toast && (
          <div className="toast" role="alert">
            <CheckCircle2 size={19} />
            <span>{toast}</span>
            <button
              className="icon-button"
              aria-label="Закрыть уведомление"
              onClick={() => setToast('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </UIContext.Provider>
  );
}
