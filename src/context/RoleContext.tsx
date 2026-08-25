'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type UserRole =
  | 'System Administrator'
  | 'Current Ops Administrator'
  | 'Duty Manager'
  | 'Duty Officer'
  | 'Controller'
  | 'Responder (Ranger)'
  | 'Stakeholder';

interface RoleContextType {
  role: UserRole;
  username: string;
  setRole: (role: UserRole) => void;
  setUsername: (username: string) => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRoleState] = useState<UserRole>('Controller');
  const [username, setUsernameState] = useState<string>('Controller Steve');

  // Load from localStorage on mount
  useEffect(() => {
    const savedRole = localStorage.getItem('sentosa_cms_role') as UserRole;
    const savedUsername = localStorage.getItem('sentosa_cms_username');
    if (savedRole) {
      setRoleState(savedRole);
    }
    if (savedUsername) {
      setUsernameState(savedUsername);
    }
  }, []);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem('sentosa_cms_role', newRole);
    
    // Set default usernames based on role for testing convenience
    let newUsername = 'User';
    switch (newRole) {
      case 'Controller':
        newUsername = 'Controller Steve';
        break;
      case 'Duty Manager':
        newUsername = 'DM Gan';
        break;
      case 'Duty Officer':
        newUsername = 'DO Shin Feng';
        break;
      case 'Responder (Ranger)':
        newUsername = 'Ranger John';
        break;
      case 'Current Ops Administrator':
        newUsername = 'Ops Admin Lee';
        break;
      case 'System Administrator':
        newUsername = 'Admin Root';
        break;
      case 'Stakeholder':
        newUsername = 'Liaison Officer';
        break;
    }
    setUsername(newUsername);
  };

  const setUsername = (newUsername: string) => {
    setUsernameState(newUsername);
    localStorage.setItem('sentosa_cms_username', newUsername);
  };

  return (
    <RoleContext.Provider value={{ role, username, setRole, setUsername }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};

