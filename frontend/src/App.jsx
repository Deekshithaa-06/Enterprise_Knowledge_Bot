import React, { useState, useEffect, useRef, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { MessageSquare, FolderOpen, AlertCircle, Database, Cpu, Sun, Moon, Plus, LogOut, Shield } from 'lucide-react';
import { AuthProvider, AuthContext } from './AuthContext';
import ChatContainer from './components/ChatContainer';
import DocManager from './components/DocManager';
import Login from './components/Login';
import Register from './components/Register';
import AdminDashboard from './components/AdminDashboard';

// Protected Route Wrapper
const ProtectedRoute = ({ children, requireAdmin = false }) => {
  const { user, loading } = useContext(AuthContext);
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requireAdmin && user.role !== 'admin') return <Navigate to="/app" replace />;
  return children;
};

function MainApp() {
  const [activeTab, setActiveTab] = useState('chat');
  const [documents, setDocuments] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const chatActionsRef = useRef(null);
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => { 
    if (user) {
      fetchDocuments(); 
      fetchConversations();
      checkApiKeyStatus(); 
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const [showTimeoutModal, setShowTimeoutModal] = useState(false);

  useEffect(() => {
    let timeoutId;
    const resetTimer = () => {
      if (showTimeoutModal) return;
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setShowTimeoutModal(true);
      }, 5 * 60 * 1000); // 5 minutes
    };

    const events = ['mousemove', 'keydown', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [showTimeoutModal]);

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kb_token')}` }
      });
      if (res.ok) setDocuments(await res.json());
    } catch (err) { console.error("Error loading documents:", err); }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kb_token')}` }
      });
      if (res.ok) setConversations(await res.json());
    } catch (err) { console.error("Error loading conversations:", err); }
  };

  const checkApiKeyStatus = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) { const d = await res.json(); setHasApiKey(d.has_api_key); }
    } catch (err) { console.error("Error checking API key:", err); }
  };

  const activeDocCount = documents.filter(d => d.status === 'active').length;
  const processingCount = documents.filter(d => d.status === 'processing').length;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const loadConversation = (convId) => {
    setActiveTab('chat');
    chatActionsRef.current?.loadConversation?.(convId);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="acc-logo-row">
            <div className="acc-logo-mark">&gt;</div>
            <div className="acc-logo-text">
              <span className="acc-logo-product">KnowledgeBot</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-btn" onClick={() => setActiveTab('chat')}>
            <MessageSquare size={16} /> Ask Bot
          </button>
          <button
            type="button"
            className="nav-btn"
            onClick={() => {
              setActiveTab('chat');
              chatActionsRef.current?.newChat?.();
              fetchConversations();
            }}
          >
            <Plus size={16} /> New Chat
          </button>
          <button className="nav-btn" onClick={() => setActiveTab('documents')}>
            <FolderOpen size={16} /> Documents
          </button>
          {user?.role === 'admin' && (
            <button className="nav-btn" onClick={() => navigate('/admin')}>
              <Shield size={16} /> Admin Panel
            </button>
          )}
        </nav>

        <div className="sidebar-content" style={{ overflowY: 'auto' }}>
          <div style={{ marginBottom: '20px' }}>
            <div className="stats-title" style={{ padding: '0 12px' }}>Recent Chats</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: '8px' }}>
              {conversations.map(conv => (
                <li key={conv.id}>
                  <button 
                    className="nav-btn" 
                    onClick={() => loadConversation(conv.id)}
                    style={{ fontSize: '13px', padding: '6px 12px', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <MessageSquare size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: -2 }} />
                    {conv.title}
                  </button>
                </li>
              ))}
              {conversations.length === 0 && (
                <div style={{ padding: '0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>No recent chats</div>
              )}
            </ul>
          </div>

          <div className="stats-card">
            <div className="stats-title">My Documents</div>
            <div className="stats-row">
              <span><Database size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Indexed</span>
              <span className="stats-value purple">{activeDocCount} files</span>
            </div>
            <div className="stats-row">
              <span><Cpu size={12} style={{ marginRight: 5, verticalAlign: -2 }} />Processing</span>
              <span className="stats-value">{processingCount}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-panel" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: '16px', right: '28px', display: 'flex', gap: '10px', zIndex: 10 }}>
          <button className="theme-toggle-btn" onClick={() => setDarkMode(!darkMode)} style={{ width: 'auto', padding: '6px 12px', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            <span style={{ marginLeft: '6px' }}>{darkMode ? 'Light' : 'Dark'}</span>
          </button>
          <button className="theme-toggle-btn logout-btn" onClick={handleLogout} style={{ width: 'auto', padding: '6px 12px', background: 'var(--bg-card)', boxShadow: 'var(--shadow-sm)' }}>
            <LogOut size={15} />
            <span style={{ marginLeft: '6px' }}>Log Out</span>
          </button>
        </div>
        <div style={{ flex: 1, display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
          <ChatContainer ref={chatActionsRef} documentCount={activeDocCount} user={user} onConversationUpdated={fetchConversations} />
        </div>
        <div style={{ flex: 1, display: activeTab === 'documents' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
          <DocManager onDocsUpdated={(d) => setDocuments(d)} />
        </div>
      </main>

      {showTimeoutModal && (
        <div className="timeout-overlay">
          <div className="timeout-modal">
            <div className="timeout-icon"><AlertCircle size={48} /></div>
            <h2 className="timeout-title">Session Inactive</h2>
            <p className="timeout-text">Your session has been inactive for 5 minutes.<br/>Would you like to continue chatting, or start a fresh session?</p>
            <div className="timeout-actions">
              <button className="btn-primary" onClick={() => setShowTimeoutModal(false)}>Continue Session</button>
              <button className="btn-secondary" onClick={() => window.location.reload()}>Start Fresh</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/admin" element={
            <ProtectedRoute requireAdmin={true}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          <Route path="/app" element={
            <ProtectedRoute>
              <MainApp />
            </ProtectedRoute>
          } />
          <Route path="/" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
