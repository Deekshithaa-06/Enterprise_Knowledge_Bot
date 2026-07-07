import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in on mount
    const savedToken = localStorage.getItem('kb_token');
    const savedUser = localStorage.getItem('kb_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        setUser(null);
        setToken(null);
      }
    }
    setLoading(false);
  }, []);

  const login = (access_token, user_data) => {
    setToken(access_token);
    setUser(user_data);
    localStorage.setItem('kb_token', access_token);
    localStorage.setItem('kb_user', JSON.stringify(user_data));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('kb_token');
    localStorage.removeItem('kb_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
