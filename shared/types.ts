export type LeadStatus = 'new' | 'qualified' | 'contacted' | 'enrolled' | 'archived';
export type CaptureField = 'name' | 'email' | 'phone';
export type TriggerKind = 'dm_keyword' | 'dm_any' | 'comment_keyword';
type BaseNode = { id: string; next: string | null };
export type FlowNode = BaseNode &
  (
    | { type: 'send'; text: string; assetId?: string }
    | {
        type: 'choice';
        text: string;
        options: { id: string; label: string; next: string | null }[];
      }
    | { type: 'capture'; field: CaptureField; text: string }
    | {
        type: 'condition';
        field: string;
        operator: 'equals' | 'contains' | 'exists';
        value: string;
        yes: string | null;
        no: string | null;
      }
    | { type: 'delay'; minutes: number }
    | { type: 'tag'; tags: string[] }
    | { type: 'lead' }
    | { type: 'handoff'; text: string }
    | { type: 'end' }
  );
export type FlowDefinition = { version: 1; start: string; nodes: FlowNode[] };
export type Flow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger_kind: TriggerKind;
  keywords: string[];
  post_ids: string[];
  definition: FlowDefinition;
  created_at: string;
  updated_at: string;
};
export type Material = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  url: string;
  kind: 'link' | 'pdf';
  created_at: string;
  storage_path?: string | null;
};
export type Contact = {
  id: string;
  workspace_id: string;
  instagram_scoped_id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
  status: LeadStatus;
  source: string;
  is_lead: boolean;
  created_at: string;
  updated_at: string;
};
export type Conversation = {
  id: string;
  workspace_id: string;
  account_id: string;
  contact_id: string;
  status: 'open' | 'closed';
  mode: 'bot' | 'human';
  window_expires_at: string | null;
  last_message: string;
  last_message_at: string;
  unread_count: number;
};
export type Message = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  instagram_message_id?: string | null;
  direction: 'in' | 'out';
  body: string;
  quick_replies?: { title: string; payload: string }[];
  source: 'customer' | 'bot' | 'operator';
  status: 'received' | 'queued' | 'accepted' | 'failed' | 'uncertain';
  error?: string | null;
  created_at: string;
};
export type InstagramAccount = {
  id: string;
  workspace_id: string;
  ig_user_id: string;
  username: string;
  status: 'connected' | 'disconnected' | 'error';
  token_expires_at: string | null;
  last_error: string | null;
};
export type RunLog = {
  id: string;
  workspace_id: string;
  flow_name: string;
  contact_name: string;
  status: 'completed' | 'waiting' | 'handoff' | 'failed';
  detail: string;
  created_at: string;
};
export type Workspace = { id: string; name: string; created_at: string };
export type Snapshot = {
  workspace: Workspace;
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  flows: Flow[];
  materials: Material[];
  account: InstagramAccount | null;
  runs: RunLog[];
};
export type FlowSession = {
  flowId: string;
  nodeId: string;
  waiting: 'choice' | 'capture' | 'delay' | 'reply' | null;
  resumeAt: string | null;
  variables: Record<string, string>;
  tags: string[];
  lead: boolean;
  definition?: FlowDefinition;
};
export type SendAction = {
  type: 'send';
  nodeId: string;
  text: string;
  quickReplies: { title: string; payload: string }[];
};
export type EngineResult = {
  actions: SendAction[];
  session: FlowSession | null;
  variables: Record<string, string>;
  tags: string[];
  lead: boolean;
  handoff: boolean;
};
