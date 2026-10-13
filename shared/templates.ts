import type { FlowDefinition } from './types.ts';

export function materialTemplate(): FlowDefinition {
  return {
    version: 1,
    start: 'intro',
    nodes: [
      {
        id: 'intro',
        type: 'send',
        next: 'interest',
        text: "Hi! I'm your team's assistant. I can help you find learning resources and course pricing.",
      },
      {
        id: 'interest',
        type: 'choice',
        next: null,
        text: 'What are you interested in?',
        options: [
          { id: 'materials', label: 'Learning resources', next: 'material' },
          { id: 'price', label: 'Course pricing', next: 'price' },
        ],
      },
      {
        id: 'material',
        type: 'send',
        next: 'email',
        text: "Here's a link to your free resource. Add your material to this block in the editor.",
      },
      {
        id: 'price',
        type: 'send',
        next: 'email',
        text: 'Add your current pricing to this block. Would you like our team to help you choose a course?',
      },
      {
        id: 'email',
        type: 'capture',
        field: 'email',
        next: 'tag',
        text: "Leave your email if you'd like our team to contact you about the courses. Sharing your details means you agree to this reply. Type “stop” to leave.",
      },
      { id: 'tag', type: 'tag', next: 'lead', tags: ['Interested in learning'] },
      { id: 'lead', type: 'lead', next: 'thanks' },
      {
        id: 'thanks',
        type: 'send',
        next: 'end',
        text: 'Thanks! Your lead has been saved. Our team will contact you using the details you provided.',
      },
      { id: 'end', type: 'end', next: null },
    ],
  };
}
export function commentTemplate(): FlowDefinition {
  return {
    version: 1,
    start: 'intro',
    nodes: [
      {
        id: 'intro',
        type: 'send',
        next: 'price',
        text: "Hi! Thanks for your interest in our courses. Reply “price” to this message and I'll send the details and pricing.",
      },
      {
        id: 'price',
        type: 'send',
        next: 'email',
        text: "Here's the current pricing. Attach it in the flow editor.",
      },
      {
        id: 'email',
        type: 'capture',
        field: 'email',
        next: 'lead',
        text: "Leave your email if you'd like our team to advise you on the courses. Type “stop” to leave.",
      },
      { id: 'lead', type: 'lead', next: 'thanks' },
      {
        id: 'thanks',
        type: 'handoff',
        next: null,
        text: "Thanks! I'm passing your lead to our team.",
      },
    ],
  };
}
