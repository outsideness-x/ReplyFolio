import {
  ArrowRight,
  Camera,
  CircleDashed,
  GitCompareArrows,
  Smartphone,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../ui.tsx';
import type { Page } from '../ui.tsx';

type AnalyticsSection = Extract<Page, 'app-analytics' | 'instagram-analytics' | 'relationships'>;
const sections = {
  'app-analytics': {
    eyebrow: 'PRODUCT ANALYTICS',
    title: 'Аналитика приложения',
    description: 'От первого запуска до привычки возвращаться. iOS и Android в одном пространстве.',
    icon: Smartphone,
    source: 'События приложения',
    note: 'После подключения событий здесь появятся активность, удержание и путь пользователя.',
    metrics: [
      ['D1 retention', 'Возврат на следующий день'],
      ['D7 retention', 'Возврат на седьмой день'],
      ['D30 retention', 'Возврат на тридцатый день'],
      ['MAU', 'Активные пользователи за месяц'],
    ],
  },
  'instagram-analytics': {
    eyebrow: 'INSTAGRAM INSIGHTS',
    title: 'Аналитика Instagram',
    description: 'Как контент превращается в интерес: охват, взаимодействия и динамика аккаунта.',
    icon: Camera,
    source: 'Instagram Insights',
    note: 'Подключение Insights будет отдельным шагом. Существующее подключение Direct не загружает эту статистику.',
    metrics: [
      ['Охват', 'Уникальные аккаунты'],
      ['Просмотры', 'Просмотры контента'],
      ['Взаимодействия', 'Реакции на публикации'],
      ['Подписчики', 'Динамика аудитории'],
    ],
  },
  relationships: {
    eyebrow: 'CONNECTED ANALYTICS',
    title: 'Взаимосвязи',
    description: 'Одна картина для контента, диалогов и поведения в приложении.',
    icon: GitCompareArrows,
    source: 'Общие данные',
    note: 'Сопоставления появятся после подключения обоих источников и согласования периодов.',
    metrics: [
      ['Источники', 'Приложение и Instagram'],
      ['Общий период', 'Совпадающие даты'],
      ['Сопоставления', 'Ряды для сравнения'],
      ['Наблюдения', 'Проверяемые гипотезы'],
    ],
  },
} as const;

function EmptyPlot({
  title,
  description,
  labels,
}: {
  title: string;
  description: string;
  labels: string[];
}) {
  return (
    <section className="panel analytics-plot-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <CircleDashed size={17} />
      </div>
      <div className="analytics-plot">
        <div className="analytics-plot-lines" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="analytics-plot-empty">
          <CircleDashed size={24} />
          <strong>Пока без данных</strong>
          <span>Здесь появится динамика после подключения.</span>
        </div>
      </div>
      <div className="analytics-plot-legend">
        {labels.map((label) => (
          <span key={label}>
            <i />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
function MetricCards({ metrics }: { metrics: readonly (readonly [string, string])[] }) {
  return (
    <div className="analytics-metrics">
      {metrics.map(([title, caption]) => (
        <article className="analytics-metric" key={title}>
          <span>{title}</span>
          <strong aria-label="Нет данных">—</strong>
          <small>{caption}</small>
        </article>
      ))}
    </div>
  );
}
function Journey({ steps }: { steps: string[] }) {
  return (
    <ol className="analytics-journey">
      {steps.map((step, index) => (
        <li key={step}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <div>
            <strong>{step}</strong>
            <small>Нет данных</small>
          </div>
          <b aria-hidden="true">—</b>
        </li>
      ))}
    </ol>
  );
}
function Source({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="analytics-source">
      <span className="analytics-source-icon">
        <Icon size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <span className="analytics-source-state">Не подключено</span>
    </div>
  );
}
function Cohorts() {
  const days = ['D0', 'D1', 'D3', 'D7', 'D14', 'D30'];
  return (
    <section className="panel analytics-cohorts">
      <div className="panel-heading">
        <div>
          <h2>Когорты удержания</h2>
          <p>Возвращение пользователей по дням после первого запуска.</p>
        </div>
        <span className="analytics-detail-label">iOS · Android</span>
      </div>
      <div className="analytics-table-scroll">
        <table aria-label="Когорты удержания без данных">
          <thead>
            <tr>
              <th>Когорта</th>
              <th>Пользователи</th>
              {days.map((day) => (
                <th key={day}>{day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((row) => (
              <tr key={row}>
                <td>
                  <span className="analytics-skeleton" aria-hidden="true" />
                  <span className="sr-only">Когорта не загружена</span>
                </td>
                <td>—</td>
                {days.map((day) => (
                  <td key={day}>
                    <span className="analytics-cohort-cell">—</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="analytics-table-note">
        <CircleDashed size={14} />
        Когорты появятся после подключения событий приложения.
      </p>
    </section>
  );
}
function InstagramPanels() {
  return (
    <>
      <EmptyPlot
        title="Динамика аккаунта"
        description="Охват и взаимодействия за один период."
        labels={['Охват', 'Взаимодействия']}
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Контент и отклик</h2>
            <p>Одна публикация — несколько сигналов.</p>
          </div>
        </div>
        <div className="analytics-content-types">
          {['Reels', 'Публикации', 'Stories'].map((type) => (
            <span key={type}>{type}</span>
          ))}
        </div>
        <div className="analytics-publication-empty">
          <Camera size={28} strokeWidth={1.2} />
          <strong>Публикации появятся здесь</strong>
          <p>Доступные метрики зависят от типа контента и разрешений Meta.</p>
        </div>
      </section>
    </>
  );
}
function RelationshipsPanels() {
  return (
    <>
      <section className="panel analytics-sources-panel">
        <div className="panel-heading">
          <div>
            <h2>Два источника. Общий контекст.</h2>
            <p>Сравнение по датам, платформам и кампаниям.</p>
          </div>
        </div>
        <Source icon={Camera} title="Instagram" detail="Контент · охват · взаимодействия" />
        <div className="analytics-source-bridge" aria-hidden="true">
          <span />
          <GitCompareArrows size={19} />
          <span />
        </div>
        <Source icon={Smartphone} title="Приложение" detail="Активация · удержание · покупки" />
        <div className="analytics-source-foot">
          <CircleDashed size={14} />
          Ожидаем оба источника
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Что будем сопоставлять</h2>
            <p>Вопросы, для которых появятся данные.</p>
          </div>
        </div>
        <div className="analytics-questions">
          {[
            ['Контент', 'Новые пользователи', 'Как меняются первые запуски рядом с публикациями.'],
            [
              'Диалоги и заявки',
              'Активация',
              'Какие кампании приводят к первому полезному действию.',
            ],
            ['Кампания', 'D7 retention', 'Возвращаются ли пользователи из разных источников.'],
          ].map(([from, to, caption]) => (
            <article key={from}>
              <div>
                <strong>{from}</strong>
                <ArrowRight size={14} />
                <strong>{to}</strong>
              </div>
              <p>{caption}</p>
            </article>
          ))}
        </div>
        <p className="analytics-correlation-note">
          Совпадение динамики — повод проверить гипотезу. Для атрибуции понадобятся размеченные
          ссылки и события приложения.
        </p>
      </section>
    </>
  );
}
export function AnalyticsPreview({ section }: { section: AnalyticsSection }) {
  const content = sections[section];
  return (
    <div className="analytics-preview">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{content.eyebrow}</div>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
        </div>
        <Badge tone="gray">Скоро</Badge>
      </div>
      <div className="analytics-context">
        <div>
          <content.icon size={15} />
          <span>{content.source}</span>
          <i />
          <small>Источник не подключён</small>
        </div>
        {section === 'app-analytics' && (
          <span className="analytics-platforms">
            iOS <i /> Android
          </span>
        )}
        {section === 'instagram-analytics' && (
          <span className="analytics-platforms">Профессиональный аккаунт</span>
        )}
      </div>
      <MetricCards metrics={content.metrics} />
      {section === 'app-analytics' && <Cohorts />}
      <div className="analytics-panels">
        {section === 'app-analytics' ? (
          <>
            <EmptyPlot
              title="Активность пользователей"
              description="Ежедневная, недельная и месячная аудитория."
              labels={['DAU', 'WAU', 'MAU']}
            />
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>От запуска до ценности</h2>
                  <p>Где пользователь делает следующий шаг.</p>
                </div>
              </div>
              <Journey
                steps={['Первый запуск', 'Завершённый onboarding', 'Первый урок', 'Покупка']}
              />
            </section>
          </>
        ) : section === 'instagram-analytics' ? (
          <InstagramPanels />
        ) : (
          <RelationshipsPanels />
        )}
      </div>
      {section === 'relationships' && (
        <EmptyPlot
          title="Динамика рядом"
          description="Публикации Instagram и ключевые события приложения на общей временной шкале."
          labels={['Instagram', 'Приложение']}
        />
      )}
      <div className="analytics-preview-note">
        <CircleDashed size={16} />
        <p>
          <strong>Раздел подготовлен.</strong> {content.note}
        </p>
      </div>
    </div>
  );
}
