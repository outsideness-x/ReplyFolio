import type { FlowDefinition } from './types.ts';

export function materialTemplate(): FlowDefinition {
  return { version: 1, start: 'intro', nodes: [
    { id: 'intro', type: 'send', next: 'interest', text: 'Привет! Я помощник команды. Помогу получить учебные материалы и узнать стоимость обучения.' },
    { id: 'interest', type: 'choice', next: null, text: 'Что вас интересует?', options: [{ id: 'materials', label: 'Учебные материалы', next: 'material' }, { id: 'price', label: 'Стоимость обучения', next: 'price' }] },
    { id: 'material', type: 'send', next: 'email', text: 'Вот ссылка на бесплатный материал. Добавьте материал к этому блоку в редакторе.' },
    { id: 'price', type: 'send', next: 'email', text: 'Добавьте актуальный прайс к этому блоку. Хотите, чтобы команда помогла выбрать обучение?' },
    { id: 'email', type: 'capture', field: 'email', next: 'tag', text: 'Оставьте email, если хотите, чтобы команда связалась с вами по поводу обучения. Отправляя контакт, вы соглашаетесь на такой ответ. Для выхода напишите «стоп».' },
    { id: 'tag', type: 'tag', next: 'lead', tags: ['Интерес к обучению'] },
    { id: 'lead', type: 'lead', next: 'thanks' },
    { id: 'thanks', type: 'send', next: 'end', text: 'Спасибо! Заявка сохранена. Команда свяжется с вами по указанному контакту.' },
    { id: 'end', type: 'end', next: null },
  ] };
}
export function commentTemplate(): FlowDefinition {
  return { version: 1, start: 'intro', nodes: [
    { id: 'intro', type: 'send', next: 'price', text: 'Привет! Спасибо за интерес к обучению. Ответьте «прайс» на это сообщение — пришлю условия и стоимость.' },
    { id: 'price', type: 'send', next: 'email', text: 'Вот актуальный прайс. Прикрепите его в редакторе сценария.' },
    { id: 'email', type: 'capture', field: 'email', next: 'lead', text: 'Если хотите консультацию по обучению, оставьте email для ответа команды. Для выхода напишите «стоп».' },
    { id: 'lead', type: 'lead', next: 'thanks' },
    { id: 'thanks', type: 'handoff', next: null, text: 'Спасибо! Передаю заявку команде.' },
  ] };
}
