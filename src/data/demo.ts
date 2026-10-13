import { commentTemplate, materialTemplate } from '../../shared/templates.ts';
import type { Flow, Snapshot } from '../../shared/types.ts';
export const DEMO_WORKSPACE = '11111111-1111-4111-8111-111111111111';
export function demoSnapshot(now = Date.now()): Snapshot {
  const date = (minutes: number) => new Date(now - minutes * 60000).toISOString();
  const flow = (
    id: string,
    name: string,
    trigger: Flow['trigger_kind'],
    keywords: string[],
    description: string,
  ): Flow => ({
    id,
    workspace_id: DEMO_WORKSPACE,
    name,
    description,
    enabled: true,
    trigger_kind: trigger,
    keywords,
    post_ids: [],
    definition: trigger === 'comment_keyword' ? commentTemplate() : materialTemplate(),
    created_at: date(100),
    updated_at: date(20),
  });
  const materials = [
    {
      id: '55555555-5555-4555-8555-555555555551',
      workspace_id: DEMO_WORKSPACE,
      title: 'Your first step in learning',
      description: 'Sample learning material. Replace the link with a resource from your app.',
      url: 'https://example.com/lesson',
      kind: 'link' as const,
      created_at: date(90),
    },
    {
      id: '55555555-5555-4555-8555-555555555552',
      workspace_id: DEMO_WORKSPACE,
      title: 'Programs and pricing',
      description: 'Sample pricing. Add the current details of your courses.',
      url: 'https://example.com/pricing',
      kind: 'link' as const,
      created_at: date(80),
    },
  ];
  const flows = [
    flow(
      '66666666-6666-4666-8666-666666666661',
      'Learning resources',
      'dm_keyword',
      ['materials', 'guide', 'lesson'],
      'Introduce your courses and share learning resources',
    ),
    flow(
      '66666666-6666-4666-8666-666666666662',
      'Pricing and consultation',
      'dm_keyword',
      ['price', 'pricing'],
      'Course details and a lead for your team',
    ),
    flow(
      '66666666-6666-4666-8666-666666666663',
      'From comments to Direct',
      'comment_keyword',
      ['lesson', 'interested'],
      'One initial reply, then continue after the customer responds',
    ),
  ];
  for (const f of flows)
    for (const n of f.definition.nodes)
      if (n.type === 'send' && (n.id === 'material' || n.id === 'price')) {
        n.assetId = materials[n.id === 'material' ? 0 : 1].id;
        n.text =
          n.id === 'material'
            ? 'Your free resource is linked below.'
            : 'Course details and pricing are linked below.';
      }
  flows[1].definition.start = 'price';
  flows[1].definition.nodes = flows[1].definition.nodes.filter(
    (n) => !['intro', 'interest', 'material'].includes(n.id),
  );
  const names = [
    ['Anna Smirnova', 'anna.learn', 'new'],
    ['Max Orlov', 'max.orlov', 'qualified'],
    ['Alina Kim', 'alina.kim', 'contacted'],
    ['Artem Volkov', 'artem.study', 'enrolled'],
  ] as const;
  const contacts = names.map(([name, username, status], i) => ({
    id: `22222222-2222-4222-8222-22222222222${i}`,
    workspace_id: DEMO_WORKSPACE,
    instagram_scoped_id: `200${i}`,
    username,
    name,
    email: i ? 'student' + i + '@example.com' : '',
    phone: '',
    tags: i ? ['Interested in learning'] : [],
    status,
    source: i % 2 ? 'Comment' : 'Direct',
    is_lead: !!i,
    created_at: date(200 + i * 100),
    updated_at: date(5 + i * 10),
  }));
  const conversations = contacts.slice(0, 3).map((c, i) => ({
    id: `33333333-3333-4333-8333-33333333333${i}`,
    workspace_id: DEMO_WORKSPACE,
    account_id: 'demo-account',
    contact_id: c.id,
    status: 'open' as const,
    mode: i === 2 ? ('human' as const) : ('bot' as const),
    window_expires_at: new Date(now + 23 * 3600000).toISOString(),
    last_message: [
      'Hi! Could you tell me about your courses?',
      'Thanks, I received the materials!',
      "I'd like to discuss the program with your team",
    ][i],
    last_message_at: date(5 + i * 12),
    unread_count: i === 0 ? 1 : 0,
  }));
  const messages = conversations.map((c, i) => ({
    id: crypto.randomUUID(),
    workspace_id: DEMO_WORKSPACE,
    conversation_id: c.id,
    direction: 'in' as const,
    body: c.last_message,
    source: 'customer' as const,
    status: 'received' as const,
    created_at: date(5 + i * 12),
  }));
  return {
    workspace: { id: DEMO_WORKSPACE, name: 'EdTech team', created_at: date(2000) },
    contacts,
    conversations,
    messages,
    flows,
    materials,
    account: null,
    runs: [
      {
        id: crypto.randomUUID(),
        workspace_id: DEMO_WORKSPACE,
        flow_name: 'Learning resources',
        contact_name: 'Max Orlov',
        status: 'completed',
        detail: 'Demo resource delivery',
        created_at: date(17),
      },
      {
        id: crypto.randomUUID(),
        workspace_id: DEMO_WORKSPACE,
        flow_name: 'From comments to Direct',
        contact_name: 'Alina Kim',
        status: 'handoff',
        detail: 'Demo handoff to the team',
        created_at: date(29),
      },
    ],
  };
}
