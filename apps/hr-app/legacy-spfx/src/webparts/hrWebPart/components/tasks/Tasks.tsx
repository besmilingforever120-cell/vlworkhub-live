import * as React from 'react';
import { useContext, useEffect, useMemo, useState, useReducer } from 'react';
import styles from './Tasks.module.scss';
import { SharePointServiceFactory } from '../../../../shared/services';
import { ITaskItem, ITaskWithProgress, UserRole, ITaskUserState } from '../../../../shared/models';
import {
  Plus, Search, Filter, Calendar, User, Clock, AlertCircle,
  CheckCircle, Play, Pause, Edit, Trash2, Save, X, Target,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Users, Shield, ChevronDown, ChevronUp, Zap
} from 'lucide-react';
import ConfirmDialog from '../dialog/ConfirmDialog';
import { AppContext } from '../App';
import { MultiSelectUsers } from './MultiSelectUsers';

type TaskStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Blocked' | string;
type TaskPriority = 'Low' | 'Normal' | 'High' | 'Critical' | string;
type TaskPeople = {
  assignedUserIds: number[];
  assignedNames: string[];
  assignedUserNameById: Record<number, string>;
  completedNames: string[];
  remainingNames: string[];
  totalAssigned: number;
  completedCount: number;
};

const ASSIGNEE_INTERNAL_NAME = 'AssignedTo';

/* ================================ STATE INTERFACES ================================ */

interface FormState {
  title: string;
  due: string;
  priority: TaskPriority;
  status: TaskStatus;
  description: string;
  assignToIds: number[];
}

interface FilterState {
  query: string;
  status: 'All' | TaskStatus;
  priority: 'All' | TaskPriority;
  currentPage: number;
  itemsPerPage: number;
}

interface EditState {
  id: number | null;
  title: string;
  assignToIds: number[];
  due: string;
  status: TaskStatus;
  priority: TaskPriority;
  description: string;
}

/* ================================ REDUCERS ================================ */

type FormAction = 
  | { type: 'SET_FIELD'; field: keyof FormState; value: any }
  | { type: 'RESET' };

const formReducer = (state: FormState, action: FormAction): FormState => {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'RESET':
      return {
        title: '',
        due: '',
        priority: 'Normal',
        status: 'Not Started',
        description: '',
        assignToIds: [],
      };
    default:
      return state;
  }
};

type FilterAction = 
  | { type: 'SET_FIELD'; field: keyof FilterState; value: any }
  | { type: 'RESET_PAGE' };

const filterReducer = (state: FilterState, action: FilterAction): FilterState => {
  switch (action.type) {
    case 'SET_FIELD':
      if (action.field === 'query' || action.field === 'status' || action.field === 'priority') {
        return { ...state, [action.field]: action.value, currentPage: 1 };
      }
      return { ...state, [action.field]: action.value };
    case 'RESET_PAGE':
      return { ...state, currentPage: 1 };
    default:
      return state;
  }
};

type EditAction = 
  | { type: 'START_EDIT'; task: ITaskWithProgress }
  | { type: 'SET_FIELD'; field: keyof Omit<EditState, 'id'>; value: any }
  | { type: 'CANCEL' };

const editReducer = (state: EditState, action: EditAction): EditState => {
  switch (action.type) {
    case 'START_EDIT': {
      const a = (action.task as any).AssignedTo;
      const people = Array.isArray(a) ? a : a ? [a] : [];
      let ids = people.map((u: any) => Number(u?.Id)).filter(Boolean);

      if (ids.length === 0) {
        ids = (action.task.userStates?.map(us => Number(us.UserId)).filter(Boolean)) ?? [];
      }

      return {
        id: action.task.Id,
        title: action.task.Title || '',
        assignToIds: ids,
        due: action.task.DueDate ? action.task.DueDate.slice(0, 10) : '',
        status: (action.task.Status || 'Not Started') as TaskStatus,
        priority: (action.task.Priority || 'Normal') as TaskPriority,
        description: action.task.Description || '',
      };
    }
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    case 'CANCEL':
      return {
        id: null,
        title: '',
        assignToIds: [],
        due: '',
        status: 'Not Started',
        priority: 'Normal',
        description: '',
      };
    default:
      return state;
  }
};

/* ================================ HELPER FUNCTIONS (OUTSIDE COMPONENT) ================================ */

const getStatusIcon = (s?: string): React.ReactElement => {
  switch (s) {
    case 'Completed':
      return <CheckCircle size={16} />;
    case 'In Progress':
      return <Play size={16} />;
    case 'Blocked':
      return <Pause size={16} />;
    default:
      return <Clock size={16} />;
  }
};

const getStatusColor = (s?: string): string => {
  switch (s) {
    case 'Completed':
      return 'green';
    case 'In Progress':
      return 'blue';
    case 'Blocked':
      return 'red';
    default:
      return 'gray';
  }
};

const getPriorityColor = (p?: string): string => {
  switch (p) {
    case 'Critical':
      return 'red';
    case 'High':
      return 'amber';
    case 'Normal':
      return 'blue';
    default:
      return 'gray';
  }
};

const formatDate = (d?: string): string =>
  !d
    ? ''
    : new Date(d).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

const isOverdue = (d?: string, s?: string): boolean =>
  !!d && s !== 'Completed' && new Date(d) < new Date();

/* ================================ ASSIGNEE LIST COMPONENT ================================ */

