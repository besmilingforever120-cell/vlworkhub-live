import { NavLink } from 'react-router-dom';
import styles from './Layout.module.scss';
import {
  Home,
  Users,
  BookOpen,
  FileText,
  CheckSquare,
  Megaphone,
  HelpCircle
} from 'lucide-react';
import * as React from 'react';
const Sidebar: React.FC<{ collapsed: boolean; onToggle: () => void }> = ({ collapsed, onToggle }) => {
  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
      <button
        className={styles.collapseBtn}
        onClick={onToggle}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
      >
        {collapsed ? 'Ż' : 'Ž'}
      </button>

      <nav className={styles.nav}>
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? styles.active : ''}>
          <Home size={20} /> <span>Dashboard</span>
        </NavLink>

        <NavLink to="/onboarding" className={({ isActive }) => isActive ? styles.active : ''}>
          <Users size={20} /> <span>Onboarding</span>
        </NavLink>

        <NavLink to="/training" className={({ isActive }) => isActive ? styles.active : ''}>
          <BookOpen size={20} /> <span>Training</span>
        </NavLink>

        <NavLink to="/documents" className={({ isActive }) => isActive ? styles.active : ''}>
          <FileText size={20} /> <span>Documents</span>
        </NavLink>

        <NavLink to="/tasks" className={({ isActive }) => isActive ? styles.active : ''}>
          <CheckSquare size={20} /> <span>Tasks</span>
        </NavLink>

        <NavLink to="/announcements" className={({ isActive }) => isActive ? styles.active : ''}>
          <Megaphone size={20} /> <span>Announcements</span>
        </NavLink>

        <NavLink to="/support" className={({ isActive }) => isActive ? styles.active : ''}>
          <HelpCircle size={20} /> <span>HR Support</span>
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
