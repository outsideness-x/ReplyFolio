# Удаление данных — шаблон публичной инструкции

**Заполните поля и опубликуйте свою HTTPS-страницу для настроек Meta.**

Чтобы удалить данные, переданные [название бизнеса] через Instagram:

1. Напишите на [контактный email] или в Direct [аккаунт бизнеса] с запросом «Удалить мои данные».
2. Укажите свой Instagram username. Мы проверим, что запрос относится к вашему аккаунту, без запроса пароля Instagram.
3. Мы удалим связанные контакты, заявки, историю сообщений и активные сценарии в нашей базе в срок [срок ответа/удаления], за исключением данных, которые обязаны хранить [основание и срок].
4. Данные в резервных копиях удаляются по циклу [срок]. Об удалении мы сообщим [способ подтверждения].

Сообщения в самом Instagram хранятся и управляются Meta отдельно. Удаление у нас не удаляет копию переписки в Instagram автоматически. Команда «стоп» прекращает автоматические ответы и не заменяет запрос на удаление.

Владелец бизнеса может отключить ReplyFolio через «Настройки → Отключить Instagram» и отозвать разрешение приложения в настройках Instagram. Это удаляет серверный токен ReplyFolio; бизнес-данные удаляются отдельно.

---

## Внутренняя инструкция администратора (не публиковать)

Найдите контакт по scoped ID/username в нужном workspace. Сделайте проверку личности через тот же Direct. Используйте параметризованное удаление контакта: каскады удалят conversations/messages/sessions. Удалите связанные pending/processing задания по найденным conversationId и event.senderId, чтобы старый webhook не восстановил контакт. Примените запрос также к управляемым экспортам и бэкапам согласно политике.

```sql
-- Замените значения только после проверки запроса.
begin;
-- Остановите worker на время операции, чтобы не обработать удаляемое событие параллельно.
update public.conversations set mode='human', mode_revision=mode_revision+1
where contact_id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID';
delete from private.jobs where
  payload->>'conversationId' in (
    select id::text from public.conversations
    where contact_id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID'
  ) or (
    payload->>'senderId'=(select instagram_scoped_id from public.contacts where id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID')
    and payload->>'accountId'=(select ig_user_id from public.instagram_accounts where workspace_id='WORKSPACE_UUID')
  );
-- automation_runs содержит отображаемое имя; удаляем связанные записи до удаления контакта.
delete from public.automation_runs where workspace_id='WORKSPACE_UUID' and contact_name in (
  select name from public.contacts where id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID'
  union select username from public.contacts where id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID'
);
delete from public.contacts where id='CONTACT_UUID' and workspace_id='WORKSPACE_UUID';
commit;
```

Удаление новых обращений после запроса не означает блокировку: если пользователь снова пишет бизнесу, создаётся новый контакт. Не предоставляйте service_role клиенту. В первой версии нет кнопки удаления персональных данных или автоматического Meta deletion callback; используйте опубликованную ручную процедуру.
