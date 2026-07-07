import React, { useState, useEffect, useContext, useMemo } from 'react';
import { AuthContext } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { Trash2, Shield, Users, Activity, LogOut, MessageSquare, Search, FileText } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'users', 'audit'
  const { token, user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/app');
      return;
    }

    const fetchUsers = async () => {
      try {
        const res = await fetch('/api/auth/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setUsers(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [user, token, navigate]);

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("WARNING: Irreversible Action.\nAre you absolutely sure you want to delete this user and purge all their data?")) {
      return;
    }
    try {
      const res = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setUsers(users.filter(u => u.id !== userId));
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to delete user");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()));
  }, [users, search]);

  const chartData = useMemo(() => {
    const reversed = [...users].reverse();
    const dataMap = new Map();
    let cumulative = 0;
    
    reversed.forEach(u => {
      if (u.role === 'admin') return; 
      const date = new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      cumulative += 1;
      dataMap.set(date, cumulative);
    });

    return Array.from(dataMap, ([name, users]) => ({ name, users }));
  }, [users]);

  const docData = useMemo(() => {
    return users
      .filter(u => u.role !== 'admin' && (u.document_count || 0) > 0)
      .map(u => ({ name: u.username, documents: u.document_count }))
      .sort((a, b) => b.documents - a.documents)
      .slice(0, 5);
  }, [users]);

  if (loading) return (
    <div className="admin-pro-layout" style={{alignItems: 'center', justifyContent: 'center'}}>
      <div className="dot-pulse"><span/><span/><span/></div>
    </div>
  );

  const totalUsers = users.filter(u => u.role !== 'admin').length;
  const totalDocs = users.reduce((acc, u) => acc + (u.document_count || 0), 0);
  const adminCount = users.filter(u => u.role === 'admin').length;

  return (
    <div className="admin-pro-layout">
      {/* Sidebar */}
      <aside className="admin-pro-sidebar">
        <div className="admin-pro-brand">
          <div className="logo-icon"><Shield size={24} color="#FFF" /></div>
          <h2>AURA Admin</h2>
        </div>
        
        <nav className="admin-pro-nav">
          <div 
            className={`admin-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={18} /> Dashboard
          </div>
          <div 
            className={`admin-nav-item ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} /> Users
          </div>
        </nav>

        <div className="admin-pro-footer">
          <div className="admin-profile">
            <div className="admin-profile-av">{user?.username.charAt(0).toUpperCase()}</div>
            <div className="admin-profile-info">
              <span className="name">{user?.username}</span>
              <span className="role">System Administrator</span>
            </div>
          </div>
          <button className="admin-pro-btn secondary" style={{width: '100%', justifyContent: 'center'}} onClick={handleLogout}>
            <LogOut size={16} /> Secure Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-pro-main">
        <header className="admin-pro-header">
          <div>
            <h1>
              {activeTab === 'dashboard' && 'Command Center'}
              {activeTab === 'users' && 'User Management'}
            </h1>
            <p>
              {activeTab === 'dashboard' && 'Real-time system overview and health.'}
              {activeTab === 'users' && 'Manage access, roles, and user data.'}
            </p>
          </div>
          <div className="admin-top-btns">
            <button className="admin-pro-btn primary" onClick={() => navigate('/app')}>
              <MessageSquare size={16} /> Enter AI Application
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            {/* Metrics Row */}
            <section className="admin-metrics-row">
              <div className="admin-metric-card" style={{'--card-color': '#A100FF'}}>
                <div className="metric-header">
                  <span className="metric-title">Total Users</span>
                  <div className="metric-icon-wrap"><Users size={16} color="#A100FF" /></div>
                </div>
                <h2 className="metric-value">{totalUsers}</h2>
              </div>

              <div className="admin-metric-card" style={{'--card-color': '#00C48C'}}>
                <div className="metric-header">
                  <span className="metric-title">Documents Indexed</span>
                  <div className="metric-icon-wrap"><FileText size={16} color="#00C48C" /></div>
                </div>
                <h2 className="metric-value">{totalDocs}</h2>
              </div>

              <div className="admin-metric-card" style={{'--card-color': '#E03E3E'}}>
                <div className="metric-header">
                  <span className="metric-title">System Status</span>
                  <div className="metric-icon-wrap"><Activity size={16} color="#E03E3E" /></div>
                </div>
                <h2 className="metric-value" style={{color: '#00C48C', fontSize: '1.8rem'}}>Healthy</h2>
              </div>

              <div className="admin-metric-card" style={{'--card-color': '#FFB020'}}>
                <div className="metric-header">
                  <span className="metric-title">Admin Accounts</span>
                  <div className="metric-icon-wrap"><Shield size={16} color="#FFB020" /></div>
                </div>
                <h2 className="metric-value">{adminCount}</h2>
              </div>
            </section>

            {/* Charts Row */}
            <section className="admin-charts-row">
              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <h3>User Growth Trajectory</h3>
                </div>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#A100FF" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#A100FF" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                      <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                        itemStyle={{ color: '#111827' }}
                      />
                      <Area type="monotone" dataKey="users" stroke="#A100FF" strokeWidth={3} fillOpacity={1} fill="url(#colorUsers)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="admin-chart-card">
                <div className="admin-chart-header">
                  <h3>Top Uploaders</h3>
                </div>
                <div style={{ width: '100%', height: 250 }}>
                  <ResponsiveContainer>
                    <BarChart data={docData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                      <XAxis type="number" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis dataKey="name" type="category" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} width={60} />
                      <Tooltip 
                        cursor={{fill: '#F3F4F6'}}
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                      />
                      <Bar dataKey="documents" fill="#00C48C" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'users' && (
          <section className="admin-datagrid-card">
            <div className="datagrid-toolbar">
              <h3>Identity & Access Management</h3>
              <div className="datagrid-search">
                <Search size={18} />
                <input 
                  type="text" 
                  placeholder="Search users by name..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            
            <table className="admin-pro-table">
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Role</th>
                  <th>Documents</th>
                  <th>Join Date</th>
                  <th style={{textAlign: 'right'}}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div className="pro-user-cell">
                        <div className={`pro-avatar ${u.role === 'admin' ? 'admin' : 'user'}`}>
                          {u.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="pro-user-info">
                          <span className="pro-user-name">{u.username}</span>
                          <span className="pro-user-id">UID: {u.id.toString().padStart(5, '0')}</span>
                        </div>
                      </div>
                    </td>
                    <td><span className={`pro-badge ${u.role}`}>{u.role}</span></td>
                    <td style={{fontWeight: 600, color: '#111827'}}>{u.document_count || 0}</td>
                    <td>{new Date(u.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    <td style={{textAlign: 'right'}}>
                      {u.id !== user?.id && (
                        <button 
                          className="pro-action-btn" 
                          onClick={() => handleDeleteUser(u.id)}
                          title="Purge User Data"
                        >
                          <Trash2 size={16} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr><td colSpan="5" style={{textAlign: 'center', padding: '40px', color: '#6B7280'}}>No users found matching "{search}".</td></tr>
                )}
              </tbody>
            </table>
          </section>
        )}

      </main>
    </div>
  );
};

export default AdminDashboard;
