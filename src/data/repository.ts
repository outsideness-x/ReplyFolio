import type { Contact, Conversation, Flow, Material, Snapshot } from '../../shared/types.ts';
export type Simulation = { text:string; kind:'dm'|'comment'; contactId?:string; postId?:string; payload?:string };
export interface Repository {
  mode:'demo'|'live'; load():Promise<Snapshot>; subscribe(listener:()=>void):()=>void;
  saveFlow(flow:Flow):Promise<void>; deleteFlow(id:string):Promise<void>;
  saveMaterial(material:Material):Promise<void>; deleteMaterial(id:string):Promise<void>;
  updateContact(id:string,patch:Partial<Contact>):Promise<void>;
  updateConversation(id:string,patch:Partial<Conversation>):Promise<void>;
  send(conversationId:string,text:string):Promise<void>;
  renameWorkspace(name:string):Promise<void>;
  connect():Promise<string>; disconnect():Promise<void>;
  simulate?(event:Simulation):Promise<string>; processDue?():Promise<void>; reset?():Promise<void>;
}
