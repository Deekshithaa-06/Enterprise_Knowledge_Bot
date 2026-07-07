import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Lock, AlertCircle } from 'lucide-react';

const Register = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Registration failed');
      }

      // Success, redirect to login
      navigate('/login');
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
          <p className="split-auth-subtitle">Register to start querying your enterprise data securely.</p>
          
          {error && (
            <div className="split-error-msg">
              <AlertCircle size={18} /> {error}
            </div>
          )}
          
          <form onSubmit={handleRegister}>
            <div className="split-input-group">
              <User size={18} />
              <input 
                type="text" 
                value={username} 
                onChange={e => setUsername(e.target.value)} 
                required 
                placeholder="Choose a username"
              />
            </div>
            
            <div className="split-input-group">
              <Lock size={18} />
              <input 
                type="password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                required 
                placeholder="Create a password"
              />
            </div>

            <div className="split-input-group">
              <Lock size={18} />
              <input 
                type="password" 
                value={confirmPassword} 
                onChange={e => setConfirmPassword(e.target.value)} 
                required 
                placeholder="Confirm your password"
              />
            </div>
            
            <button type="submit" className="split-auth-btn" disabled={loading}>
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
          
          <div className="split-auth-link">
            Already have an account? <Link to="/login">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