const AssigneeList: React.FC<{
  task: ITaskWithProgress;
  people?: TaskPeople;
}> = React.memo(({ task, people }) => {
  const [expanded, setExpanded] = useState(false);

  const a = (task as any).AssignedTo;
  const assignedPeople = Array.isArray(a) ? a : a ? [a] : [];

  if (!assignedPeople.length) {
    return (
      <div className={styles.metaItem}>
        <User size={14} />
        <span className={styles.noAssignees}>No assignees</span>
      </div>
    );
  }

  const stateByUserId = new Map<number, ITaskUserState>();
  task.userStates?.forEach(us => stateByUserId.set(us.UserId, us));

  const assignedIds = people?.assignedUserIds ?? [];
  const hasExpandedMembers = assignedIds.length > 0;

  const displayList = hasExpandedMembers
    ? assignedIds.map(id => {
        const userState = stateByUserId.get(id);
        return {
          Id: id,
          UserId: id,
          UserTitle: people?.assignedUserNameById[id] || `User ${id}`,
          Status: userState?.Status || 'Not Started',
          CompletedOn: userState?.CompletedOn || null
        };
      })
    : assignedPeople.map(person => {
        const userState = stateByUserId.get(person.Id);
        return {
          Id: person.Id,
          UserId: person.Id,
          UserTitle: person.Title || `User ${person.Id}`,
          Status: userState?.Status || 'Not Started',
          CompletedOn: userState?.CompletedOn || null
        };
      });

  return (
    <div className={styles.assigneeSection}>
      <div
        className={styles.assigneeHeader}
        onClick={() => setExpanded(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <User size={14} />
        <span className={styles.assigneeLabel}>
          {displayList.length} {displayList.length === 1 ? 'Assignee' : 'Assignees'}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      {expanded && (
        <div className={styles.assigneeList}>
          {displayList.map(us => {
            const statusClass =
              us.Status === 'Completed' ? styles.completed :
              us.Status === 'In Progress' ? styles.inProgress :
              us.Status === 'Blocked' ? styles.blocked :
              styles.notStarted;

            return (
              <div key={us.Id} className={`${styles.assigneeChip} ${statusClass}`}>
                <span className={styles.assigneeName}>
                  {us.UserTitle}
                </span>
                {us.Status === 'Completed' && (
                  <>
                    {us.CompletedOn && (
                      <span className={styles.completedDate}>
                        {new Date(us.CompletedOn).toLocaleDateString(undefined, {
                          timeZone: 'America/Los_Angeles',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    )}
                    <CheckCircle size={12} className={styles.completedIcon} />
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ================================ TASK PROGRESS INDICATOR ================================ */

const TaskProgressIndicator: React.FC<{
  task: ITaskWithProgress;
  people?: TaskPeople;
}> = React.memo(({ task, people }) => {
  const [open, setOpen] = useState(true);
  const [visibleCount, setVisibleCount] = useState(30);
  const CHUNK = 30;

  const a = (task as any).AssignedTo;
  const assignedPeople = Array.isArray(a) ? a : a ? [a] : [];

  const stateByUserId = new Map<number, ITaskUserState>();
  task.userStates?.forEach(us => stateByUserId.set(us.UserId, us));

  const assignedIds = people?.assignedUserIds ?? [];
  const hasExpandedMembers = assignedIds.length > 0;

  const userStates: ITaskUserState[] = (hasExpandedMembers ? assignedIds : assignedPeople.map(p => Number(p.Id)))
    .map((id: number) => {
      const userState = stateByUserId.get(id);
      return {
        Id: Number(id),
        TaskId: task.Id,
        UserId: Number(id),
        UserTitle: people?.assignedUserNameById[id] || `User ${id}`,
        Status: userState?.Status ?? 'Not Started',
        CompletedOn: userState?.CompletedOn ?? undefined,
        Created: userState?.Created ?? '',
        Modified: userState?.Modified ?? ''
      };
    });

  const total = userStates.length;
  const completed = userStates.filter(u => u.Status === 'Completed').length;
  const pct = total ? Math.round((completed / total) * 100) : 0;

  const incompleteUsers = userStates.filter(u => u.Status !== 'Completed');
  
  const sorted = [...incompleteUsers].sort((a, b) => {
    const order = { 'Blocked': 0, 'In Progress': 1, 'Not Started': 2 };
    return ((order as any)[a.Status] ?? 3) - ((order as any)[b.Status] ?? 3);
  });

  const shown = sorted.slice(0, visibleCount);

  const onScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    const el = e.currentTarget;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom && visibleCount < incompleteUsers.length) {
      setVisibleCount(v => Math.min(v + CHUNK, incompleteUsers.length));
    }
  };

  return (
    <div className={styles.compactProgressSection}>
      <div
        className={styles.progressStats}
        onClick={() => setOpen(v => !v)}
        style={{ cursor: 'pointer' }}
      >
        <span>Progress: {completed} of {total} completed</span>
        <span className={styles.progressPercentage}>
          {pct}% {open ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
        </span>
      </div>

      <div className={styles.progressBarContainer}>
        <div className={styles.progressBarTrack}>
          <div 
            className={styles.progressBarFill} 
            style={{ width: `${pct}%` }} 
          />
        </div>
      </div>

      {open && incompleteUsers.length > 0 && (
        <>
          <div style={{
            fontSize: '11px',
            color: '#64748b',
            marginBottom: '8px',
            fontWeight: 600,
            marginTop: '8px'
          }}>
            {incompleteUsers.length} Pending {incompleteUsers.length === 1 ? 'Assignee' : 'Assignees'}
          </div>
          
          <div
            className={styles.assigneeScrollList}
            onScroll={onScroll}
            role="list"
            aria-label="Incomplete Assignees"
          >
            {shown.map(us => {
              const isBlocked = us.Status === 'Blocked';
              const isInProgress = us.Status === 'In Progress';
              
              return (
                <div
                  key={us.Id}
                  className={`${styles.assigneeRow} ${
                    isBlocked ? styles.blocked : 
                    isInProgress ? styles.inProgress : 
                    styles.notStarted
                  }`}
                  role="listitem"
                >
                  <div className={styles.assigneeLeft}>
                    <User size={14} className={styles.assigneeIcon} />
                    <span className={styles.assigneeName}>
                      {us.UserTitle || `User ${us.UserId}`}
                    </span>
                  </div>

                  <div className={styles.assigneeRight}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      {us.Status}
                    </span>
                    <AlertCircle size={16} className={styles.alertIcon} />
                  </div>
                </div>
              );
            })}

            {visibleCount < incompleteUsers.length && (
              <button
                className={styles.loadMoreBtn}
                onClick={() => setVisibleCount(v => Math.min(v + CHUNK, incompleteUsers.length))}
              >
                Load more ({incompleteUsers.length - visibleCount} remaining)
              </button>
            )}
          </div>
        </>
      )}

      {open && incompleteUsers.length === 0 && total > 0 && (
        <div style={{
          padding: '12px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          color: '#166534',
          fontWeight: 600,
          marginTop: '8px'
        }}>
          <CheckCircle size={16} style={{ color: '#16a34a' }} />
          All assignees have completed this task!
        </div>
      )}
    </div>
  );
});

/* ================================ MEMOIZED TASK CARD ================================ */

interface TaskCardProps {
  task: ITaskWithProgress;
  editing: boolean;
  overdue: boolean;
  statusButtonText: string;
  showStatusButton: boolean;
  canEdit: boolean;
  canDelete: boolean;
  updatingTaskId: number | null;
  onStartEdit: (task: ITaskWithProgress) => void;
  onConfirmDelete: (task: ITaskWithProgress) => void;
  onUpdateMyStatus: (taskId: number) => void;
  editState: EditState;
  onEditFieldChange: (field: keyof Omit<EditState, 'id'>, value: any) => void;
  onSaveEdit: (taskId: number) => void;
  onCancelEdit: () => void;
  assignees: Array<{ Id: number; Title: string }>;
  appUpdating: boolean;
  userRole: UserRole | null;
  people?: TaskPeople;
}

const TaskCard = React.memo<TaskCardProps>(({
  task,
  editing,
  overdue,
  statusButtonText,
  showStatusButton,
  canEdit,
  canDelete,
  updatingTaskId,
  onStartEdit,
  onConfirmDelete,
  onUpdateMyStatus,
  editState,
  onEditFieldChange,
  onSaveEdit,
  onCancelEdit,
  assignees,
  appUpdating,
  userRole,
  people
}) => {
  return (
    <div className={`${styles.taskCard} ${overdue ? styles.overdue : ''}`}>
      {editing ? (
        <div className={styles.editForm}>
          <div className={styles.editHeader}>
            <input
              className={styles.editTitleInput}
              type="text"
              value={editState.title}
              onChange={e => onEditFieldChange('title', e.target.value)}
              placeholder="Task title"
              disabled={appUpdating}
            />
            <div className={styles.editActions}>
              <button
                className={styles.saveEditBtn}
                onClick={() => onSaveEdit(task.Id)}
                disabled={appUpdating}
              >
                <Save size={16} />
              </button>
              <button
                className={styles.cancelEditBtn}
                onClick={onCancelEdit}
                disabled={appUpdating}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className={styles.editContent}>
            <div className={styles.editRow}>
              <div className={styles.editGroup}>
                <label>Status</label>
                <select
                  id='editStatus'
                  className={styles.editSelect}
                  value={editState.status}
                  onChange={e => onEditFieldChange('status', e.target.value as TaskStatus)}
                  disabled={appUpdating}
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                  <option value="Blocked">Blocked</option>
                </select>
              </div>
              <div className={styles.editGroup}>
                <label>Priority</label>
                <select
                  id='editPriority'
                  className={styles.editSelect}
                  value={editState.priority}
                  onChange={e => onEditFieldChange('priority', e.target.value as TaskPriority)}
                  disabled={appUpdating || userRole !== 'Admin'}
                >
                  <option value="Low">Low</option>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div className={styles.editRow}>
              <div className={styles.editGroup}>
                <label>Due Date</label>
                <input
                  className={styles.editInput}
                  type="date"
                  value={editState.due}
                  onChange={e => onEditFieldChange('due', e.target.value)}
                  disabled={appUpdating || userRole !== 'Admin'}
                />
              </div>
              <div className={styles.editGroup}>
                <label>Assigned To</label>
                <MultiSelectUsers
                  key={editState.id ?? 'edit'}
                  options={assignees}
                  selectedIds={editState.assignToIds}
                  onChange={(ids) => {
                    const numIds = (ids || []).map(n => Number(n)).filter(Boolean);
                    onEditFieldChange('assignToIds', numIds);
                  }}
                  placeholder="Select team members..."
                  disabled={appUpdating || userRole !== 'Admin'}
                  batchSize={50}
                />
                <small className={styles.helpText}>
                  {editState.assignToIds.length > 0 && `${editState.assignToIds.length} selected`}
                </small>
              </div>
            </div>
            <div className={styles.editGroup}>
              <label>Description</label>
              <textarea
                className={styles.editTextarea}
                rows={3}
                value={editState.description}
                onChange={e => onEditFieldChange('description', e.target.value)}
                disabled={appUpdating || userRole !== 'Admin'}
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.taskHeader}>
            <div className={styles.taskTitle}>
              <h3>{task.Title}</h3>
              {overdue && <span className={styles.overdueLabel}>Overdue</span>}
            </div>
            <div className={styles.taskActions}>
              {canEdit && (
                <button
                  className={styles.actionBtn}
                  onClick={() => onStartEdit(task)}
                  title="Edit task"
                  disabled={appUpdating}
                >
                  <Edit size={16} />
                </button>
              )}
              {canDelete && (
                <button
                  className={`${styles.actionBtn} ${styles.deleteBtn}`}
                  onClick={() => onConfirmDelete(task)}
                  title="Delete task"
                  disabled={appUpdating}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          <div className={styles.taskMeta}>
            <div className={styles.metaRow}>
              <div
                className={`${styles.statusBadge} ${
                  styles[getStatusColor(task.Status) as keyof typeof styles]
                }`}
              >
                {getStatusIcon(task.Status)}
                <span>{task.Status || 'Not Started'}</span>
              </div>
              <div
                className={`${styles.priorityBadge} ${
                  styles[getPriorityColor(task.Priority) as keyof typeof styles]
                }`}
              >
                <span>{task.Priority || 'Normal'}</span>
              </div>
            </div>
            {task.DueDate && (
              <div className={styles.metaItem}>
                <Calendar size={14} />
                <span>Due: {formatDate(task.DueDate)}</span>
              </div>
            )}
            {task.Created && (
              <div className={styles.metaItem}>
                <Clock size={14} />
                <span>Created: {formatDate(task.Created)}</span>
              </div>
            )}
          </div>

          <AssigneeList task={task} people={people} />

          {showStatusButton && (
            <button
              className={styles.quickCompleteBtn}
              onClick={() => onUpdateMyStatus(task.Id)}
              disabled={updatingTaskId === task.Id}
            >
              <Zap size={16} />
              {updatingTaskId === task.Id ? 'Updating...' : statusButtonText}
            </button>
          )}

          {(people?.totalAssigned ?? task.completionStats.total) > 0 && (
            <TaskProgressIndicator task={task} people={people} />
          )}

          {task.Description && (
            <div className={styles.taskDescription}>
              <p>{task.Description}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  if (prevProps.task.Id !== nextProps.task.Id) return false;
  if (prevProps.editing !== nextProps.editing) return false;
  if (prevProps.overdue !== nextProps.overdue) return false;
  if (prevProps.showStatusButton !== nextProps.showStatusButton) return false;
  if (prevProps.statusButtonText !== nextProps.statusButtonText) return false;
  if (prevProps.canEdit !== nextProps.canEdit) return false;
  if (prevProps.canDelete !== nextProps.canDelete) return false;
  if (prevProps.updatingTaskId !== nextProps.updatingTaskId) return false;
  if (prevProps.appUpdating !== nextProps.appUpdating) return false;
  if (prevProps.userRole !== nextProps.userRole) return false;
  if (prevProps.people !== nextProps.people) return false;
  
  // Only compare editState if this card is being edited
  if (nextProps.editing) {
    if (prevProps.editState.title !== nextProps.editState.title) return false;
    if (prevProps.editState.status !== nextProps.editState.status) return false;
    if (prevProps.editState.priority !== nextProps.editState.priority) return false;
    if (prevProps.editState.due !== nextProps.editState.due) return false;
    if (prevProps.editState.description !== nextProps.editState.description) return false;
    if (JSON.stringify(prevProps.editState.assignToIds) !== JSON.stringify(nextProps.editState.assignToIds)) return false;
  }
  
  // Check if task data changed
  if (prevProps.task.Title !== nextProps.task.Title) return false;
  if (prevProps.task.Status !== nextProps.task.Status) return false;
  if (prevProps.task.Priority !== nextProps.task.Priority) return false;
  if (prevProps.task.DueDate !== nextProps.task.DueDate) return false;
  if (prevProps.task.Description !== nextProps.task.Description) return false;
  if (JSON.stringify(prevProps.task.userStates) !== JSON.stringify(nextProps.task.userStates)) return false;
  
  return true; // Props are equal, skip re-render
});

/* ================================ MAIN COMPONENT ================================ */

export default function Tasks(): React.ReactElement {
  const context = useContext(AppContext)!;
  const services = React.useMemo(
    () => SharePointServiceFactory.getInstance(context),
    [context]
  );

  const [appState, setAppState] = useState({
    rows: [] as ITaskWithProgress[],
    loading: true,
    error: null as string | null,
    showForm: false,
    meId: null as number | null,
    userRole: null as UserRole | null,
    updating: false,
  });

  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ Id: number; Title: string }>>([]);
  const [taskPeopleById, setTaskPeopleById] = useState<Record<number, TaskPeople>>({});

  const [formState, dispatchForm] = useReducer(formReducer, {
    title: '',
    due: '',
    priority: 'Normal' as TaskPriority,
    status: 'Not Started' as TaskStatus,
    description: '',
    assignToIds: [] as number[],
  });

  const [filterState, dispatchFilter] = useReducer(filterReducer, {
    query: '',
    status: 'All' as const,
    priority: 'All' as const,
    currentPage: 1,
    itemsPerPage: 6,
  });

  const [editState, dispatchEdit] = useReducer(editReducer, {
    id: null,
    title: '',
    assignToIds: [],
    due: '',
    status: 'Not Started',
    priority: 'Normal',
    description: '',
  });

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    task: ITaskWithProgress | null;
  }>({
    isOpen: false,
    task: null
  });

  const confirmDelete = (task: ITaskWithProgress) => {
    setConfirmDialog({
      isOpen: true,
      task: task
    });
  };

  const handleConfirmDelete = async (): Promise<void> => {
    if (!confirmDialog.task) return;

    try {
      setAppState(prev => ({ ...prev, updating: true }));
      await services.tasks.delete(confirmDialog.task.Id);
      await load();
      setConfirmDialog({ isOpen: false, task: null });
    } catch (e: unknown) {
      const err = e as Error;
      setAppState(prev => ({ ...prev, error: err.message ?? String(e) }));
    } finally {
      setAppState(prev => ({ ...prev, updating: false }));
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ isOpen: false, task: null });
  };

  /* ================================ DATA LOADING ================================ */

  const resolveTaskPeople = React.useCallback(
    async (
      tasks: ITaskWithProgress[],
      visibleUserIds?: Set<number>
    ): Promise<Record<number, TaskPeople>> => {
      if (!tasks.length) return {};

      // Collect all principal IDs from both AssignedTo and AssignedUsers
      const principalIdSet = new Set<number>();
      tasks.forEach(task => {
        const assigned = (task as any).AssignedTo;
        const assignedPeople = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
        assignedPeople.forEach((principal: { Id: number }) => {
          const id = Number(principal.Id);
          if (id) principalIdSet.add(id);
        });
        const assignedUsers = (task as any).AssignedUsers;
        const assignedUsersArr = Array.isArray(assignedUsers) ? assignedUsers : assignedUsers ? [assignedUsers] : [];
        assignedUsersArr.forEach((principal: { Id: number }) => {
          const id = Number(principal.Id);
          if (id) principalIdSet.add(id);
        });
      });

      const uniquePrincipalIds = Array.from(principalIdSet);
      const principals = uniquePrincipalIds.length
        ? await services.user
            .getPrincipalsByIds(uniquePrincipalIds)
            .catch((): Array<{ Id: number; Title: string; PrincipalType: number }> => [])
        : [];
      const principalMap = new Map<number, { Id: number; Title: string; PrincipalType: number }>(
        principals.map((principal: { Id: number; Title: string; PrincipalType: number }) => [
          principal.Id,
          principal
        ])
      );

      const groupMembersMap = new Map<number, Array<{ Id: number; Title: string }>>();

      await Promise.all(
        uniquePrincipalIds.map(async (id: number) => {
          const info = principalMap.get(id);
          const members = await services.membership
            .getPrincipalMembers(id, info?.PrincipalType)
            .catch((): Array<{ Id: number; Title: string }> => []);
          groupMembersMap.set(id, members);
        })
      );

      const peopleByTask: Record<number, TaskPeople> = {};
      const shouldIncludeUser = (id: number): boolean =>
        !visibleUserIds || visibleUserIds.has(id);

      tasks.forEach((task: ITaskWithProgress) => {
        const assignedNameById = new Map<number, string>();
        const assignedFallbackNames: string[] = [];
        const assignedUserNameById: Record<number, string> = {};

        // Expand both AssignedTo and AssignedUsers for group membership
        const expandPrincipal = (principal: { Id: number; Title?: string }) => {
          const info = principalMap.get(principal.Id);
          const rawMembers = groupMembersMap.get(principal.Id) || [];
          const members = visibleUserIds
            ? rawMembers.filter(m => shouldIncludeUser(m.Id))
            : rawMembers;
          const isGroup = members.length > 0 || (info ? info.PrincipalType !== 1 : false);

          if (isGroup) {
            if (members.length) {
              members.forEach(member => {
                assignedNameById.set(member.Id, member.Title);
                assignedUserNameById[member.Id] = member.Title;
              });
            } else if (!visibleUserIds) {
              assignedFallbackNames.push(principal.Title || info?.Title || `Group ${principal.Id}`);
            }
          } else if (shouldIncludeUser(principal.Id)) {
            const name = principal.Title || info?.Title || `User ${principal.Id}`;
            assignedNameById.set(principal.Id, name);
            assignedUserNameById[principal.Id] = name;
          }
        };

        // Expand AssignedTo
        const assigned = (task as any).AssignedTo;
        const assignedPeople = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
        assignedPeople.forEach(expandPrincipal);
        // Expand AssignedUsers
        const assignedUsers = (task as any).AssignedUsers;
        const assignedUsersArr = Array.isArray(assignedUsers) ? assignedUsers : assignedUsers ? [assignedUsers] : [];
        assignedUsersArr.forEach(expandPrincipal);

        const assignedUserIds = Array.from(assignedNameById.keys());
        const assignedNames =
          assignedUserIds.length > 0
            ? Array.from(assignedNameById.values())
            : assignedFallbackNames;

        const stateByUserId = new Map<number, ITaskUserState>();
        task.userStates?.forEach(us => stateByUserId.set(us.UserId, us));

        const completedUserIds = assignedUserIds.filter(id => {
          const state = stateByUserId.get(id);
          return state?.Status === 'Completed';
        });

        const completedNames = completedUserIds.map(
          id => assignedUserNameById[id] || `User ${id}`
        );

        const remainingNames = assignedUserIds
          .filter(id => !completedUserIds.includes(id))
          .map(id => assignedUserNameById[id] || `User ${id}`);

        const totalAssigned =
          assignedUserIds.length || (assignedPeople.length ? assignedPeople.length : 0);

        peopleByTask[task.Id] = {
          assignedUserIds,
          assignedNames,
          assignedUserNameById,
          completedNames,
          remainingNames,
          totalAssigned,
          completedCount: completedUserIds.length
        };
      });

      return peopleByTask;
    },
    [services]
  );

  const load = React.useCallback(async () => {
    setAppState(prev => ({ ...prev, loading: true, error: null }));
    try {
        const [userRole, isOwner, currentUserId] = await Promise.all([
          services.roles.getCurrentUserRole(),
          Promise.resolve(services.roles.isCurrentUserOwner()),
          services.user.getCurrentUserId()
        ]);

        if (userRole === 'Admin') {
          await services.provisioning
            .ensureTaskAssignedToField()
            .catch(error => console.warn('Task provisioning failed:', error));
        }

      let tasks: ITaskItem[] = [];

      let teamUserIdSet: Set<number> | undefined;

      if (isOwner) {
        tasks = await services.tasks.getAll(400);
      } else if (userRole === 'Manager') {
        const teamUserIds = await services.membership.getDepartmentEmployeePrincipalIds(currentUserId);
        teamUserIdSet = new Set<number>([currentUserId, ...teamUserIds]);
        tasks = await services.tasks.getAll(400);
      } else {
        const principalIds = await services.membership.getVisiblePrincipalIds(currentUserId);
        tasks = await services.tasks.getByPrincipalIds(
          principalIds,
          400,
          ASSIGNEE_INTERNAL_NAME
        );
      }

      const enrichedTasks = await services.taskUserStates.enrichTasksWithProgress(
        tasks,
        currentUserId
      );
      const peopleByTask = await resolveTaskPeople(enrichedTasks, teamUserIdSet);
      const filteredTasks =
        userRole === 'Manager'
          ? enrichedTasks.filter(task => (peopleByTask[task.Id]?.assignedUserIds?.length ?? 0) > 0)
          : enrichedTasks;
      const filteredPeopleByTask =
        userRole === 'Manager'
          ? filteredTasks.reduce<Record<number, TaskPeople>>((acc, task) => {
              if (peopleByTask[task.Id]) acc[task.Id] = peopleByTask[task.Id];
              return acc;
            }, {})
          : peopleByTask;

      setAppState(prev => ({
        ...prev,
        rows: filteredTasks,
        userRole,
        meId: currentUserId
      }));
      setTaskPeopleById(filteredPeopleByTask);
    } catch (e: unknown) {
      const err = e as Error;
      setAppState(prev => ({ ...prev, error: err.message ?? String(e) }));
    } finally {
      setAppState(prev => ({ ...prev, loading: false }));
    }
  }, [services, resolveTaskPeople]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const fetchAllUsers = async () => {
      if (!appState.userRole || !appState.meId) return;

      try {
        let visiblePrincipalIds;
        if (appState.userRole === 'Manager') {
          // Get all users and groups assigned to manager's team
          const teamUserIds = await services.membership.getDepartmentEmployeePrincipalIds(appState.meId);
          visiblePrincipalIds = [appState.meId, ...teamUserIds];
        } else {
          visiblePrincipalIds = await services.membership.getVisiblePrincipalIds(appState.meId);
        }
        const users = await services.user.getAllAssignableUsers(
          appState.userRole,
          visiblePrincipalIds
        );
        setAllUsers(users);
      } catch (error) {
        console.error('Error fetching assignable users:', error);
      }
    };

    void fetchAllUsers();
  }, [services, appState.userRole, appState.meId]);

  /* ================================ COMPUTED VALUES ================================ */

  const assignees = useMemo(() => {
    if (allUsers.length > 0) {
      return allUsers;
    }

    const map = new Map<number, string>();

    for (const r of appState.rows) {
      const a = (r as any).AssignedTo;
      if (Array.isArray(a)) {
        a.forEach((u: any) => {
          if (u?.Id && u?.Title) map.set(u.Id, u.Title);
        });
      } else if (a?.Id && a?.Title) {
        map.set(a.Id, a.Title);
      }
    }

    const meName = context.pageContext?.user?.displayName || '';
    if (appState.meId && meName && !map.has(appState.meId)) {
      map.set(appState.meId, meName);
    }

    return Array.from(map.entries()).map(([Id, Title]) => ({ Id, Title }));
  }, [allUsers, appState.rows, appState.meId, context]);

  const filtered = useMemo(() => {
    const qq = filterState.query.trim().toLowerCase();
    return appState.rows.filter(r => {
      const text = [
        r.Title || '',
        r.Description || '',
        r.Priority || '',
        r.Status || '',
        r.AssignedTo?.Title || ''
      ]
        .join(' ')
        .toLowerCase();
      const okText = !qq || text.includes(qq);
      const okStatus = filterState.status === 'All' ? true : (r.Status || '') === filterState.status;
      const okPrio = filterState.priority === 'All' ? true : (r.Priority || '') === filterState.priority;
      return okText && okStatus && okPrio;
    });
  }, [appState.rows, filterState.query, filterState.status, filterState.priority]);

  const totalPages = Math.ceil(filtered.length / filterState.itemsPerPage);
  const startIndex = (filterState.currentPage - 1) * filterState.itemsPerPage;
  const endIndex = startIndex + filterState.itemsPerPage;
  const currentItems = filtered.slice(startIndex, endIndex);

  const stats = useMemo(() => {
    const total = appState.rows.length;
    const completed = appState.rows.filter(r => r.Status === 'Completed').length;
    const inProgress = appState.rows.filter(r => r.Status === 'In Progress').length;
    const overdue = appState.rows.filter(
      r => r.DueDate && r.Status !== 'Completed' && new Date(r.DueDate) < new Date()
    ).length;
    return [
      { title: 'Total Tasks', value: total.toString(), icon: Target, color: 'blue' },
      { title: 'In Progress', value: inProgress.toString(), icon: Play, color: 'amber' },
      { title: 'Completed', value: completed.toString(), icon: CheckCircle, color: 'green' },
      { title: 'Overdue', value: overdue.toString(), icon: AlertCircle, color: 'red' },
    ];
  }, [appState.rows]);

  /* ================================ EVENT HANDLERS ================================ */

  const onAdd = async (): Promise<void> => {
    if (!formState.title.trim()) {
      alert('Please enter a title.');
      return;
    }

    if (!(await services.roles.canCreateTasks())) {
      alert('You do not have permission to create tasks.');
      return;
    }

    try {
      setAppState(prev => ({ ...prev, updating: true }));

      const task = await services.tasks.create({
        Title: formState.title.trim(),
        DueDate: formState.due || undefined,
        Status: formState.status,
        Priority: formState.priority,
        Description: formState.description,
        AssignedToId: formState.assignToIds && formState.assignToIds.length ? formState.assignToIds : undefined
      });

      if (!task || !task.Id) {
        throw new Error('Task creation failed - no task ID returned');
      }

      const assigneeIds = Array.isArray(formState.assignToIds)
        ? formState.assignToIds.map(Number).filter(Boolean)
        : [];
      const expandedAssigneeIds = assigneeIds.length
        ? await services.membership.expandPrincipalIdsToUserIds(assigneeIds)
        : [];
      const managerIds = expandedAssigneeIds.length
        ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
        : [];

      try {
        await services.security.secureTaskItem(task.Id, assigneeIds, managerIds);
      } catch (err) {
        console.warn('Failed to set task security:', err);
      }

      dispatchForm({ type: 'RESET' });
      await load();
      setAppState(prev => ({ ...prev, showForm: false }));
      
    } catch (e: unknown) {
      const err = e as Error;
      setAppState(prev => ({ ...prev, error: err.message ?? String(e) }));
    } finally {
      setAppState(prev => ({ ...prev, updating: false }));
    }
  };

  const startEdit = async (r: ITaskWithProgress): Promise<void> => {
    if (!appState.meId) return;

    if (!(await services.roles.canEditTask(r, appState.meId))) {
      alert('You do not have permission to edit this task.');
      return;
    }
    dispatchEdit({ type: 'START_EDIT', task: r });
  };

  const cancelEdit = (): void => {
    dispatchEdit({ type: 'CANCEL' });
  };

  const saveEdit = async (id: number): Promise<void> => {
    try {
      setAppState(prev => ({ ...prev, updating: true }));

      const payload: any = {
        Title: editState.title,
        DueDate: editState.due,
        Status: editState.status,
        Priority: editState.priority,
        Description: editState.description
      };

      if (Array.isArray(editState.assignToIds)) {
        payload.AssignedToId = editState.assignToIds.map(Number).filter(Boolean);
      }

      await services.tasks.update(id, payload);

      const assigneeIds = Array.isArray(editState.assignToIds)
        ? editState.assignToIds.map(Number).filter(Boolean)
        : [];
      const expandedAssigneeIds = assigneeIds.length
        ? await services.membership.expandPrincipalIdsToUserIds(assigneeIds)
        : [];
      const managerIds = expandedAssigneeIds.length
        ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
        : [];

      try {
        await services.security.secureTaskItem(id, assigneeIds, managerIds);
      } catch (err) {
        console.warn('Failed to update task security:', err);
      }

      dispatchEdit({ type: 'CANCEL' });
      await load();
    } catch (e: unknown) {
      const err = e as Error;
      setAppState(prev => ({ ...prev, error: err.message ?? String(e) }));
    } finally {
      setAppState(prev => ({ ...prev, updating: false }));
    }
  };

  const updateMyStatus = async (taskId: number): Promise<void> => {
    if (!appState.meId) return;

    try {
      setUpdatingTaskId(taskId);
      
      const task = appState.rows.find(t => t.Id === taskId);
      const myCurrentState = task?.userStates.find(us => us.UserId === appState.meId);
      const myCurrentStatus = myCurrentState?.Status || 'Not Started';
      
      let nextStatus: 'In Progress' | 'Completed';
      if (myCurrentStatus === 'Not Started') {
        nextStatus = 'In Progress';
      } else if (myCurrentStatus === 'In Progress') {
        nextStatus = 'Completed';
      } else {
        return;
      }
      
      await services.taskUserStates.setMyTaskStatus(
        taskId,
        nextStatus,
        appState.meId
      );
      
      await new Promise(resolve => setTimeout(resolve, 500));
      await load();
      
    } catch (e: unknown) {
      const err = e as Error;
      setAppState(prev => ({ ...prev, error: err.message ?? String(e) }));
    } finally {
      setUpdatingTaskId(null);
    }
  };

  /* ================================ PAGINATION ================================ */

  const goToPage = (page: number): void => {
    if (page >= 1 && page <= totalPages) {
      dispatchFilter({ type: 'SET_FIELD', field: 'currentPage', value: page });
    }
  };

  const goToFirstPage = (): void => goToPage(1);
  const goToLastPage = (): void => goToPage(totalPages);
  const goToPreviousPage = (): void => goToPage(filterState.currentPage - 1);
  const goToNextPage = (): void => goToPage(filterState.currentPage + 1);

  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, filterState.currentPage - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
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

  /* ================================ RENDER ================================ */

  if (appState.loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Loading tasks...</p>
      </div>
    );
  }

  if (appState.error) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} />
        <h3>Error Loading Tasks</h3>
        <p>{appState.error}</p>
        <button onClick={load} className={styles.retryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tasks}>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title="Delete Task?"
        message={
          confirmDialog.task
            ? `Are you sure you want to delete "${confirmDialog.task.Title}"? This will permanently remove the task and all associated data. This action cannot be undone.`
            : ''
        }
        variant="danger"
        confirmText="Delete Task"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={appState.updating}
      />
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Task Management</h1>
          <p className={styles.subtitle}>
            {"Organize, track, and manage your team's tasks efficiently"}
          </p>
          <div className={styles.roleIndicator}>
            {getRoleIcon(appState.userRole)}
            <span>Role: {getRoleDisplay(appState.userRole)}</span>
          </div>
        </div>
        {appState.userRole === 'Admin' && (
          <button
            className={styles.createBtn}
            onClick={() => setAppState(prev => ({ ...prev, showForm: !prev.showForm }))}
            disabled={appState.updating}
          >
            <Plus size={20} /> {appState.showForm ? 'Close Form' : 'New Task'}
          </button>
        )}
      </div>

      <div className={styles.statsGrid}>
        {stats.map((s, i) => (
          <div key={i} className={`${styles.statCard} ${styles[s.color as keyof typeof styles]}`}>
            <div className={styles.statIcon}>
              <s.icon size={24} />
            </div>
            <div className={styles.statContent}>
              <h3 className={styles.statValue}>{s.value}</h3>
              <p className={styles.statTitle}>{s.title}</p>
            </div>
          </div>
        ))}
      </div>

      {appState.showForm && appState.userRole === 'Admin' && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <h3>Create New Task</h3>
            <button
              className={styles.closeBtn}
              onClick={() => setAppState(prev => ({ ...prev, showForm: false }))}
              disabled={appState.updating}
            >
              <X size={20} />
            </button>
          </div>

          <div className={styles.formContent}>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Task Title *</span>
                  <input
                    className={styles.input}
                    type="text"
                    value={formState.title}
                    onChange={e =>
                      dispatchForm({ type: 'SET_FIELD', field: 'title', value: e.target.value })
                    }
                    placeholder="Enter task title"
                    disabled={appState.updating}
                  />
                </label>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Due Date</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={formState.due}
                    onChange={e =>
                      dispatchForm({ type: 'SET_FIELD', field: 'due', value: e.target.value })
                    }
                    disabled={appState.updating}
                  />
                </label>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Status</span>
                  <select
                  id='status'
                    className={styles.select}
                    value={formState.status}
                    onChange={e =>
                      dispatchForm({
                        type: 'SET_FIELD',
                        field: 'status',
                        value: e.target.value as TaskStatus
                      })
                    }
                    disabled={appState.updating}
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="Blocked">Blocked</option>
                  </select>
                </label>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Priority</span>
                  <select
                  id='priority'
                    className={styles.select}
                    value={formState.priority}
                    onChange={e =>
                      dispatchForm({
                        type: 'SET_FIELD',
                        field: 'priority',
                        value: e.target.value as TaskPriority
                      })
                    }
                    disabled={appState.updating}
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Description</span>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={formState.description}
                    onChange={e =>
                      dispatchForm({
                        type: 'SET_FIELD',
                        field: 'description',
                        value: e.target.value
                      })
                    }
                    placeholder="Task description (optional)"
                    disabled={appState.updating}
                  />
                </label>
              </div>
              <div className={styles.formGroup}>
                <div className={styles.label}>
                  <span>Assigned To</span>
                </div>

                <MultiSelectUsers
                  options={assignees}
                  selectedIds={formState.assignToIds}
                  onChange={(ids) => {
                    dispatchForm({ type: 'SET_FIELD', field: 'assignToIds', value: ids });
                  }}
                  placeholder="Select team members..."
                  disabled={appState.updating}
                  batchSize={50} 
                />

                <small className={styles.helpText}>
                  Search and select multiple users
                  {formState.assignToIds.length > 0 && ` (${formState.assignToIds.length} selected)`}
                </small>
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={styles.saveBtn} onClick={onAdd} disabled={appState.updating}>
                <Save size={16} />
                {appState.updating ? 'Creating...' : 'Create Task'}
              </button>
              <button
                className={styles.cancelBtn}
                onClick={() => setAppState(prev => ({ ...prev, showForm: false }))}
                disabled={appState.updating}
              >
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
            className={styles.searchInput}
            type="text"
            value={filterState.query}
            onChange={e => dispatchFilter({ type: 'SET_FIELD', field: 'query', value: e.target.value })}
            placeholder="Search tasks..."
          />
        </div>
        <div className={styles.filterSection}>
          <Filter size={20} />
          <span>Filters:</span>
          <select
          id='filterStatus'
            className={styles.filterSelect}
            value={filterState.status}
            onChange={e => dispatchFilter({ type: 'SET_FIELD', field: 'status', value: e.target.value })}
          >
            <option value="All">All Status</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="Blocked">Blocked</option>
          </select>
          <select
          id='filterPriority'
            className={styles.filterSelect}
            value={filterState.priority}
            onChange={e =>
              dispatchFilter({ type: 'SET_FIELD', field: 'priority', value: e.target.value })
            }
          >
            <option value="All">All Priority</option>
            <option value="Low">Low</option>
            <option value="Normal">Normal</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
        <div className={styles.paginationInfo}>
          <span>Items per page:</span>
          <select
          id='pagination'
            className={styles.itemsPerPageSelect}
            value={filterState.itemsPerPage}
            onChange={e => {
              dispatchFilter({
                type: 'SET_FIELD',
                field: 'itemsPerPage',
                value: Number(e.target.value)
              });
              dispatchFilter({ type: 'SET_FIELD', field: 'currentPage', value: 1 });
            }}
          >
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
            <option value={48}>48</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <Target size={48} />
          <h3>No tasks found</h3>
          <p>
            {filterState.query || filterState.status !== 'All' || filterState.priority !== 'All'
              ? 'No tasks match your current search or filter criteria.'
              : 'No tasks available. Create your first task to get started!'}
          </p>
          {!filterState.query &&
            filterState.status === 'All' &&
            filterState.priority === 'All' &&
            appState.userRole === 'Admin' && (
              <button
                onClick={() => setAppState(prev => ({ ...prev, showForm: true }))}
                className={styles.emptyActionBtn}
                disabled={appState.updating}
              >
                <Plus size={20} />
                Create First Task
              </button>
            )}
        </div>
      ) : (
        <>
          <div className={styles.resultsHeader}>
            <div className={styles.resultsSummary}>
              <span>
                Showing {startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length}{' '}
                tasks
                {filterState.query && (
                  <span className={styles.searchIndicator}>
                    {' '}
                    (filtered by "{filterState.query}")
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className={styles.tasksGrid}>
            {currentItems.map(task => {
              const editing = editState.id === task.Id;
              const overdue = isOverdue(task.DueDate, task.Status);
              
              const assignedTo = (task as any)?.AssignedTo;
              const assignedUsers = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : [];
              const people = taskPeopleById[task.Id];
              const isAssignedToMe =
                assignedUsers.some(u => Number(u?.Id) === appState.meId) ||
                (people?.assignedUserIds || []).includes(appState.meId || -1);
              
              const myState = task.userStates.find(us => us.UserId === appState.meId);
              const myStatus = myState?.Status || 'Not Started';
              
              let statusButtonText = '';
              let showStatusButton = false;
              
              if (isAssignedToMe && myStatus !== 'Completed' && myStatus !== 'Blocked') {
                showStatusButton = true;
                if (myStatus === 'Not Started') {
                  statusButtonText = 'Start Task';
                } else if (myStatus === 'In Progress') {
                  statusButtonText = 'Mark Complete';
                }
              }
              
              const canEdit = appState.userRole === 'Admin';
              const canDelete = appState.userRole === 'Admin';

              return (
                <TaskCard
                  key={task.Id}
                  task={task}
                  editing={editing}
                  overdue={overdue}
                  statusButtonText={statusButtonText}
                  showStatusButton={showStatusButton}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  updatingTaskId={updatingTaskId}
                  onStartEdit={startEdit}
                  onConfirmDelete={confirmDelete}
                  onUpdateMyStatus={updateMyStatus}
                  editState={editState}
                  onEditFieldChange={(field, value) =>
                    dispatchEdit({ type: 'SET_FIELD', field, value })
                  }
                  onSaveEdit={saveEdit}
                  onCancelEdit={cancelEdit}
                  assignees={assignees}
                  appUpdating={appState.updating}
                  userRole={appState.userRole}
                  people={people}
                />
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className={styles.paginationContainer}>
              <div className={styles.paginationControls}>
                <button
                  className={`${styles.paginationBtn} ${styles.paginationNavBtn}`}
                  onClick={goToFirstPage}
                  disabled={filterState.currentPage === 1}
                  title="First page"
                >
                  <ChevronsLeft size={16} />
                </button>

                <button
                  className={`${styles.paginationBtn} ${styles.paginationNavBtn}`}
                  onClick={goToPreviousPage}
                  disabled={filterState.currentPage === 1}
                  title="Previous page"
                >
                  <ChevronLeft size={16} />
                </button>

                <div className={styles.paginationNumbers}>
                  {getPageNumbers().map(pageNum => (
                    <button
                      key={pageNum}
                      className={`${styles.paginationBtn} ${styles.paginationNumberBtn} ${
                        filterState.currentPage === pageNum ? styles.active : ''
                      }`}
                      onClick={() => goToPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  className={`${styles.paginationBtn} ${styles.paginationNavBtn}`}
                  onClick={goToNextPage}
                  disabled={filterState.currentPage === totalPages}
                  title="Next page"
                >
                  <ChevronRight size={16} />
                </button>

                <button
                  className={`${styles.paginationBtn} ${styles.paginationNavBtn}`}
                  onClick={goToLastPage}
                  disabled={filterState.currentPage === totalPages}
                  title="Last page"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>

              <div className={styles.paginationInfo}>
                <span>
                  Page {filterState.currentPage} of {totalPages}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
