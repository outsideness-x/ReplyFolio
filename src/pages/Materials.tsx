import { useState } from 'react';
import {
  BookOpen,
  Edit3,
  ExternalLink,
  FileText,
  Link2,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Material } from '../../shared/types.ts';
import { isHttpsUrl } from '../../shared/engine.ts';
import { Badge, Empty, Modal, useUI } from '../ui.tsx';
export function Materials() {
  const { data, repo, perform, busy, notify } = useUI(),
    [query, setQuery] = useState(''),
    [editing, setEditing] = useState<Material | null>(null),
    [deleting, setDeleting] = useState<Material | null>(null);
  const list = data.materials.filter((m) =>
    (m.title + ' ' + m.description).toLowerCase().includes(query.toLowerCase()),
  );
  const create = () =>
    setEditing({
      id: crypto.randomUUID(),
      workspace_id: data.workspace.id,
      title: '',
      description: '',
      url: '',
      kind: 'link',
      created_at: new Date().toISOString(),
    });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR LIBRARY</div>
          <h1>Materials</h1>
          <p>A useful introduction to your courses.</p>
        </div>
        <button className="button primary" onClick={create}>
          <Plus size={16} />
          Add material
        </button>
      </div>
      <div className="table-toolbar">
        <div className="table-search">
          <Search size={16} />
          <input
            aria-label="Search materials"
            placeholder="Search the library"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Badge tone="gray">{data.materials.length} materials</Badge>
      </div>
      {list.length ? (
        <div className="cards-grid">
          {list.map((m) => (
            <article className="material-card" key={m.id}>
              <div className="material-cover">
                {m.kind === 'pdf' ? <FileText size={42} /> : <BookOpen size={42} />}
              </div>
              <div>
                <Badge tone="gray">{m.kind === 'pdf' ? 'PDF' : 'Link'}</Badge>
              </div>
              <h3 style={{ marginTop: 13 }}>{m.title}</h3>
              <p>{m.description || 'Ready to add to a flow.'}</p>
              <div className="material-url">{m.url}</div>
              <div className="card-footer">
                <a className="button small" href={m.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} />
                  Open
                </a>
                <button
                  className="icon-button"
                  aria-label={'Edit ' + m.title}
                  onClick={() => setEditing(m)}
                >
                  <Edit3 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label={'Delete ' + m.title}
                  onClick={() => setDeleting(m)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            title="Your library starts here"
            description="Add a free lesson, pricing or a useful PDF to share with learners."
          >
            <button className="button primary" onClick={create}>
              <Plus size={16} />
              Add material
            </button>
          </Empty>
        </section>
      )}
      {editing && (
        <MaterialEditor key={editing.id} material={editing} onClose={() => setEditing(null)} />
      )}{' '}
      {deleting && (
        <Modal title="Delete this material?" onClose={() => setDeleting(null)}>
          <p className="form-hint">
            «{deleting.title}” will be removed from the library. Materials used in a flow or active
            conversation cannot be deleted.
          </p>
          <div className="modal-footer">
            <button className="button" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await perform(() => repo.deleteMaterial(deleting.id), 'Material deleted.'))
                  setDeleting(null);
              }}
            >
              Delete material
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function MaterialEditor({ material, onClose }: { material: Material; onClose: () => void }) {
  const { repo, perform, busy, notify } = useUI(),
    [draft, setDraft] = useState({ ...material }),
    [file, setFile] = useState<File | null>(null);
  return (
    <Modal title={material.title ? 'Edit material' : 'New material'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await perform(async () => {
            let saved = { ...draft },
              uploaded: string | null = null;
            if (file) {
              if (!repo.uploadMaterial || repo.mode !== 'live')
                throw new Error('PDF uploads are available after connecting Supabase.');
              if (file.size > 25 * 1024 * 1024)
                throw new Error('The PDF must be smaller than 25 MB.');
              if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-')
                throw new Error('Choose a PDF file.');
              const result = await repo.uploadMaterial(file);
              uploaded = result.path;
              saved = {
                ...saved,
                url: result.url,
                kind: 'pdf',
                storage_path: result.path,
              };
            }
            if (!isHttpsUrl(saved.url)) {
              if (uploaded) await repo.removeUpload?.(uploaded);
              throw new Error('Enter an HTTPS link.');
            }
            try {
              await repo.saveMaterial(saved);
            } catch (e) {
              if (uploaded) await repo.removeUpload?.(uploaded);
              throw e;
            }
          }, 'Material saved.');
          if (ok) onClose();
        }}
      >
        <label>
          Title
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
            maxLength={120}
            placeholder="For example, a free introductory lesson"
          />
        </label>
        <label>
          Description
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            maxLength={2000}
            placeholder="A brief description"
            rows={3}
          />
        </label>
        <label>
          HTTPS link
          <input
            type="url"
            value={draft.url}
            onChange={(e) => {
              setDraft({ ...draft, url: e.target.value, storage_path: null });
              setFile(null);
            }}
            placeholder="https://…"
            required={!file}
          />
          <small>Learners must be able to access the material through this link.</small>
        </label>
        <div className="upload-zone">
          <Upload size={22} />
          <span>
            {repo.mode === 'demo'
              ? 'You can upload PDFs after connecting services'
              : 'Or upload a PDF up to 25 MB'}
          </span>
          {repo.mode === 'live' && (
            <input
              aria-label="Upload PDF"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          )}
          <small>{file?.name || 'Library files are shared through public links.'}</small>
        </div>
        <div className="modal-footer">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy || !draft.title.trim()}>
            Save material
          </button>
        </div>
      </form>
    </Modal>
  );
}
