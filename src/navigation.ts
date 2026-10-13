import {
  BookOpen,
  ChartNoAxesCombined,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Smartphone,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { Page } from './ui.tsx';
export const navigation: readonly {
  id: Page;
  title: string;
  label?: string;
  icon: LucideIcon;
  group: 'overview' | 'analytics' | 'direct' | 'tools';
  upcoming?: boolean;
  keywords?: string;
}[] = [
  { id: 'dashboard', title: 'Overview', icon: LayoutDashboard, group: 'overview' },
  {
    id: 'app-analytics',
    title: 'App analytics',
    label: 'App',
    icon: Smartphone,
    group: 'analytics',
    upcoming: true,
    keywords: 'ios android d1 d7 d30 retention cohorts dau mau',
  },
  {
    id: 'instagram-analytics',
    title: 'Instagram analytics',
    label: 'Instagram',
    icon: ChartNoAxesCombined,
    group: 'analytics',
    upcoming: true,
    keywords: 'instagram reach views posts reels',
  },
  {
    id: 'relationships',
    title: 'Relationships',
    icon: GitCompareArrows,
    group: 'analytics',
    upcoming: true,
    keywords: 'correlations attribution relationships growth',
  },
  { id: 'inbox', title: 'Inbox', icon: MessagesSquare, group: 'direct' },
  { id: 'flows', title: 'Flows', icon: Workflow, group: 'direct' },
  { id: 'materials', title: 'Materials', icon: BookOpen, group: 'direct' },
  { id: 'leads', title: 'Leads', icon: Users, group: 'direct' },
  { id: 'lab', title: 'Simulator', icon: FlaskConical, group: 'tools' },
  { id: 'settings', title: 'Settings', icon: Settings, group: 'tools' },
];
export const navigationGroups = [
  { id: 'overview', label: '' },
  { id: 'analytics', label: 'ANALYTICS' },
  { id: 'direct', label: 'DIRECT' },
  { id: 'tools', label: 'TOOLS' },
] as const;
