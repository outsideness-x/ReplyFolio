import type { Contact, Conversation, Flow, Material, Snapshot } from '../../shared/types.ts';
import type { Repository } from './repository.ts';
import { api } from './session.ts';
export class SupabaseRepository implements Repository {
  mode = 'live' as const;
  constructor(private workspaceId: string) {}
  private call<T = unknown>(action: string, payload: Record<string, unknown> = {}) {
    return api<T>('workspace-api', { action, workspaceId: this.workspaceId, ...payload });
  }
  load() {
    return this.call<Snapshot>('read');
  }
  subscribe(listener: () => void) {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') listener();
    }, 15000);
    window.addEventListener('focus', listener);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', listener);
    };
  }
  async saveFlow(flow: Flow) {
    await this.call('save-flow', { flow });
  }
  async deleteFlow(id: string) {
    await this.call('delete-flow', { id });
  }
  async saveMaterial(material: Material) {
    await this.call('save-material', { material });
  }
  async deleteMaterial(id: string) {
    await this.call('delete-material', { id });
  }
  async updateContact(id: string, patch: Partial<Contact>) {
    await this.call('update-contact', { id, patch });
  }
  async updateConversation(id: string, patch: Partial<Conversation>) {
    await this.call('update-conversation', { id, patch });
  }
  async send(id: string, text: string) {
    await this.call('send', { id, text, requestId: crypto.randomUUID() });
  }
  async renameWorkspace(name: string) {
    await this.call('rename-workspace', { name });
  }
  async connect() {
    const result = await api<{ url: string }>('instagram-connect', {
      workspaceId: this.workspaceId,
    });
    return result.url;
  }
  async disconnect() {
    await this.call('disconnect');
  }
  async uploadMaterial(file: File) {
    if (
      file.size > 25 * 1024 * 1024 ||
      new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-'
    )
      throw new Error('Choose a PDF up to 25 MB.');
    const result = await this.call<{ path: string; uploadUrl: string; url: string }>('upload-url');
    const url = new URL(result.uploadUrl);
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co'))
      throw new Error('Upload unavailable.');
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
      body: file,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('Unable to upload the PDF.');
    return { path: result.path, url: result.url };
  }
  async removeUpload(path: string) {
    await this.call('remove-upload', { path });
  }
}
