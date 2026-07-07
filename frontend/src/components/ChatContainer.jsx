import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Send, Sparkles, BarChart2, Quote, FileText, FileSpreadsheet, Presentation, FileType, X, Copy, Check } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend
} from 'recharts';

const renderMarkdown = (text) => {
  if (!text) return null;
  const lines = text.split('\n');
  let inList = false;
  const elements = [];
  let listItems = [];

  const parseInline = (str) => {
    let p = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    p = p.replace(/\*(.*?)\*/g, '<em>$1</em>');
    p = p.replace(/`(.*?)`/g, '<code style="font-family:var(--font-mono);background:var(--acc-purple-subtle);padding:2px 6px;border-radius:4px;font-size:0.88em;color:var(--acc-purple);">$1</code>');
    return <span dangerouslySetInnerHTML={{ __html: p }} />;
  };

  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('- ') || t.startsWith('* ')) {
      inList = true;
      listItems.push(<li key={`li-${i}`}>{parseInline(t.substring(2))}</li>);
      return;
    }
    if (inList) { elements.push(<ul key={`ul-${i}`}>{listItems}</ul>); listItems = []; inList = false; }
    if (t.startsWith('### '))      elements.push(<h4 key={i}>{parseInline(t.substring(4))}</h4>);
    else if (t.startsWith('## '))  elements.push(<h3 key={i}>{parseInline(t.substring(3))}</h3>);
    else if (t.startsWith('# '))   elements.push(<h2 key={i}>{parseInline(t.substring(2))}</h2>);
    else if (t)                    elements.push(<p key={i}>{parseInline(t)}</p>);
    else                           elements.push(<div key={i} style={{ height: 4 }} />);
  });
  if (inList && listItems.length) elements.push(<ul key="ul-end">{listItems}</ul>);
  return <div>{elements}</div>;
};

