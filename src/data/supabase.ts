import { createClient } from '@supabase/supabase-js';
import type { Contact, Conversation, Flow, Material, Snapshot } from '../../shared/types.ts';
import type { Repository } from './repository.ts';
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
function unsafeKey(value:string):boolean{if(value.startsWith('sb_secret_'))return true;try{return JSON.parse(atob(value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='service_role';}catch{return false;}}
export const configurationError=!!url!==!!key?'Укажите оба параметра Supabase в .env.':key&&unsafeKey(key)?'В браузере разрешён только публичный ключ Supabase. Удалите серверный ключ.':url&&!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(url)&&!/^http:\/\/(localhost|127\.0\.0\.1):54321\/?$/.test(url)?'Проверьте URL проекта Supabase.':null;
const forceDemo=typeof location!=='undefined'&&new URL(location.href).searchParams.get('demo')==='1';
export const supabase=url&&key&&!configurationError&&!forceDemo?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export class SupabaseRepository implements Repository{
  mode='live' as const;
  constructor(private workspaceId:string){}
  private async call(action:string,payload:Record<string,unknown>={}){
    const {data,error}=await supabase!.functions.invoke('workspace-api',{body:{action,workspaceId:this.workspaceId,...payload}});
    if(error){let message='Не удалось выполнить операцию. Проверьте подключение.';try{const body=await error.context?.json();if(body?.error)message=body.error;}catch{ /* Network failure has no JSON response. */ }throw new Error(message);}if(data?.error)throw new Error(data.error);return data;
  }
  async load():Promise<Snapshot>{
    const tables=['workspaces','contacts','conversations','messages','flows','materials','instagram_accounts','automation_runs']as const;
    const results=await Promise.all(tables.map((table)=>{
      const q=supabase!.from(table).select('*').eq(table==='workspaces'?'id':'workspace_id',this.workspaceId);
      return table==='messages'?q.order('created_at',{ascending:false}).limit(1000):table==='automation_runs'?q.order('created_at',{ascending:false}).limit(100):q;
    }));
    const failed=results.find((r)=>r.error);if(failed)throw new Error('Не удалось загрузить данные. Проверьте миграции и права доступа.');
    const [ws,contacts,conversations,messages,flows,materials,account,runs]=results.map((r)=>r.data??[]);
    if(!ws[0])throw new Error('Рабочее пространство недоступно.');
    return {workspace:ws[0],contacts,conversations,messages:messages.reverse(),flows,materials,account:account[0]??null,runs}as Snapshot;
  }
  subscribe(listener:()=>void){const channel=supabase!.channel('workspace-'+this.workspaceId);for(const table of ['contacts','conversations','messages','flows','materials','instagram_accounts','automation_runs'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`workspace_id=eq.${this.workspaceId}`},listener);channel.subscribe();return()=>{void supabase!.removeChannel(channel);};}
  async saveFlow(flow:Flow){await this.call('save-flow',{flow});}
  async deleteFlow(id:string){await this.call('delete-flow',{id});}
  async saveMaterial(material:Material){await this.call('save-material',{material});}
  async deleteMaterial(id:string){await this.call('delete-material',{id});}
  async updateContact(id:string,patch:Partial<Contact>){await this.call('update-contact',{id,patch});}
  async updateConversation(id:string,patch:Partial<Conversation>){await this.call('update-conversation',{id,patch});}
  async send(id:string,text:string){await this.call('send',{id,text,requestId:crypto.randomUUID()});}
  async renameWorkspace(name:string){await this.call('rename-workspace',{name});}
  async connect(){const {data,error}=await supabase!.functions.invoke('instagram-connect',{body:{workspaceId:this.workspaceId}});if(error||!data?.url)throw new Error('Не удалось начать подключение. Проверьте настройки Meta.');return data.url as string;}
  async disconnect(){await this.call('disconnect');}
}
