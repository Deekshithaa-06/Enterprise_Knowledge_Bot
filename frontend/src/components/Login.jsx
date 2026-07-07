import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { User, Lock, AlertCircle } from 'lucide-react';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      login(data.access_token, data.user);
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/app');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="split-auth-container">
      <div className="split-auth-form-wrapper">
        <div className="split-auth-form-box">
          
          <div className="acc-logo-mark-auth">&gt;</div>
          
          <h2 className="split-auth-title">Knowledge Bot</h2>
          <p className="split-auth-subtitle">Log in to access your secure enterprise knowledge.</p>
          
          {error && (
            <div className="split-error-msg">
              <AlertCircle size={18} /> {error}
            </div>
          )}
          
          <form onSubmit={handleLogin}>
            <div className="split-input-group">
              <User size={18} />
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                required 
                placeholder="Enter your username"
              />
            </div>
            
            <div className="split-input-group">
              <Lock size={18} />
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                placeholder="Enter your password"
              />
            </div>
            
            <button type="submit" className="split-auth-btn" disabled={loading}>
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>
          
          <div className="split-auth-link">
            Don't have an account? <Link to="/register">Register now</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