const InteractiveChart = ({ chartConfig }) => {
  if (!chartConfig?.data?.length) return null;
  const { type, title, data } = chartConfig;
  const colors = ['#A100FF','#00A878','#E88C00','#2B7FE0','#E03E3E','#B84DFF'];
  const tt = { background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:6, color:'var(--text-primary)', fontSize:12 };

  const chart = () => {
    switch (type?.toLowerCase()) {
      case 'line':
        return (<LineChart data={data} margin={{top:10,right:30,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} /><YAxis stroke="var(--text-muted)" fontSize={11} />
          <RechartsTooltip contentStyle={tt} /><Legend wrapperStyle={{fontSize:11}} />
          <Line type="monotone" dataKey="value" name={title} stroke="#A100FF" strokeWidth={3} dot={{fill:'#B84DFF',r:5}} activeDot={{r:8}} />
        </LineChart>);
      case 'pie':
        return (<PieChart>
          <Pie data={data} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value" nameKey="label" label={{fill:'var(--text-muted)',fontSize:10}}>
            {data.map((_,i) => <Cell key={i} fill={colors[i%colors.length]} />)}
          </Pie>
          <RechartsTooltip contentStyle={tt} /><Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{fontSize:11}} />
        </PieChart>);
      default:
        return (<BarChart data={data} margin={{top:10,right:30,left:0,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={11} /><YAxis stroke="var(--text-muted)" fontSize={11} />
          <RechartsTooltip contentStyle={tt} /><Legend wrapperStyle={{fontSize:11}} />
          <Bar dataKey="value" name={title} radius={[5,5,0,0]}>
            {data.map((_,i) => <Cell key={i} fill={colors[i%colors.length]} />)}
          </Bar>
        </BarChart>);
    }
  };

  return (
    <div className="chat-chart-wrap">
      <div className="chart-label"><BarChart2 size={14} />{title}</div>
      <div className="chat-chart-container"><ResponsiveContainer width="100%" height="100%">{chart()}</ResponsiveContainer></div>
    </div>
  );
};

/* Supported formats data */
const supportedFormats = [
  { ext: 'PDF',  icon: FileText,        color: '#E03E3E' },
  { ext: 'DOCX', icon: FileType,        color: '#2B7FE0' },
  { ext: 'PPTX', icon: Presentation,    color: '#E88C00' },
  { ext: 'XLSX', icon: FileSpreadsheet, color: '#00A878' },
  { ext: 'CSV',  icon: FileSpreadsheet, color: '#00A878' },
  { ext: 'TXT',  icon: FileText,        color: '#8E8EA0' },
];

const ChatContainer = forwardRef(function ChatContainer({ documentCount, user, onConversationUpdated }, ref) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const [currentConvId, setCurrentConvId] = useState(null);
  const bottomRef = useRef(null);
  const copyResetRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  useEffect(() => () => {
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
  }, []);

  const handleNewChat = () => {
    if (loading) return;
    setMessages([]);
    setInput('');
    setActiveCitation(null);
    setCopiedMessageIndex(null);
    setCurrentConvId(null);
  };

  const loadConversation = async (convId) => {
    if (loading) return;
    handleNewChat();
    setCurrentConvId(convId);
    setLoading(true);
    try {
      const token = localStorage.getItem('kb_token');
      const res = await fetch(`/api/conversations/${convId}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map(m => ({
          role: m.role,
          text: m.text,
          citations: m.citations
        })));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    newChat: handleNewChat,
    loadConversation: loadConversation
  }), [loading]);

  const copyBotResponse = async (text, index) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageIndex(index);

      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => {
        setCopiedMessageIndex(null);
      }, 1800);
    } catch {
      const tempTextarea = document.createElement('textarea');
      tempTextarea.value = text;
      tempTextarea.style.position = 'fixed';
      tempTextarea.style.opacity = '0';
      document.body.appendChild(tempTextarea);
      tempTextarea.focus();
      tempTextarea.select();

      try {
        document.execCommand('copy');
        setCopiedMessageIndex(index);

        if (copyResetRef.current) clearTimeout(copyResetRef.current);
        copyResetRef.current = setTimeout(() => {
          setCopiedMessageIndex(null);
        }, 1800);
      } finally {
        document.body.removeChild(tempTextarea);
      }
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const q = input.trim();
    setInput(''); setActiveCitation(null);
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const token = localStorage.getItem('kb_token');
      const payload = { query: q, top_k: 40 };
      if (currentConvId) payload.conversation_id = currentConvId;

      const res = await fetch('/api/query', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (res.ok && data.conversation_id) {
        const isNew = !currentConvId;
        setCurrentConvId(data.conversation_id);
        if (isNew && onConversationUpdated) {
          onConversationUpdated();
        }
      }

      setMessages(prev => [...prev, res.ok
        ? { role:'bot', text: data.answer, citations: data.citations||[], chart: data.chart||null }
        : { role:'bot', text: `### Error\n\n${data.detail||'Server error.'}`, citations:[], chart:null }
      ]);
    } catch {
      setMessages(prev => [...prev, { role:'bot', text:'### Connection Error\n\nCannot reach the backend.', citations:[], chart:null }]);
    } finally { setLoading(false); }
  };

  const openCitationDoc = (citation) => {
    if (!citation.doc_id) return;
    
    // Check if the document is a PDF
    const isPDF = citation.doc_name && citation.doc_name.toLowerCase().endsWith('.pdf');
    
    if (isPDF) {
      // For PDFs, open in new tab and jump to the exact page
      const pageMatch = citation.page_or_section?.match(/\d+/);
      const pageNumber = pageMatch ? pageMatch[0] : 1;
      const token = localStorage.getItem('kb_token');
      window.open(`/api/documents/${citation.doc_id}/open?token=${token}#page=${pageNumber}`, '_blank', 'noopener,noreferrer');
    } else {
      // For non-PDFs (Word, PPT, etc), download a text file containing the exact source context
      const content = `=== SOURCE CITATION ===\n\nDocument: ${citation.doc_name}\nLocation: ${citation.page_or_section}\n\n=== SOURCE TEXT ===\n\n${citation.excerpt}`;
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Citation_${citation.doc_name}_${citation.page_or_section.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="chat-pane">
      <div className="messages-container">
        {messages.length === 0 ? (
        <div className="welcome-state">
          <div className="welcome-hero">
            <div className="welcome-ring" />
            <div className="welcome-logo" />
          </div>

          <h1 className="welcome-heading">
            Hi {user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : ''}, <span>What can I help you find?</span>
          </h1>
          <p className="welcome-sub">
            Upload documents in the Document section and start asking questions.
            <br />
            These are the supported formats:
          </p>

          <div className="formats-grid">
            {supportedFormats.map(f => (
              <div key={f.ext} className="format-card">
                <f.icon size={22} color={f.color} />
                <span className="format-ext">{f.ext}</span>
              </div>
            ))}
          </div>
        </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`message-row ${msg.role}`}>
              <div className={`msg-avatar ${msg.role === 'user' ? 'user-av' : 'bot-av'}`}>
                {msg.role === 'user' ? 'You' : <Sparkles size={14} />}
              </div>
              <div className="msg-body">
                <div className="msg-head">
                  <div className={`msg-label ${msg.role === 'bot' ? 'bot-label' : ''}`}>
                    {msg.role === 'user' ? 'You' : 'KnowledgeBot'}
                  </div>
                  {msg.role === 'bot' && (
                    <button
                      type="button"
                      className="copy-response-btn"
                      onClick={() => copyBotResponse(msg.text, i)}
                      aria-label="Copy bot response"
                    >
                      {copiedMessageIndex === i ? <Check size={12} /> : <Copy size={12} />}
                      {copiedMessageIndex === i ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>
                <div className="msg-text">{msg.role === 'user' ? msg.text : renderMarkdown(msg.text)}</div>
                {msg.role === 'bot' && msg.chart && <InteractiveChart chartConfig={msg.chart} />}
                {msg.role === 'bot' && msg.citations?.length > 0 && (
                  <div className="citations-strip">
                    {msg.citations.map((c, ci) => (
                      <button key={ci} className="citation-pill"
                        onClick={() => openCitationDoc(c)}>
                        <Quote size={9} /> {c.doc_name} — {c.page_or_section}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="thinking-row">
            <div className="dot-pulse"><span /><span /><span /></div>
            <span>Searching documents and synthesizing answer…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-bar-wrap">
        <form onSubmit={handleSend} className="input-bar">
          <input type="text" className="chat-input"
            placeholder="Ask anything about your documents…"
            value={input} onChange={e => setInput(e.target.value)}
            disabled={loading} />
          <button type="submit" className="send-btn" disabled={loading || !input.trim()}>
            <Send size={15} />
          </button>
        </form>
      </div>
    </div>
  );
});

export default ChatContainer;
