import { useState } from 'react';
import type { Contact, LeadStatus } from '../../shared/types.ts';
import { leadLabels, Modal, useUI } from '../ui.tsx';
export function ContactEditor({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { repo, perform, busy } = useUI(),
    [draft, setDraft] = useState({ ...contact }),
    [tags, setTags] = useState(contact.tags.join(', '));
  return (
    <Modal title="Contact details" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await perform(
              () =>
                repo.updateContact(contact.id, {
                  name: draft.name,
                  email: draft.email,
                  phone: draft.phone,
                  status: draft.status,
                  is_lead: draft.is_lead,
                  tags: tags
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                }),
              'Contact saved.',
            )
          )
            onClose();
        }}
      >
        <label>
          Name
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            maxLength={120}
          />
        </label>
        <div className="form-row">
          <label>
            Email
            <input
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              type="tel"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              maxLength={30}
            />
          </label>
        </div>
        <label>
          Lead status
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as LeadStatus })}
          >
            {Object.entries(leadLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tags, separated by commas
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={draft.is_lead}
            onChange={(e) => setDraft({ ...draft, is_lead: e.target.checked })}
          />
          Save as a lead
        </label>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            Save contact
          </button>
        </div>
      </form>
    </Modal>
  );
}
