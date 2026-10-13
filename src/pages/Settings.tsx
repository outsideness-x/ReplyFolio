import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Database,
  Download,
  Camera,
  Link2,
  RotateCcw,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import { Badge, day, download, Modal, useUI } from '../ui.tsx';
export function Settings() {
  const { data, repo, perform, busy } = useUI();
  const [name, setName] = useState(data.workspace.name),
    [confirm, setConfirm] = useState<'reset' | 'disconnect' | null>(null);
  const connected = data.account?.status === 'connected';
  useEffect(() => setName(data.workspace.name), [data.workspace.name]);
  async function connect() {
    if (repo.mode === 'demo') {
      window.open('/setup.html', '_blank', 'noopener');
      return;
    }
    await perform(async () => {
      const url = await repo.connect();
      if (!['www.instagram.com', 'instagram.com'].includes(new URL(url).hostname))
        throw new Error('Некорректная ссылка авторизации.');
      location.assign(url);
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>Настройки</h1>
          <p>Ваше пространство. Ваши подключения.</p>
        </div>
        <a className="button" href="/setup.html" target="_blank" rel="noopener noreferrer">
          <BookOpen size={15} />
          Инструкция
        </a>
      </div>
      <div className="settings-grid">
        <div className="settings-column">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Рабочее пространство</h2>
                <p>Название видно только вашей команде.</p>
              </div>
              <Badge tone="gray">{repo.mode === 'demo' ? 'Демо' : 'Рабочая среда'}</Badge>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(() => repo.renameWorkspace(name), 'Название сохранено.');
              }}
            >
              <label>
                Название
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={120}
                  required
                />
              </label>
              <button
                className="button primary"
                disabled={busy || !name.trim() || name === data.workspace.name}
              >
                Сохранить название
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Instagram</h2>
                <p>Официальное подключение профессионального аккаунта.</p>
              </div>
              <Camera size={21} className="settings-icon" />
            </div>
            <div className="integration-status">
              <span className="integration-icon">
                <Camera size={25} strokeWidth={1.3} />
              </span>
              <div>
                <strong>
                  {data.account?.username
                    ? '@' + data.account.username
                    : 'Аккаунт ещё не подключён'}
                </strong>
                <p>
                  {repo.mode === 'demo'
                    ? 'Локальная симуляция без реальных отправок'
                    : connected
                      ? 'Разрешения и подписка на события активны'
                      : data.account?.last_error || 'Подключите Instagram Business или Creator'}
                </p>
              </div>
              <Badge tone={connected ? 'green' : data.account?.status === 'error' ? 'red' : 'gray'}>
                {connected
                  ? 'Подключён'
                  : data.account?.status === 'error'
                    ? 'Нужен вход'
                    : 'Не подключён'}
              </Badge>
            </div>
            {data.account?.token_expires_at && (
              <p className="form-hint" style={{ marginBottom: 20 }}>
                Доступ действует до {day(data.account.token_expires_at)}. Рабочий сервер обновляет
                токен автоматически.
              </p>
            )}
            <div className="settings-actions">
              <button className="button primary" disabled={busy} onClick={() => void connect()}>
                <Link2 size={14} />
                {repo.mode === 'demo'
                  ? 'Как подключить'
                  : connected
                    ? 'Обновить подключение'
                    : 'Подключить Instagram'}
              </button>
              {data.account && repo.mode === 'live' && (
                <button className="button" disabled={busy} onClick={() => setConfirm('disconnect')}>
                  <Unplug size={14} />
                  Отключить
                </button>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Данные и экспорт</h2>
                <p>Сохраните копию загруженных данных кабинета.</p>
              </div>
              <Database size={20} className="settings-icon" />
            </div>
            <p className="form-hint">
              Экспорт содержит контакты, сценарии, материалы и загруженные сообщения. Токены
              Instagram и серверные секреты в него не входят. Для полного резервного копирования
              базы используйте инструкцию.
            </p>
            <div className="settings-actions" style={{ marginTop: 21 }}>
              <button
                className="button"
                onClick={() =>
                  download(
                    'growththread-' + new Date().toISOString().slice(0, 10) + '.json',
                    JSON.stringify(data, null, 2),
                  )
                }
              >
                <Download size={14} />
                Скачать текущие данные
              </button>
              {repo.mode === 'demo' && (
                <button className="button" onClick={() => setConfirm('reset')}>
                  <RotateCcw size={14} />
                  Сбросить демоданные
                </button>
              )}
            </div>
          </section>
        </div>
        <div className="settings-column">
          <section className="panel setup-checklist">
            <div className="panel-heading">
              <div>
                <h2>От теста к запуску</h2>
                <p>Три шага до реального Direct.</p>
              </div>
              <ShieldCheck size={20} className="settings-icon" />
            </div>
            {[
              [
                '01',
                'Подключить Supabase',
                'База, авторизация команды и библиотека материалов.',
                repo.mode === 'live',
              ],
              [
                '02',
                'Настроить приложение Meta',
                'Разрешения Instagram и адрес получения событий.',
                connected,
              ],
              [
                '03',
                'Авторизовать Instagram',
                'Подключение через официальный экран Instagram.',
                connected,
              ],
            ].map(([number, title, description, done]) => (
              <div className="setup-step" key={String(number)}>
                <span className={done ? 'done' : ''}>{done ? <Check size={14} /> : number}</span>
                <div>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
              </div>
            ))}
            <a className="button full" href="/setup.html" target="_blank" rel="noopener noreferrer">
              Открыть инструкцию
              <ArrowRight size={15} />
            </a>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Адрес webhook</h2>
                <p>Для настроек приложения Meta.</p>
              </div>
              <Link2 size={19} className="settings-icon" />
            </div>
            <p className="form-hint">
              Адрес зависит от вашего проекта Supabase. Возьмите его из инструкции подключения и
              добавьте в настройки Meta.
            </p>
          </section>
          <section className="quiet-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Окно переписки проверяется перед отправкой.</strong>
              <p>
                Для обычных сообщений — 24 часа после обращения. После комментария отправляется одно
                первое сообщение; продолжение возможно после ответа ученика.
              </p>
            </div>
          </section>
        </div>
      </div>
      {confirm && (
        <Modal
          title={confirm === 'reset' ? 'Сбросить демоданные?' : 'Отключить Instagram?'}
          onClose={() => setConfirm(null)}
        >
          <p className="form-hint">
            {confirm === 'reset'
              ? 'Изменения в локальной демосреде будут заменены начальными примерами. Облачные данные не изменятся.'
              : 'Бот перестанет отправлять сообщения. Сохранённые диалоги и заявки останутся в кабинете.'}
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setConfirm(null)}>
              Отмена
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  await perform(
                    () => (confirm === 'reset' ? repo.reset!() : repo.disconnect()),
                    confirm === 'reset' ? 'Демосреда сброшена.' : 'Instagram отключён.',
                  )
                )
                  setConfirm(null);
              }}
            >
              {confirm === 'reset' ? 'Сбросить демосреду' : 'Отключить аккаунт'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
