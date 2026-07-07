import React, { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Trash2, AlertCircle, CheckCircle, Clock } from 'lucide-react';

export default function DocManager({ onDocsUpdated }) {
  const [documents, setDocuments] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notification, setNotification] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  useEffect(() => { fetchDocuments(); return () => stopPolling(); }, []);

  useEffect(() => {
    const has = documents.some(d => d.status === 'processing');
    has ? startPolling() : stopPolling();
  }, [documents]);

  const startPolling = () => {
    if (!pollingRef.current) pollingRef.current = setInterval(() => fetchDocuments(true), 3000);
  };
  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  const fetchDocuments = async () => {
    try {
      const token = localStorage.getItem('kb_token');
      const res = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        if (onDocsUpdated) onDocsUpdated(data);
      }
    } catch (err) { console.error("Error fetching documents:", err); }
  };

  const uploadFile = async (file) => {
    setUploading(true);
    setNotification({ text: '', type: '' });
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('kb_token');
      const res = await fetch('/api/upload', { 
        method: 'POST', 
        body: formData,
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.status === 409)      setNotification({ text: data.detail || 'Duplicate detected.', type: 'warning' });
      else if (res.status === 400) setNotification({ text: data.detail || 'Invalid file type.', type: 'error' });
      else if (res.ok)             { setNotification({ text: `"${file.name}" uploaded. Indexing started.`, type: 'success' }); fetchDocuments(); }
      else                         setNotification({ text: data.detail || 'Upload failed.', type: 'error' });
    } catch { setNotification({ text: 'Backend connection failed.', type: 'error' }); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const handleDrag = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(e.type === 'dragenter' || e.type === 'dragover'); };
  const handleDrop = (e) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); if (e.dataTransfer.files?.[0]) uploadFile(e.dataTransfer.files[0]); };
  const handleFileChange = (e) => { if (e.target.files?.[0]) uploadFile(e.target.files[0]); };

  const handleDelete = async (docId, filename) => {
    if (!confirm(`Delete "${filename}" and all associated index data?`)) return;
    try {
      const token = localStorage.getItem('kb_token');
      const res = await fetch(`/api/documents/${docId}`, { 
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) { setNotification({ text: `"${filename}" deleted.`, type: 'info' }); fetchDocuments(); }
      else { const d = await res.json(); setNotification({ text: d.detail || 'Delete failed.', type: 'error' }); }
    } catch { setNotification({ text: 'Backend connection failed.', type: 'error' }); }
  };

  const fmtTime = (iso) => { try { return new Date(iso).toLocaleString(); } catch { return iso; } };

  const openDocument = (docId) => {
    window.open(`/api/documents/${docId}/open`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="doc-manager">
      <div>
        <h2 className="page-heading">Knowledge Repository</h2>
        <p className="page-sub">Upload and manage organizational documents. Supported formats: PDF, DOCX, PPTX, XLSX, CSV, TXT.</p>
      </div>

      {notification.text && (
        <div className={`notif-banner ${notification.type}`}>
          {notification.type === 'success' && <CheckCircle size={16} />}
          {(notification.type === 'error' || notification.type === 'warning') && <AlertCircle size={16} />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange}
               accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md" disabled={uploading} />
        <div className="upload-icon-wrap">
          <UploadCloud size={24} color={dragActive ? '#fff' : '#A100FF'} />
        </div>
        <div className="upload-title">{uploading ? 'Uploading…' : 'Drop files here or click to browse'}</div>
        <div className="upload-sub">Duplicates are automatically detected</div>
        <div className="format-tags">
          {['PDF','DOCX','PPTX','XLSX','CSV','TXT'].map(f => <span key={f} className="format-tag">{f}</span>)}
        </div>
      </div>

      {/* Document Table */}
      <div className="doc-table-card">
        <div className="doc-table-header">
          <span className="doc-table-title">Stored Documents</span>
          <span className="doc-count-badge">{documents.length}</span>
        </div>
        {documents.length === 0 ? (
          <div className="empty-state">
            <FileText size={36} style={{ opacity: 0.3 }} />
            <span>No documents yet. Upload files above to build your knowledge base.</span>
          </div>
        ) : (
          <table className="doc-table">
            <thead>
              <tr><th>Filename</th><th>Format</th><th>Uploaded</th><th>Status</th><th style={{textAlign:'right'}}>Actions</th></tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id}>
                  <td>
                    <button
                      type="button"
                      className="doc-filename doc-open-btn"
                      onClick={() => openDocument(doc.id)}
                      title="Open document"
                    >
                      <div className="file-icon-wrap"><FileText size={14} color="#A100FF" /></div>
                      <span>{doc.filename}</span>
                    </button>
                  </td>
                  <td><code style={{fontFamily:'var(--font-mono)', color:'#A100FF', fontSize:'0.8rem'}}>{doc.file_type.toUpperCase()}</code></td>
                  <td style={{fontSize:'0.8rem'}}>{fmtTime(doc.upload_time)}</td>
                  <td>
                    <span className={`badge ${doc.status}`}>
                      {doc.status === 'active' && <CheckCircle size={10} />}
                      {doc.status === 'processing' && <Clock size={10} />}
                      {doc.status === 'error' && <AlertCircle size={10} />}
                      {doc.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{textAlign:'right'}}>
                    <button className="del-btn" onClick={() => handleDelete(doc.id, doc.filename)} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
