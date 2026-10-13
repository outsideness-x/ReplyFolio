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
    title: 'App analytics',
    description:
      'From the first launch to the habit of returning. iOS and Android in one workspace.',
    icon: Smartphone,
    source: 'App events',
    note: 'Connect your app events to see activity, retention and the user journey here.',
    metrics: [
      ['D1 retention', 'Return on the next day'],
      ['D7 retention', 'Return on day seven'],
      ['D30 retention', 'Return on day thirty'],
      ['MAU', 'Monthly active users'],
    ],
  },
  'instagram-analytics': {
    eyebrow: 'INSTAGRAM INSIGHTS',
    title: 'Instagram analytics',
    description: 'How content creates interest: reach, engagement and account growth.',
    icon: Camera,
    source: 'Instagram Insights',
    note: 'Insights requires a separate connection. Your existing Direct connection does not load these metrics.',
    metrics: [
      ['Reach', 'Unique accounts'],
      ['Views', 'Content views'],
      ['Engagement', 'Interactions with posts'],
      ['Followers', 'Audience growth'],
    ],
  },
  relationships: {
    eyebrow: 'CONNECTED ANALYTICS',
    title: 'Relationships',
    description: 'One view of content, conversations and behavior in your app.',
    icon: GitCompareArrows,
    source: 'Shared data',
    note: 'Comparisons will be available after both sources are connected and their date ranges aligned.',
    metrics: [
      ['Sources', 'App and Instagram'],
      ['Shared period', 'Matching dates'],
      ['Comparisons', 'Time series to compare'],
      ['Observations', 'Testable hypotheses'],
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
          <strong>No data yet</strong>
          <span>Your trends will appear after connecting a source.</span>
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
          <strong aria-label="No data">—</strong>
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
            <small>No data</small>
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
      <span className="analytics-source-state">Not connected</span>
    </div>
  );
}
function Cohorts() {
  const days = ['D0', 'D1', 'D3', 'D7', 'D14', 'D30'];
  return (
    <section className="panel analytics-cohorts">
      <div className="panel-heading">
        <div>
          <h2>Retention cohorts</h2>
          <p>User returns by day since their first launch.</p>
        </div>
        <span className="analytics-detail-label">iOS · Android</span>
      </div>
      <div className="analytics-table-scroll">
        <table aria-label="Retention cohorts without data">
          <thead>
            <tr>
              <th>Cohort</th>
              <th>Users</th>
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
                  <span className="sr-only">Cohort not loaded</span>
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
        Cohorts will appear after you connect app events.
      </p>
    </section>
  );
}
function InstagramPanels() {
  return (
    <>
      <EmptyPlot
        title="Account trends"
        description="Reach and engagement over the same period."
        labels={['Reach', 'Engagement']}
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Content and response</h2>
            <p>One post. Multiple signals.</p>
          </div>
        </div>
        <div className="analytics-content-types">
          {['Reels', 'Posts', 'Stories'].map((type) => (
            <span key={type}>{type}</span>
          ))}
        </div>
        <div className="analytics-publication-empty">
          <Camera size={28} strokeWidth={1.2} />
          <strong>Your posts will appear here</strong>
          <p>Available metrics depend on the content type and Meta permissions.</p>
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
            <h2>Two sources. Shared context.</h2>
            <p>Compare by date, platform and campaign.</p>
          </div>
        </div>
        <Source icon={Camera} title="Instagram" detail="Content · reach · engagement" />
        <div className="analytics-source-bridge" aria-hidden="true">
          <span />
          <GitCompareArrows size={19} />
          <span />
        </div>
        <Source icon={Smartphone} title="App" detail="Activation · retention · purchases" />
        <div className="analytics-source-foot">
          <CircleDashed size={14} />
          Waiting for both sources
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>What we'll compare</h2>
            <p>Questions your data can help answer.</p>
          </div>
        </div>
        <div className="analytics-questions">
          {[
            ['Content', 'New users', 'How first launches change around your posts.'],
            [
              'Conversations and leads',
              'Activation',
              'Which campaigns lead to the first meaningful action.',
            ],
            ['Campaign', 'D7 retention', 'Whether users from different sources return.'],
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
          Similar trends give you a hypothesis to test. Attribution will require tagged links and
          app events.
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
        <Badge tone="gray">Coming soon</Badge>
      </div>
      <div className="analytics-context">
        <div>
          <content.icon size={15} />
          <span>{content.source}</span>
          <i />
          <small>Source not connected</small>
        </div>
        {section === 'app-analytics' && (
          <span className="analytics-platforms">
            iOS <i /> Android
          </span>
        )}
        {section === 'instagram-analytics' && (
          <span className="analytics-platforms">Professional account</span>
        )}
      </div>
      <MetricCards metrics={content.metrics} />
      {section === 'app-analytics' && <Cohorts />}
      <div className="analytics-panels">
        {section === 'app-analytics' ? (
          <>
            <EmptyPlot
              title="User activity"
              description="Daily, weekly and monthly audiences."
              labels={['DAU', 'WAU', 'MAU']}
            />
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>From launch to value</h2>
                  <p>Where users take their next step.</p>
                </div>
              </div>
              <Journey
                steps={['First launch', 'Onboarding completed', 'First lesson', 'Purchase']}
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
          title="Trends side by side"
          description="Instagram posts and key app events on a shared timeline."
          labels={['Instagram', 'App']}
        />
      )}
      <div className="analytics-preview-note">
        <CircleDashed size={16} />
        <p>
          <strong>Section prepared.</strong> {content.note}
        </p>
      </div>
    </div>
  );
}
