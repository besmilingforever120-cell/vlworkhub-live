import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import styles from './Announcements.module.scss';
import {
  Plus, Search, Filter, Calendar, AlertTriangle,
  Info, CheckCircle, Edit, Trash2, X, Save, Shield, Users, User
} from 'lucide-react';
import { AppContext } from '../App';
import { SharePointServiceFactory } from '../../../../shared/services';
import { IAnnouncement, IAnnouncementUpdate, UserRole } from '../../../../shared/models';
import ConfirmDialog from '../dialog/ConfirmDialog';
import * as React from 'react';

const priorityColor = (p?: string): string =>
  p === 'Highly Important' ? '#dc2626' :
  p === 'Important' ? '#d97706' :
  '#6b7280';

const priorityBgColor = (p?: string): string =>
  p === 'Highly Important' ? '#fef2f2' :
  p === 'Important' ? '#fefbf2' :
  '#f9fafb';

const toInput = (iso?: string) => (iso ? iso.slice(0, 16) : '');
const fromInput = (s: string) => (s ? new Date(s).toISOString() : undefined);

type EditModel = {
  Id?: number;
  Title: string;
  Body?: string;
  StartDate?: string;
  EndDate?: string;
  Priority: string;
};

const Announcements: React.FC = () => {
  const context = useContext(AppContext);
  const services = useMemo(
    () => SharePointServiceFactory.getInstance(context!),
    [context]
  );

  const [items, setItems] = useState<IAnnouncement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [updating, setUpdating] = useState(false);

  const emptyModel: EditModel = {
    Title: '',
    Body: '',
    StartDate: undefined,
    EndDate: undefined,
    Priority: 'Normal'
  };
  const [model, setModel] = useState<EditModel>(emptyModel);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    id: number | null;
    title: string;
  }>({
    isOpen: false,
    id: null,
    title: ''
  });

    // 🆕 Open confirm dialog instead of browser confirm
  const confirmDelete = (item: IAnnouncement) => {
    setConfirmDialog({
      isOpen: true,
      id: item.Id,
      title: item.Title
    });
  };

  // 🆕 Handle actual deletion after confirmation
  const handleConfirmDelete = async () => {
    if (!confirmDialog.id) return;

    setUpdating(true);
    try {
      await services.announcements.delete(confirmDialog.id);
      await load();
      
      // Close dialog after successful deletion
      setConfirmDialog({ isOpen: false, id: null, title: '' });
    } catch (e: any) {
      alert('Delete failed: ' + e.message);
    } finally {
      setUpdating(false);
    }
  };

  // 🆕 Cancel deletion
  const handleCancelDelete = () => {
    setConfirmDialog({ isOpen: false, id: null, title: '' });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [announcements, currentUserRole] = await Promise.all([
        services.announcements.getActive(50),
        services.roles.getCurrentUserRole()
      ]);

      setItems(announcements);
      setUserRole(currentUserRole);
    } catch (e) {
      const err = e as Error;
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [services]);

  useEffect(() => {
    void load();
  }, [load]);

  const canCreateAnnouncements = userRole === 'Admin';
  const canEditAnnouncements = userRole === 'Admin';
  const canDeleteAnnouncements = userRole === 'Admin';

  const openNew = async (): Promise<void> => {
    if (!(await services.roles.canCreateAnnouncements())) {
      alert('You do not have permission to create announcements.');
      return;
    }
    setModel(emptyModel);
    setShowForm(true);
  };

  const openEdit = async (it: IAnnouncement): Promise<void> => {
    if (!(await services.roles.canEditAnnouncement())) {
      alert('You do not have permission to edit announcements.');
      return;
    }

    setModel({
      Id: it.Id,
      Title: it.Title,
      Body: it.Body ?? '',
      StartDate: it.StartDate,
      EndDate: it.EndDate,
      Priority: it.Priority ?? 'Normal'
    });
    setShowForm(true);
  };

  const cancelForm = (): void => {
    setShowForm(false);
    setModel(emptyModel);
  };

  const save = async (): Promise<void> => {
    if (!model.Title?.trim()) {
      alert('Title is required');
      return;
    }

    setSaving(true);
    setUpdating(true);
    try {
      const updateData: IAnnouncementUpdate = { ...model };

      if (model.Id) {
        if (!(await services.roles.canEditAnnouncement())) {
          throw new Error('You do not have permission to edit announcements.');
        }
        await services.announcements.update(model.Id, updateData);
      } else {
        if (!(await services.roles.canCreateAnnouncements())) {
          throw new Error('You do not have permission to create announcements.');
        }

        const announcement = await services.announcements.create(updateData);

        if (announcement && announcement.Id) {
          try {
            await services.security.secureAnnouncementItem(announcement.Id, []);
          } catch (err) {
            console.warn('Failed to set announcement security:', err);
          }
        }
      }

      cancelForm();
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      alert('Save failed: ' + message);
    } finally {
      setSaving(false);
      setUpdating(false);
    }
  };

  const filteredItems = items.filter(item => {
    const matchesSearch =
      item.Title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.Body || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'all' || item.Priority === activeFilter;
    return matchesSearch && matchesFilter;
  });

  const filters = [
    { id: 'all', label: 'All Announcements', count: items.length },
    {
      id: 'Highly Important',
      label: 'Highly Important',
      count: items.filter(a => a.Priority === 'Highly Important').length
    },
    {
      id: 'Important',
      label: 'Important',
      count: items.filter(a => a.Priority === 'Important').length
    },
    {
      id: 'Normal',
      label: 'Normal',
      count: items.filter(a => a.Priority === 'Normal').length
    }
  ];

  const getPriorityIcon = (priority?: string): JSX.Element => {
    switch (priority) {
      case 'Highly Important':
        return <AlertTriangle size={16} />;
      case 'Important':
        return <Info size={16} />;
      case 'Normal':
        return <CheckCircle size={16} />;
      default:
        return <Info size={16} />;
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getRoleDisplay = (role: UserRole | null): string => {
    switch (role) {
      case 'Admin':
        return 'Administrator';
      case 'Manager':
        return 'Manager';
      case 'Employee':
        return 'Employee';
      default:
        return 'Loading...';
    }
  };

  const getRoleIcon = (role: UserRole | null): React.ReactElement => {
    switch (role) {
      case 'Admin':
        return <Shield size={16} />;
      case 'Manager':
        return <Users size={16} />;
      case 'Employee':
        return <User size={16} />;
      default:
        return <User size={16} />;
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading announcements...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <AlertTriangle size={48} />
        <h3>Error Loading Announcements</h3>
        <p>{error}</p>
        <button onClick={load} className={styles.retryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.announcements}>
       {/* 🆕 Beautiful Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Delete Announcement?"
        message={`Are you sure you want to delete "${confirmDialog.title}"? This action cannot be undone.`}
        variant="danger"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={updating}
      />
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Announcements</h1>
          <p className={styles.subtitle}>
            Stay updated with the latest company news and updates
          </p>
          <div className={styles.roleIndicator}>
            {getRoleIcon(userRole)}
            <span>Role: {getRoleDisplay(userRole)}</span>
          </div>
        </div>
        {canCreateAnnouncements && (
          <button
            className={styles.createBtn}
            onClick={openNew}
            disabled={updating}
          >
            <Plus size={20} />
            {updating ? 'Processing...' : 'New Announcement'}
          </button>
        )}
      </div>

      {userRole !== 'Admin' && (
        <div className={styles.permissionNotice}>
          <Info size={16} />
          <span>
            You have read-only access to announcements. Contact your administrator to
            create or modify announcements.
          </span>
        </div>
      )}

      {showForm && canCreateAnnouncements && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2>{model.Id ? 'Edit Announcement' : 'Create New Announcement'}</h2>
              <button className={styles.closeBtn} onClick={cancelForm} disabled={saving}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalContent}>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Title *</span>
                    <input
                      type="text"
                      value={model.Title}
                      onChange={e => setModel(m => ({ ...m, Title: e.target.value }))}
                      className={styles.input}
                      placeholder="Enter announcement title"
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Priority</span>
                  </label>
                    <select
                    id='priority'
                      value={model.Priority}
                      onChange={e => setModel(m => ({ ...m, Priority: e.target.value }))}
                      className={styles.select}
                      disabled={saving}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Important">Important</option>
                      <option value="Highly Important">Highly Important</option>
                    </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Start Date</span>
                    <input
                      type="datetime-local"
                      value={toInput(model.StartDate)}
                      onChange={e =>
                        setModel(m => ({ ...m, StartDate: fromInput(e.target.value) }))
                      }
                      className={styles.input}
                      disabled={saving}
                    />
                  </label>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>End Date</span>
                    <input
                      type="datetime-local"
                      value={toInput(model.EndDate)}
                      onChange={e =>
                        setModel(m => ({ ...m, EndDate: fromInput(e.target.value) }))
                      }
                      className={styles.input}
                      disabled={saving}
                    />
                  </label>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Content</span>
                  <textarea
                    value={model.Body ?? ''}
                    onChange={e => setModel(m => ({ ...m, Body: e.target.value }))}
                    rows={6}
                    className={styles.textarea}
                    placeholder="Enter announcement content (HTML supported)"
                    disabled={saving}
                  />
                </label>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Audience</span>
                  <p className={styles.helpText}>
                    Currently, all announcements are visible to all users. Contact your
                    administrator to set up specific audience targeting.
                  </p>
                </label>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button onClick={save} disabled={saving} className={styles.saveBtn}>
                <Save size={16} />
                {saving ? 'Saving...' : model.Id ? 'Update' : 'Create'}
              </button>
              <button onClick={cancelForm} disabled={saving} className={styles.cancelBtn}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <Search size={20} />
          <input
            type="text"
            placeholder="Search announcements..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        <div className={styles.filterSection}>
          <Filter size={20} />
          <span>Filter:</span>
          <div className={styles.filterButtons}>
            {filters.map(filter => (
              <button
                key={filter.id}
                className={`${styles.filterBtn} ${
                  activeFilter === filter.id ? styles.active : ''
                }`}
                onClick={() => setActiveFilter(filter.id)}
              >
                {filter.label}
                <span className={styles.count}>{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.announcementsList}>
        {filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>📢</div>
            <h3>No announcements found</h3>
            <p>
              {searchTerm || activeFilter !== 'all'
                ? 'No announcements match your current search or filter.'
                : 'No announcements available at this time.'}
            </p>
            {!searchTerm && activeFilter === 'all' && canCreateAnnouncements && (
              <button
                onClick={openNew}
                className={styles.emptyActionBtn}
                disabled={updating}
              >
                <Plus size={20} />
                Create First Announcement
              </button>
            )}
          </div>
        ) : (
          filteredItems.map(announcement => (
            <article key={announcement.Id} className={styles.announcementCard}>
              <div className={styles.cardHeader}>
                <div className={styles.titleSection}>
                  <h3 className={styles.announcementTitle}>{announcement.Title}</h3>
                </div>

                <div className={styles.metadata}>
                  <span
                    className={styles.priority}
                    style={{
                      backgroundColor: priorityBgColor(announcement.Priority),
                      color: priorityColor(announcement.Priority)
                    }}
                  >
                    {getPriorityIcon(announcement.Priority)}
                    {announcement.Priority || 'Normal'}
                  </span>
                </div>
              </div>

              <div className={styles.content}>
                <div
                  dangerouslySetInnerHTML={{ __html: announcement.Body || '' }}
                  className={styles.htmlContent}
                />
              </div>

              <div className={styles.cardFooter}>
                <div className={styles.authorInfo}>
                  <div className={styles.authorAvatar}>
                    {(announcement.Author?.Title || 'U')
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <div>
                    <span className={styles.authorName}>
                      {announcement.Author?.Title || 'Unknown'}
                    </span>
                    <div className={styles.dateInfo}>
                      <Calendar size={14} />
                      <span>Created: {formatDate(announcement.Created)}</span>
                    </div>
                    {announcement.StartDate && (
                      <div className={styles.dateInfo}>
                        <span>Starts: {formatDate(announcement.StartDate)}</span>
                      </div>
                    )}
                    {announcement.EndDate && (
                      <div className={styles.dateInfo}>
                        <span>Ends: {formatDate(announcement.EndDate)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className={styles.actions}>
                  {canEditAnnouncements && (
                    <button
                      className={styles.actionBtn}
                      onClick={() => openEdit(announcement)}
                      title="Edit announcement"
                      disabled={updating}
                    >
                      <Edit size={16} />
                    </button>
                  )}
                  {canDeleteAnnouncements && (
                    <button
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={() => confirmDelete(announcement)}
                      title="Delete announcement"
                      disabled={updating}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
};

export default Announcements;