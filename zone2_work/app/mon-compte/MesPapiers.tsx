'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Doc = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
};

type DocumentLimit = {
  limit: number | null;
  count: number;
};

export default function MesPapiers() {
  const supabase = createClient();

  const [documents, setDocuments] = useState<Doc[]>([]);
  const [documentLimit, setDocumentLimit] = useState<DocumentLimit | null>(null);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [open, setOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [viewerTitle, setViewerTitle] = useState('');

  const [name, setName] = useState('');
  const [type, setType] = useState('Diplôme');
  const [file, setFile] = useState<File | null>(null);

  const loadDocumentLimit = async () => {
    const res = await fetch('/api/documents/can-upload');
    const access = await res.json();

    setDocumentLimit({
      limit: access.limit,
      count: access.count,
    });
  };

  const loadDocuments = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('user_documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setDocuments(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadDocuments();
    loadDocumentLimit();
  }, []);

  const resetForm = () => {
    setName('');
    setType('Diplôme');
    setFile(null);
  };

  const addDocument = async () => {
    if (!name.trim()) return alert('Ajoute un nom au document.');
    if (!file) return alert('Ajoute un fichier PDF.');
    if (file.type !== 'application/pdf') {
      return alert('Le fichier doit être un PDF.');
    }

    const limitResponse = await fetch('/api/documents/can-upload');
    const access = await limitResponse.json();

    if (!access.canCreate) {
      alert(
        `Limite atteinte : ${access.limit} document(s) maximum avec votre abonnement.`
      );
      return;
    }

    setUploading(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setUploading(false);
      return alert('Tu dois être connecté.');
    }

    const safeFileName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-');

    const filePath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from('user-documents')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      setUploading(false);
      return alert(uploadError.message);
    }

    const { error: insertError } = await supabase
      .from('user_documents')
      .insert({
        user_id: user.id,
        name: name.trim(),
        type,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type,
        size_bytes: file.size,
      });

    if (insertError) {
      await supabase.storage.from('user-documents').remove([filePath]);
      setUploading(false);
      return alert(insertError.message);
    }

    resetForm();
    setOpen(false);
    setUploading(false);
    loadDocuments();
    loadDocumentLimit();
  };

  const consultDocument = async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from('user-documents')
      .createSignedUrl(doc.file_path, 60 * 10);

    if (error || !data?.signedUrl) {
      return alert(error?.message ?? 'Impossible d’ouvrir le document.');
    }

    setViewerTitle(doc.name);
    setViewerUrl(data.signedUrl);
  };

  const downloadDocument = async (doc: Doc) => {
    const { data, error } = await supabase.storage
      .from('user-documents')
      .createSignedUrl(doc.file_path, 60);

    if (error || !data?.signedUrl) {
      return alert(error?.message ?? 'Impossible de télécharger le document.');
    }

    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = doc.file_name;
    a.target = '_blank';
    a.click();
  };

  const deleteDocument = async (doc: Doc) => {
    if (!confirm(`Supprimer « ${doc.name} » ?`)) return;

    const { error: storageError } = await supabase.storage
      .from('user-documents')
      .remove([doc.file_path]);

    if (storageError) return alert(storageError.message);

    const { error: dbError } = await supabase
      .from('user_documents')
      .delete()
      .eq('id', doc.id);

    if (dbError) return alert(dbError.message);

    loadDocuments();
    loadDocumentLimit();
  };

  const limitText = documentLimit
    ? `Documents utilisés : ${documentLimit.count} / ${
        documentLimit.limit === null ? '∞' : documentLimit.limit
      }`
    : 'Charge tes diplômes, licences, contrats et certificats.';

  return (
    <>
      <div className="papers">
        <div className="papers-head">
          <div>
            <h2>Mes Papiers</h2>
            <p>{limitText}</p>
          </div>

          <button onClick={() => setOpen(true)}>+ Ajouter un document</button>
        </div>

        {loading ? (
          <div className="papers-empty">Chargement…</div>
        ) : documents.length === 0 ? (
          <div className="papers-empty">Aucun document ajouté pour le moment.</div>
        ) : (
          <div className="papers-list">
            {documents.map((doc) => (
              <div key={doc.id} className="paper-card">
                <div>
                  <strong>{doc.name}</strong>
                  <span>
                    {doc.type} · {doc.file_name}
                  </span>
                </div>

                <div className="paper-actions">
                  <button onClick={() => consultDocument(doc)}>👁 Consulter</button>
                  <button onClick={() => downloadDocument(doc)}>⬇ Télécharger</button>
                  <button className="danger" onClick={() => deleteDocument(doc)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="paper-modal-bg" onClick={() => setOpen(false)}>
          <div className="paper-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Ajouter un document</h3>

            <label>
              Nom du document
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : Diplôme DEJEPS"
              />
            </label>

            <label>
              Type de document
              <select value={type} onChange={(e) => setType(e.target.value)}>
                <option>Diplôme</option>
                <option>Certificat médical</option>
                <option>Licence</option>
                <option>Convention</option>
                <option>Contrat</option>
                <option>Autre</option>
              </select>
            </label>

            <label>
              Fichier PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="paper-modal-actions">
              <button onClick={() => setOpen(false)}>Annuler</button>
              <button className="primary" onClick={addDocument} disabled={uploading}>
                {uploading ? 'Ajout…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerUrl && (
        <div className="paper-viewer-bg" onClick={() => setViewerUrl('')}>
          <div className="paper-viewer" onClick={(e) => e.stopPropagation()}>
            <div className="paper-viewer-head">
              <strong>{viewerTitle}</strong>
              <button onClick={() => setViewerUrl('')}>✕</button>
            </div>

            <iframe src={viewerUrl} title={viewerTitle} />
          </div>
        </div>
      )}

      <style>{`
        .papers h2{font-family:Oswald,sans-serif;font-size:2.3rem;text-transform:uppercase;margin:0;color:#0F0F12}
        .papers p{margin:.3rem 0 0;color:#777;font-weight:600}
        .papers-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1.3rem}
        .papers-head button,.paper-modal-actions .primary{background:#6B1A2C;color:#fff;border:none;border-radius:999px;padding:.7rem 1.2rem;font-weight:900}
        .papers-empty{border:1px dashed #ddd;border-radius:16px;padding:2rem;color:#777;font-weight:700}
        .papers-list{display:flex;flex-direction:column;gap:.8rem}
        .paper-card{border:1px solid #eee;border-radius:16px;padding:1rem;display:flex;justify-content:space-between;align-items:center;gap:1rem;box-shadow:0 8px 24px rgba(60,30,20,.06)}
        .paper-card strong{display:block;font-size:1.05rem;color:#0F0F12}
        .paper-card span{display:block;color:#777;font-size:.9rem;margin-top:.2rem}
        .paper-actions{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
        .paper-actions button,.paper-modal-actions button{border:1px solid #ddd;background:#fff;color:#111;border-radius:10px;padding:.55rem .8rem;font-weight:900;text-decoration:none}
        .paper-actions .danger{background:#c5283d;color:#fff;border-color:#c5283d}
        .paper-modal-bg,.paper-viewer-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:6000;display:flex;justify-content:center;align-items:flex-start;padding:2rem 1rem}
        .paper-modal{background:#fff;border-radius:20px;padding:1.5rem;width:100%;max-width:560px}
        .paper-modal h3{font-family:Oswald,sans-serif;color:#6B1A2C;text-transform:uppercase;margin:0 0 1rem;font-size:1.7rem}
        .paper-modal label{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.9rem;font-weight:900;font-size:.8rem;text-transform:uppercase;color:#666}
        .paper-modal input,.paper-modal select{border:1px solid #ddd;border-radius:10px;padding:.7rem;font-size:1rem}
        .paper-modal-actions{display:flex;justify-content:flex-end;gap:.7rem;margin-top:1rem}
        .paper-modal-actions button:disabled{opacity:.5;cursor:not-allowed}
        .paper-viewer{background:#fff;width:100%;max-width:1000px;height:85vh;border-radius:18px;overflow:hidden;display:flex;flex-direction:column}
        .paper-viewer-head{padding:.8rem 1rem;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #eee}
        .paper-viewer-head button{border:none;background:#111;color:#fff;width:34px;height:34px;border-radius:50%;font-weight:900}
        .paper-viewer iframe{width:100%;height:100%;border:none}
        @media(max-width:800px){.papers-head,.paper-card{flex-direction:column;align-items:stretch}.paper-actions{width:100%}.paper-actions button{flex:1;text-align:center}}
      `}</style>
    </>
  );
}