import {
  assertMessage,
  canPrivateReply,
  canSend,
  isHandoffCommand,
  isHttpsUrl,
  isStopCommand,
  routeEvent,
  runFlow,
  validateFlow,
  WINDOW_MS,
} from '../../shared/engine.ts';
import type {
  Contact,
  Conversation,
  EngineResult,
  Flow,
  FlowSession,
  Material,
  Snapshot,
} from '../../shared/types.ts';
import { demoSnapshot } from './demo.ts';
import type { Repository, Simulation } from './repository.ts';
type State = { version: 1; snapshot: Snapshot; sessions: Record<string, FlowSession> };
export class LocalRepository implements Repository {
  mode = 'demo' as const;
  private state: State;
  private listeners = new Set<() => void>();
  private key = 'replyfolio.demo.v1';
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    private now = () => Date.now(),
    private seed: (now: number) => Snapshot = demoSnapshot,
  ) {
    let state: State | null = null;
    try {
      const raw = storage.getItem(this.key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (
        parsed?.version === 1 &&
        parsed.snapshot?.workspace &&
        ['contacts', 'conversations', 'messages', 'flows', 'materials', 'runs'].every((k) =>
          Array.isArray(parsed.snapshot[k]),
        ) &&
        parsed.sessions
      )
        state = parsed;
    } catch {
      /* A malformed demo cache is replaced with fresh demonstration data. */
    }
    this.state = state ?? { version: 1, snapshot: seed(now()), sessions: {} };
  }
  async load() {
    return structuredClone(this.state.snapshot);
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private changed() {
    this.storage.setItem(this.key, JSON.stringify(this.state));
    for (const listener of this.listeners) listener();
  }
  private contact(id: string) {
    const c = this.state.snapshot.contacts.find((c) => c.id === id);
    if (!c) throw new Error('Contact not found.');
    return c;
  }
  private conversation(id: string) {
    const c = this.state.snapshot.conversations.find((c) => c.id === id);
    if (!c) throw new Error('Conversation not found.');
    return c;
  }
  async saveFlow(flow: Flow) {
    validateFlow(flow);
    const list = this.state.snapshot.flows;
    const index = list.findIndex((f) => f.id === flow.id);
    const saved = structuredClone({ ...flow, updated_at: new Date(this.now()).toISOString() });
    if (index < 0) list.push(saved);
    else list[index] = saved;
    this.changed();
  }
  async deleteFlow(id: string) {
    this.state.snapshot.flows = this.state.snapshot.flows.filter((f) => f.id !== id);
    for (const [c, s] of Object.entries(this.state.sessions))
      if (s.flowId === id) delete this.state.sessions[c];
    this.changed();
  }
  async saveMaterial(m: Material) {
    if (!m.title.trim() || !isHttpsUrl(m.url)) throw new Error('Enter a title and an HTTPS link.');
    const list = this.state.snapshot.materials,
      index = list.findIndex((x) => x.id === m.id);
    if (index < 0) list.push(structuredClone(m));
    else list[index] = structuredClone(m);
    this.changed();
  }
  async deleteMaterial(id: string) {
    if (
      this.state.snapshot.flows.some((f) =>
        f.definition.nodes.some((n) => n.type === 'send' && n.assetId === id),
      ) ||
      Object.values(this.state.sessions).some((s) =>
        s.definition?.nodes.some((n) => n.type === 'send' && n.assetId === id),
      )
    )
      throw new Error('This material is used in a flow. Remove it from the flow blocks first.');
    this.state.snapshot.materials = this.state.snapshot.materials.filter((m) => m.id !== id);
    this.changed();
  }
  async updateContact(id: string, patch: Partial<Contact>) {
    Object.assign(this.contact(id), patch, { id, updated_at: new Date(this.now()).toISOString() });
    this.changed();
  }
  async updateConversation(id: string, patch: Partial<Conversation>) {
    const c = this.conversation(id);
    if (patch.mode && patch.mode !== c.mode) delete this.state.sessions[id];
    Object.assign(c, patch, { id });
    this.changed();
  }
  private message(
    c: Conversation,
    text: string,
    direction: 'in' | 'out',
    source: 'customer' | 'bot' | 'operator',
    quickReplies: { title: string; payload: string }[] = [],
  ) {
    this.state.snapshot.messages.push({
      id: crypto.randomUUID(),
      workspace_id: c.workspace_id,
      conversation_id: c.id,
      direction,
      body: text,
      source,
      status: direction === 'in' ? 'received' : 'accepted',
      quick_replies: quickReplies,
      created_at: new Date(this.now()).toISOString(),
    });
    c.last_message = text;
    c.last_message_at = new Date(this.now()).toISOString();
    if (direction === 'in') c.unread_count++;
  }
  async send(id: string, text: string) {
    assertMessage(text);
    const c = this.conversation(id);
    if (!canSend(c.window_expires_at, this.now()))
      throw new Error('The messaging window is closed. Wait for a new message from the customer.');
    c.mode = 'human';
    delete this.state.sessions[id];
    this.message(c, text, 'out', 'operator');
    this.changed();
  }
  private apply(c: Conversation, f: Flow, result: EngineResult) {
    const contact = this.contact(c.contact_id);
    for (const field of ['name', 'email', 'phone'] as const)
      if (result.variables[field]) contact[field] = result.variables[field];
    contact.tags = [...new Set([...contact.tags, ...result.tags])];
    contact.is_lead ||= result.lead;
    contact.updated_at = new Date(this.now()).toISOString();
    if (result.handoff) c.mode = 'human';
    if (result.session) this.state.sessions[c.id] = result.session;
    else delete this.state.sessions[c.id];
    for (const action of result.actions)
      this.message(c, action.text, 'out', 'bot', action.quickReplies);
    this.state.snapshot.runs.unshift({
      id: crypto.randomUUID(),
      workspace_id: c.workspace_id,
      flow_name: f.name,
      contact_name: contact.name || contact.username || 'Test customer',
      status: result.handoff ? 'handoff' : result.session ? 'waiting' : 'completed',
      detail: result.note ?? `${result.actions.length} messages in the simulator`,
      created_at: new Date(this.now()).toISOString(),
    });
  }
  async simulate(event: Simulation): Promise<string> {
    if (!event.text.trim() && !event.payload) throw new Error('Enter a message.');
    let contact = event.contactId ? this.contact(event.contactId) : undefined;
    if (!contact) {
      contact = {
        id: crypto.randomUUID(),
        workspace_id: this.state.snapshot.workspace.id,
        instagram_scoped_id: 'demo-' + crypto.randomUUID(),
        username: 'test.student',
        name: 'Test customer',
        email: '',
        phone: '',
        tags: [],
        status: 'new',
        source: event.kind === 'comment' ? 'Comment' : 'Direct',
        is_lead: false,
        created_at: new Date(this.now()).toISOString(),
        updated_at: new Date(this.now()).toISOString(),
      };
      this.state.snapshot.contacts.push(contact);
    }
    let c = this.state.snapshot.conversations.find((x) => x.contact_id === contact.id);
    if (!c) {
      c = {
        id: crypto.randomUUID(),
        workspace_id: contact.workspace_id,
        account_id: 'demo-account',
        contact_id: contact.id,
        status: 'open',
        mode: 'bot',
        window_expires_at: null,
        last_message: '',
        last_message_at: new Date(this.now()).toISOString(),
        unread_count: 0,
      };
      this.state.snapshot.conversations.push(c);
    }
    if (event.kind === 'dm') c.window_expires_at = new Date(this.now() + WINDOW_MS).toISOString();
    this.message(
      c,
      event.kind === 'comment' ? '[Comment] ' + event.text : event.text,
      'in',
      'customer',
    );
    if (isStopCommand(event.text) || isHandoffCommand(event.text)) {
      c.mode = 'human';
      delete this.state.sessions[c.id];
      if (isHandoffCommand(event.text) && canSend(c.window_expires_at, this.now()))
        this.message(c, "I'm passing this conversation to our team.", 'out', 'bot');
      this.changed();
      return c.id;
    }
    if (c.mode === 'bot') {
      const route = routeEvent(
        this.state.snapshot.flows,
        this.state.sessions[c.id],
        event,
        this.now(),
      );
      const { flow, session } = route;
      if (!flow && route.discard) delete this.state.sessions[c.id];
      if (flow) {
        try {
          this.apply(
            c,
            flow,
            runFlow(flow, {
              session,
              input: session ? { text: event.text, payload: event.payload } : undefined,
              materials: this.state.snapshot.materials,
              variables: {
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                username: contact.username,
              },
              now: this.now(),
              privateReply: event.kind === 'comment',
            }),
          );
        } catch (e) {
          this.state.snapshot.runs.unshift({
            id: crypto.randomUUID(),
            workspace_id: c.workspace_id,
            flow_name: flow.name,
            contact_name: contact.name,
            status: 'failed',
            detail: e instanceof Error ? e.message : 'Flow error',
            created_at: new Date(this.now()).toISOString(),
          });
          this.changed();
          throw e;
        }
      }
    }
    this.changed();
    return c.id;
  }
  async processDue() {
    let dirty = false;
    for (const [id, s] of Object.entries(this.state.sessions)) {
      if (s.waiting !== 'delay' || !s.resumeAt || Date.parse(s.resumeAt) > this.now()) continue;
      const c = this.conversation(id),
        f = this.state.snapshot.flows.find((x) => x.id === s.flowId && x.enabled);
      if (c.mode !== 'bot' || !canSend(c.window_expires_at, this.now()) || !f) {
        delete this.state.sessions[id];
        dirty = true;
        continue;
      }
      this.apply(
        c,
        f,
        runFlow(f, { session: s, materials: this.state.snapshot.materials, now: this.now() }),
      );
      dirty = true;
    }
    if (dirty) this.changed();
  }
  pendingDelay(conversationId: string): string | null {
    const s = this.state.sessions[conversationId];
    return s?.waiting === 'delay' ? s.resumeAt : null;
  }
  async skipDelay(conversationId: string) {
    const s = this.state.sessions[conversationId];
    if (s?.waiting !== 'delay') return;
    s.resumeAt = new Date(this.now()).toISOString();
    await this.processDue();
  }
  async reset() {
    this.state = { version: 1, snapshot: this.seed(this.now()), sessions: {} };
    this.changed();
  }
  async renameWorkspace(name: string) {
    if (!name.trim() || name.length > 120) throw new Error('Enter a name of up to 120 characters.');
    this.state.snapshot.workspace.name = name.trim();
    this.changed();
  }
  async connect(): Promise<string> {
    throw new Error('Set up Supabase and your Meta app before connecting a live account.');
  }
  async disconnect() {
    throw new Error('A live Instagram account is not connected in demo mode.');
  }
}
