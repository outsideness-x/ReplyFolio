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
  { id: 'dashboard', title: 'Обзор', icon: LayoutDashboard, group: 'overview' },
  {
    id: 'app-analytics',
    title: 'Аналитика приложения',
    label: 'Приложение',
    icon: Smartphone,
    group: 'analytics',
    upcoming: true,
    keywords: 'ios android d1 d7 d30 retention удержание когорты dau mau',
  },
  {
    id: 'instagram-analytics',
    title: 'Аналитика Instagram',
    label: 'Instagram',
    icon: ChartNoAxesCombined,
    group: 'analytics',
    upcoming: true,
    keywords: 'инстаграм охват просмотры публикации reels',
  },
  {
    id: 'relationships',
    title: 'Взаимосвязи',
    icon: GitCompareArrows,
    group: 'analytics',
    upcoming: true,
    keywords: 'корреляции атрибуция связи рост',
  },
  { id: 'inbox', title: 'Диалоги', icon: MessagesSquare, group: 'direct' },
  { id: 'flows', title: 'Сценарии', icon: Workflow, group: 'direct' },
  { id: 'materials', title: 'Материалы', icon: BookOpen, group: 'direct' },
  { id: 'leads', title: 'Заявки', icon: Users, group: 'direct' },
  { id: 'lab', title: 'Симулятор', icon: FlaskConical, group: 'tools' },
  { id: 'settings', title: 'Настройки', icon: Settings, group: 'tools' },
];
export const navigationGroups = [
  { id: 'overview', label: '' },
  { id: 'analytics', label: 'АНАЛИТИКА' },
  { id: 'direct', label: 'DIRECT' },
  { id: 'tools', label: 'ИНСТРУМЕНТЫ' },
] as const;
