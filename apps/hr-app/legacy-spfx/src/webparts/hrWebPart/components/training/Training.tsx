// ...existing imports...
import { useRef } from 'react';
// Modal component for survey popup
const SurveyModal: React.FC<{ url: string; open: boolean; onClose: () => void }> = ({ url, open, onClose }) => {
  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 800, width: '90vw', boxShadow: '0 2px 16px rgba(0,0,0,0.2)' }}>
        <h2 style={{ marginBottom: 16 }}>Complete Quiz</h2>
        <iframe src={url} width="100%" height="500" style={{ border: 'none', borderRadius: 4 }} title="Survey" />
        <div style={{ textAlign: 'right', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 4, background: '#0078d4', color: '#fff', border: 'none', fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
};
import * as React from 'react';
import { useLocation } from 'react-router-dom';
import { useContext, useEffect, useMemo, useState } from 'react';
import styles from './Training.module.scss';
import {
  BookOpen,
  PlayCircle,
  CheckCircle,
  Calendar,
  Users,
  Target,
  Filter,
  Search,
  Plus,
  AlertCircle,
  Edit,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { AppContext } from '../App';
import { SharePointServiceFactory } from '../../../../shared/services';
import {
  ITrainingVideo,
  ITrainingAssignment,
  ITrainingCompletion,
  ISurvey,
  ISurveyAssignment,
  ISurveyCompletion,
  UserRole
} from '../../../../shared/models';
import { MultiSelectUsers } from '../tasks/MultiSelectUsers';

type TabKey = 'my-training' | 'assignments' | 'surveys';
type AssignmentPeople = {
  assignedUserIds: number[];
  assignedNames: string[];
  completedNames: string[];
  inProgressUserIds: number[];
  inProgressNames: string[];
  remainingNames: string[];
  totalAssigned: number;
  completedCount: number;
  status: 'completed' | 'overdue' | 'in-progress';
};

const Training: React.FC = () => {
  const context = useContext(AppContext);
  const services = useMemo(
    () => SharePointServiceFactory.getInstance(context!),
    [context]
  );
  // Use React Router's useLocation for navigation state
  const location = useLocation();
  const state = location.state || {};

  // Set initial tab based on navigation state
  const [activeTab, setActiveTab] = useState<TabKey>(state?.tab === 'surveys' ? 'surveys' : 'my-training');
  // Optionally select survey assignment if provided
  React.useEffect(() => {
    if (state?.tab === 'surveys') {
      setActiveTab('surveys');
      if (state.selectedId) {
        setSelectedAssignmentId(state.selectedId);
        setExpandedSurveyAssignments(new Set([state.selectedId]));
      }
    }
  }, [state]);
    // Fix: define loadData for error/retry and refresh
    const loadData = async () => {
      await loadTabData(activeTab);
    };
  // Removed unused: loading, setLoading
  const [tabLoading, setTabLoading] = useState<{ [key in TabKey]?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const progressTimersRef = React.useRef<Record<number, number>>({});

  const [videos, setVideos] = useState<ITrainingVideo[]>([]);
  const [allAssignments, setAllAssignments] = useState<ITrainingAssignment[]>([]);
  const [myAssignments, setMyAssignments] = useState<ITrainingAssignment[]>([]);
  const [completions, setCompletions] = useState<ITrainingCompletion[]>([]);
  const [myCompletions, setMyCompletions] = useState<ITrainingCompletion[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<Array<{ Id: number; Title: string }>>([]);
  const [completionUsers, setCompletionUsers] = useState<Record<number, string>>({});
  const [trainingPeopleByAssignmentId, setTrainingPeopleByAssignmentId] =
    useState<Record<number, AssignmentPeople>>({});
  const [surveyPeopleByAssignmentId, setSurveyPeopleByAssignmentId] =
    useState<Record<number, AssignmentPeople>>({});

  const [surveys, setSurveys] = useState<ISurvey[]>([]);
  const [allSurveyAssignments, setAllSurveyAssignments] = useState<ISurveyAssignment[]>([]);
  const [mySurveyAssignments, setMySurveyAssignments] = useState<ISurveyAssignment[]>([]);
  const [surveyCompletions, setSurveyCompletions] = useState<ISurveyCompletion[]>([]);
  const [mySurveyCompletions, setMySurveyCompletions] = useState<ISurveyCompletion[]>([]);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [editDueDate, setEditDueDate] = useState<string>('');
  const [editAssignees, setEditAssignees] = useState<number[]>([]);
  const [editingSurveyAssignmentId, setEditingSurveyAssignmentId] = useState<number | null>(null);
  const [editSurveyDueDate, setEditSurveyDueDate] = useState<string>('');
  const [editSurveyAssignees, setEditSurveyAssignees] = useState<number[]>([]);
  const [expandedTrainingAssignments, setExpandedTrainingAssignments] = useState<Set<number>>(
    () => new Set()
  );
  const [expandedSurveyAssignments, setExpandedSurveyAssignments] = useState<Set<number>>(
    () => new Set()
  );
  const [showTrainingForm, setShowTrainingForm] = useState(false);
  const [showSurveyCreateForm, setShowSurveyCreateForm] = useState(false);
  const [showSurveyAssignForm, setShowSurveyAssignForm] = useState(false);
  const [videoProgressByAssignment, setVideoProgressByAssignment] = useState<Record<number, number>>({});
  const [videoEndedByAssignment, setVideoEndedByAssignment] = useState<Record<number, boolean>>({});
  const [openedSurveyAssignments, setOpenedSurveyAssignments] = useState<Record<number, boolean>>({});
  const [surveyModalOpen, setSurveyModalOpen] = useState(false);
  const [surveyModalUrl, setSurveyModalUrl] = useState<string>('');
  const surveyCompletedRef = useRef(false);

  // Admin assignment form
  const [assignmentVideoId, setAssignmentVideoId] = useState<number | ''>('');
  const [assignmentDueDate, setAssignmentDueDate] = useState<string>('');
  const [assignmentAssignees, setAssignmentAssignees] = useState<number[]>([]);

  const [surveyTitle, setSurveyTitle] = useState('');
  const [surveyUrl, setSurveyUrl] = useState('');
  const [surveyDueDate, setSurveyDueDate] = useState<string>('');
  const [surveyAssignSurveyId, setSurveyAssignSurveyId] = useState<number | null | ''>('');
  const [surveyAssignDueDate, setSurveyAssignDueDate] = useState<string>('');
  const [surveyAssignees, setSurveyAssignees] = useState<number[]>([]);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    void loadTabData(activeTab);
  }, [activeTab]);

  // Loads only the data needed for the current tab
  const loadTabData = async (tab: TabKey): Promise<void> => {
    try {
      setTabLoading(prev => ({ ...prev, [tab]: true }));
      setError(null);

      const [role, meId] = await Promise.all([
        services.roles.getCurrentUserRole(),
        services.user.getCurrentUserId()
      ]);

      const ownerStatus = services.roles.isCurrentUserOwner();
      const effectiveRole = ownerStatus ? 'Admin' : role;

      setUserRole(effectiveRole);
      setCurrentUserId(meId);

      if (effectiveRole === 'Admin') {
        await services.provisioning
          .ensureTrainingAssets()
          .catch(error => console.warn('Training provisioning failed:', error));
      }

      // Removed unused variable myPrincipalIds
      // Removed unused teamUserIds and teamUserIdSet
      // Removed unused variable myPrincipalIds

      // Only fetch data for the active tab
      if (tab === 'my-training') {
        // Fetch videos, assignments, completions for current user
        const videos = await services.trainingVideos.getAll().catch(() => []);
        setVideos(videos);
        const myAssignments = await services.trainingAssignments.getByPrincipalIds([meId]).catch(() => []);
        setMyAssignments(myAssignments);
        setAllAssignments([]);
        const myCompletions = await services.trainingCompletions.getByUser(meId).catch(() => []);
        setMyCompletions(myCompletions);
        setCompletions([]);
      } else if (tab === 'assignments') {
        // Fetch all assignments and completions for admin/manager
        const videos = await services.trainingVideos.getAll().catch(() => []);
        setVideos(videos);
        let assignments: ITrainingAssignment[] = [];
        if (effectiveRole === 'Admin') {
          assignments = await services.trainingAssignments.getAll().catch(() => []);
        } else if (effectiveRole === 'Manager') {
          assignments = await services.trainingAssignments.getAll().catch(() => []);
        }
        setAllAssignments(assignments);
        setMyAssignments([]);
        const assignmentIds = assignments.map(a => a.Id);
        const completions = assignmentIds.length
          ? await services.trainingCompletions.getByAssignments(assignmentIds)
          : [];
        setCompletions(completions);
        setMyCompletions([]);
        if (effectiveRole === 'Admin') {
          const users = await services.user.getAllAssignableUsers('Admin', []).catch(() => []);
          setAssignableUsers(users);
        }
        // People mapping
        const completionUserIds = Array.from(new Set(completions.map(c => c.UserId))).filter(id => Number.isFinite(id));
        let completionUserMap: Record<number, string> = {};
        if (completionUserIds.length) {
          const completionUserList = await services.user.getUsersByIds(completionUserIds).catch((): Array<{ Id: number; Title: string }> => []);
          completionUserMap = completionUserList.reduce<Record<number, string>>((acc, user) => {
            acc[user.Id] = user.Title;
            return acc;
          }, {});
        }
        setCompletionUsers(completionUserMap);
        const trainingPeople = await resolveAssignmentPeople(assignments, completions, completionUserMap);
        setTrainingPeopleByAssignmentId(trainingPeople);
      } else if (tab === 'surveys') {
        // Fetch surveys, assignments, completions for surveys
        const surveys = await services.surveys.getAll().catch(() => []);
        setSurveys(surveys);
        let assignments: ISurveyAssignment[] = [];
        if (effectiveRole === 'Admin') {
          assignments = await services.surveyAssignments.getAll().catch(() => []);
        } else if (effectiveRole === 'Manager') {
          assignments = await services.surveyAssignments.getAll().catch(() => []);
        } else {
          assignments = await services.surveyAssignments.getByPrincipalIds([meId]).catch(() => []);
        }
        setAllSurveyAssignments(assignments);
        setMySurveyAssignments(assignments);
        const assignmentIds = assignments.map(a => a.Id);
        const completions = assignmentIds.length
          ? await services.surveyCompletions.getByAssignments(assignmentIds)
          : [];
        setSurveyCompletions(completions);
        setMySurveyCompletions([]);
        // People mapping
        const completionUserIds = Array.from(new Set(completions.map(c => c.UserId))).filter(id => Number.isFinite(id));
        let completionUserMap: Record<number, string> = {};
        if (completionUserIds.length) {
          const completionUserList = await services.user.getUsersByIds(completionUserIds).catch((): Array<{ Id: number; Title: string }> => []);
          completionUserMap = completionUserList.reduce<Record<number, string>>((acc, user) => {
            acc[user.Id] = user.Title;
            return acc;
          }, {});
        }
        setCompletionUsers(completionUserMap);
        const surveyPeople = await resolveAssignmentPeople(assignments, completions, completionUserMap);
        setSurveyPeopleByAssignmentId(surveyPeople);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load training data');
    } finally {
      setTabLoading(prev => ({ ...prev, [tab]: false }));
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'No due date';
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isOverdue = (dateString?: string): boolean => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  const absoluteFileUrl = (serverRelativeUrl: string): string => {
    const webUrl = context?.pageContext.web.absoluteUrl || '';
    const webRelativeUrl = context?.pageContext.web.serverRelativeUrl || '';
    const siteUrl = webUrl.substring(0, webUrl.length - webRelativeUrl.length);
    return `${siteUrl}${serverRelativeUrl}`;
  };

  const resolveAssignmentPeople = async <T extends { Id: number; AssignedTo?: Array<{ Id: number; Title: string }>; AssignedUsers?: Array<{ Id: number; Title: string }>; DueDate?: string }>(
    assignments: T[],
    completionItems: Array<{ AssignmentId: number; UserId: number; CompletedOn?: string; ProgressPercent?: number }>,
    userNameMap: Record<number, string>,
    visibleUserIds?: Set<number>
  ): Promise<Record<number, AssignmentPeople>> => {
    if (!assignments.length) return {};

    const principalIds = assignments.reduce<number[]>((acc, assignment) => {
      const assignedUsers = assignment.AssignedUsers || [];
      assignedUsers.forEach((principal: { Id: number }) => {
        const id = Number(principal.Id);
        if (id) acc.push(id);
      });
      (assignment.AssignedTo || []).forEach((principal: { Id: number }) => {
        const id = Number(principal.Id);
        if (id) acc.push(id);
      });
      return acc;
    }, []);
    const uniquePrincipalIds = Array.from(new Set(principalIds));
    const principalTitleById = new Map<number, string>();
    assignments.forEach(assignment => {
      (assignment.AssignedUsers || []).forEach(principal => {
        const id = Number(principal.Id);
        if (id && principal.Title) {
          principalTitleById.set(id, principal.Title);
        }
      });
      (assignment.AssignedTo || []).forEach(principal => {
        const id = Number(principal.Id);
        if (id && principal.Title) {
          principalTitleById.set(id, principal.Title);
        }
      });
    });

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
    const siteGroups = await services.user.getSharePointGroups().catch(
      (): Array<{ Id: number; Title: string }> => []
    );
    const siteGroupIdByTitle = new Map<string, number>(
      siteGroups.map(g => [g.Title.trim().toLowerCase(), g.Id])
    );
    const siteGroupIds = new Set<number>(siteGroups.map(g => g.Id));

    await Promise.all(
      uniquePrincipalIds.map(async (id: number) => {
        const info = principalMap.get(id);
        const titleHint = info?.Title || principalTitleById.get(id) || '';
        let members = await services.membership
          .getPrincipalMembers(id, info?.PrincipalType)
          .catch((): Array<{ Id: number; Title: string }> => []);

        if (!members.length && titleHint) {
          members = await services.membership
            .getSharePointGroupMembersByTitle(titleHint)
            .catch((): Array<{ Id: number; Title: string }> => []);
        }
        if (!members.length && titleHint) {
          const matchedId = siteGroupIdByTitle.get(titleHint.trim().toLowerCase());
          if (matchedId) {
            members = await services.membership
              .getSharePointGroupMembers(matchedId)
              .catch((): Array<{ Id: number; Title: string }> => []);
          }
        }
        if (!members.length && siteGroupIds.has(id)) {
          members = await services.membership
            .getSharePointGroupMembers(id)
            .catch((): Array<{ Id: number; Title: string }> => []);
        }

        let resolvedMembers = members;
        const memberIds = members.map(m => Number(m.Id)).filter(idValue => Boolean(idValue));
        if (memberIds.length) {
          const expandedUserIds = await services.membership
            .expandPrincipalIdsToUserIds(memberIds)
            .catch((): number[] => []);
          if (expandedUserIds.length) {
            const resolvedUsers = await services.user
              .getUsersByIds(expandedUserIds)
              .catch((): Array<{ Id: number; Title: string }> => []);
            if (resolvedUsers.length) {
              resolvedMembers = resolvedUsers.map(user => ({
                Id: user.Id,
                Title: user.Title
              }));
            }
          }
        }

        groupMembersMap.set(id, resolvedMembers);
      })
    );

    const peopleByAssignment: Record<number, AssignmentPeople> = {};
    assignments.forEach(assignment => {
      // Expand group members for AssignedUsers and AssignedTo
      const assignedPrincipals = [
        ...(assignment.AssignedUsers || []),
        ...(assignment.AssignedTo || [])
      ];
      const assignedUserIds: number[] = [];
      const assignedNames: string[] = [];
      assignedPrincipals.forEach(principal => {
        const id = Number(principal.Id);
        if (groupMembersMap.has(id)) {
          groupMembersMap.get(id)?.forEach(member => {
            if (!assignedUserIds.includes(member.Id)) {
              assignedUserIds.push(member.Id);
              assignedNames.push(member.Title);
            }
          });
        } else if (id) {
          if (!assignedUserIds.includes(id)) {
            assignedUserIds.push(id);
            assignedNames.push(principal.Title);
          }
        }
      });

      // Filter by visibleUserIds if provided
      const filteredUserIds = visibleUserIds
        ? assignedUserIds.filter(uid => visibleUserIds.has(uid))
        : assignedUserIds;
      const filteredNames = visibleUserIds
        ? assignedNames.filter((_, idx) => visibleUserIds.has(assignedUserIds[idx]))
        : assignedNames;

      // Completion logic
      const completionsForAssignment = completionItems.filter(
        c => c.AssignmentId === assignment.Id && (c.CompletedOn || (c.ProgressPercent ?? 0) >= 100)
      );
      const completedUserIds = completionsForAssignment.map(c => c.UserId);
      const completedNames = completedUserIds.map(uid => userNameMap[uid] || `User ${uid}`);

      // In-progress logic
      const inProgressCompletions = completionItems.filter(
        c =>
          c.AssignmentId === assignment.Id &&
          !c.CompletedOn &&
          (c.ProgressPercent ?? 0) > 0 &&
          (c.ProgressPercent ?? 0) < 100
      );
      const inProgressUserIds = inProgressCompletions.map(c => c.UserId);
      const inProgressNames = inProgressUserIds.map(uid => userNameMap[uid] || `User ${uid}`);

      // Remaining logic
      const remainingUserIds = filteredUserIds.filter(
        uid => !completedUserIds.includes(uid) && !inProgressUserIds.includes(uid)
      );
      const remainingNames = remainingUserIds.map(uid => userNameMap[uid] || `User ${uid}`);

      const totalAssigned = filteredUserIds.length;
      const completedCount = completedUserIds.filter(uid => filteredUserIds.includes(uid)).length;
      let status: 'completed' | 'overdue' | 'in-progress' = 'in-progress';
      if (totalAssigned > 0 && completedCount >= totalAssigned) {
        status = 'completed';
      } else if (assignment.DueDate && new Date(assignment.DueDate) < new Date()) {
        status = 'overdue';
      }

      peopleByAssignment[assignment.Id] = {
        assignedUserIds: filteredUserIds,
        assignedNames: filteredNames,
        completedNames,
        inProgressUserIds,
        inProgressNames,
        remainingNames,
        totalAssigned,
        completedCount,
        status
      };
    });
    return peopleByAssignment;
  };

  const myCompletionSet = React.useMemo(
    () =>
      new Set(
        myCompletions
          .filter(c => c.CompletedOn || (c.ProgressPercent ?? 0) >= 100)
          .map(c => c.AssignmentId)
      ),
    [myCompletions]
  );

  const myCompletionMap = React.useMemo(() => {
    const map = new Map<number, ITrainingCompletion>();
    myCompletions.forEach(c => map.set(c.AssignmentId, c));
    return map;
  }, [myCompletions]);

  const mySurveyCompletionSet = React.useMemo(
    () => new Set(mySurveyCompletions.map(c => c.AssignmentId)),
    [mySurveyCompletions]
  );

  const assignmentById = React.useMemo(() => {
    const map = new Map<number, ITrainingAssignment>();
    allAssignments.forEach(a => map.set(a.Id, a));
    return map;
  }, [allAssignments]);

  const getVideoForAssignment = (assignment: ITrainingAssignment): ITrainingVideo | undefined =>
    videos.find(v => v.Id === assignment.VideoId);

  const getSurveyForAssignment = (assignment: ISurveyAssignment): ISurvey | undefined =>
    surveys.find(s => s.Id === assignment.SurveyId);

  const getCompletionStats = (assignmentId: number): { completed: number; total: number } => {
    const completed = completions.filter(
      c => c.AssignmentId === assignmentId && (c.CompletedOn || (c.ProgressPercent ?? 0) >= 100)
    ).length;
    const total =
      assignmentById.get(assignmentId)?.AssignedUsers?.length ??
      assignmentById.get(assignmentId)?.AssignedTo?.length ??
      0;
    return { completed, total };
  };

  const getSurveyCompletionStats = (assignmentId: number): { completed: number; total: number } => {
    const completed = surveyCompletions.filter(c => c.AssignmentId === assignmentId).length;
    const total =
      allSurveyAssignments.find(a => a.Id === assignmentId)?.AssignedUsers?.length ??
      allSurveyAssignments.find(a => a.Id === assignmentId)?.AssignedTo?.length ??
      0;
    return { completed, total };
  };

  const getCompletionNames = (assignmentId: number): string[] => {
    return completions
      .filter(c => c.AssignmentId === assignmentId && (c.CompletedOn || (c.ProgressPercent ?? 0) >= 100))
      .map(c => completionUsers[c.UserId] || `User ${c.UserId}`);
  };

  const getSurveyCompletionNames = (assignmentId: number): string[] => {
    return surveyCompletions
      .filter(c => c.AssignmentId === assignmentId)
      .map(c => completionUsers[c.UserId] || `User ${c.UserId}`);
  };

  const trainingCompletionByAssignment = useMemo(() => {
    const map = new Map<number, Array<{ userId: number; completedOn?: string; progress?: number }>>();
    completions.forEach(c => {
      const list = map.get(c.AssignmentId) || [];
      list.push({ userId: c.UserId, completedOn: c.CompletedOn, progress: c.ProgressPercent });
      map.set(c.AssignmentId, list);
    });
    return map;
  }, [completions]);

  const surveyCompletionByAssignment = useMemo(() => {
    const map = new Map<number, Array<{ userId: number; completedOn?: string }>>();
    surveyCompletions.forEach(c => {
      const list = map.get(c.AssignmentId) || [];
      list.push({ userId: c.UserId, completedOn: c.CompletedOn });
      map.set(c.AssignmentId, list);
    });
    return map;
  }, [surveyCompletions]);

  const isAssignmentFullyCompleted = (assignment: ITrainingAssignment): boolean => {
    const people = trainingPeopleByAssignmentId[assignment.Id];
    if (people) {
      return people.totalAssigned > 0 && people.completedCount >= people.totalAssigned;
    }
    const stats = getCompletionStats(assignment.Id);
    return stats.total > 0 && stats.completed >= stats.total;
  };

  const isSurveyAssignmentFullyCompleted = (assignment: ISurveyAssignment): boolean => {
    const people = surveyPeopleByAssignmentId[assignment.Id];
    if (people) {
      return people.totalAssigned > 0 && people.completedCount >= people.totalAssigned;
    }
    const stats = getSurveyCompletionStats(assignment.Id);
    return stats.total > 0 && stats.completed >= stats.total;
  };

  const markTrainingComplete = async (assignmentId: number): Promise<void> => {
    if (!currentUserId) return;
    await services.trainingCompletions.setCompleted(assignmentId, currentUserId);
    await loadData();
  };

  const handleTrainingProgress = async (
    assignmentId: number,
    currentTime: number,
    duration: number
  ): Promise<void> => {
    if (!currentUserId || !duration || !Number.isFinite(duration)) return;
    const percent = Math.min(100, Math.round((currentTime / duration) * 100));
    setVideoProgressByAssignment(prev => ({
      ...prev,
      [assignmentId]: percent
    }));
    window.clearTimeout(progressTimersRef.current[assignmentId]);
    progressTimersRef.current[assignmentId] = window.setTimeout(() => {
      void services.trainingCompletions
        .setProgress(assignmentId, currentUserId, percent, currentTime, duration)
        .catch(() => undefined);
    }, 1200);
  };

  const markSurveyComplete = async (assignmentId: number): Promise<void> => {
    if (!currentUserId) return;
    await services.surveyCompletions.setCompleted(assignmentId, currentUserId);
    await loadData();
  };

  const createAssignment = async (): Promise<void> => {
    if (!assignmentVideoId || assignmentAssignees.length === 0) {
      setError('Select a video and at least one assignee.');
      return;
    }

    const video = videos.find(v => v.Id === Number(assignmentVideoId));
    if (!video) {
      setError('Training video not found.');
      return;
    }

    const expandedAssigneeIds = await services.membership.expandPrincipalIdsToUserIds(
      assignmentAssignees
    );
    const assignedUserIds = expandedAssigneeIds.length ? expandedAssigneeIds : assignmentAssignees;

    const createdAssignment = await services.trainingAssignments.create({
      Title: `Assignment: ${video.FileLeafRef}`,
      VideoId: video.Id,
      VideoUrl: video.FileRef,
      DueDate: assignmentDueDate || undefined,
      AssignedToId: assignmentAssignees,
      AssignedUsersId: assignedUserIds
    });
    const managerIds = expandedAssigneeIds.length
      ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
      : [];

    try {
      if (createdAssignment?.Id) {
        await services.security.secureLibraryItem(
          'TrainingAssignments',
          createdAssignment.Id,
          assignmentAssignees,
          managerIds
        );
      }
      await services.security.secureLibraryItem(
        'Training Videos',
        video.Id,
        assignmentAssignees,
        managerIds
      );
    } catch (e) {
      console.warn('Failed to secure training item:', e);
    }

    setAssignmentVideoId('');
    setAssignmentDueDate('');
    setAssignmentAssignees([]);
    await loadData();
  };

  const startEditAssignment = (assignment: ITrainingAssignment): void => {
    setEditingAssignmentId(assignment.Id);
    setEditDueDate(assignment.DueDate ? assignment.DueDate.slice(0, 10) : '');
    const ids = (assignment.AssignedTo || []).map(a => Number(a.Id)).filter(Boolean);
    setEditAssignees(ids);
  };

  const cancelEditAssignment = (): void => {
    setEditingAssignmentId(null);
    setEditDueDate('');
    setEditAssignees([]);
  };

  const saveEditAssignment = async (assignment: ITrainingAssignment): Promise<void> => {
    const expandedAssigneeIds = editAssignees.length
      ? await services.membership.expandPrincipalIdsToUserIds(editAssignees)
      : [];
    const assignedUserIds = expandedAssigneeIds.length ? expandedAssigneeIds : editAssignees;
    await services.trainingAssignments.update(assignment.Id, {
      DueDate: editDueDate || undefined,
      AssignedToId: editAssignees,
      AssignedUsersId: assignedUserIds
    });
    const managerIds = expandedAssigneeIds.length
      ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
      : [];
    try {
      await services.security.secureLibraryItem(
        'TrainingAssignments',
        assignment.Id,
        editAssignees,
        managerIds
      );
      if (assignment.VideoId) {
        await services.security.secureLibraryItem(
          'Training Videos',
          assignment.VideoId,
          editAssignees,
          managerIds
        );
      }
    } catch (e) {
      console.warn('Failed to update training assignment security:', e);
    }
    setEditingAssignmentId(null);
    setEditDueDate('');
    setEditAssignees([]);
    await loadData();
  };

  const deleteAssignment = async (assignment: ITrainingAssignment): Promise<void> => {
    if (!window.confirm('Delete this training assignment?')) return;
    await services.trainingAssignments.delete(assignment.Id);
    setEditingAssignmentId(null);
    setEditDueDate('');
    setEditAssignees([]);
    await loadData();
  };

  const toggleTrainingAssignment = (assignmentId: number): void => {
    setExpandedTrainingAssignments(prev => {
      const next = new Set(prev);
      if (next.has(assignmentId)) {
        next.delete(assignmentId);
      } else {
        next.add(assignmentId);
      }
      return next;
    });
  };

  const startEditSurveyAssignment = (assignment: ISurveyAssignment): void => {
    setEditingSurveyAssignmentId(assignment.Id);
    setEditSurveyDueDate(assignment.DueDate ? assignment.DueDate.slice(0, 10) : '');
    const ids = (assignment.AssignedTo || []).map(a => Number(a.Id)).filter(Boolean);
    setEditSurveyAssignees(ids);
  };

  const cancelEditSurveyAssignment = (): void => {
    setEditingSurveyAssignmentId(null);
    setEditSurveyDueDate('');
    setEditSurveyAssignees([]);
  };

  const saveEditSurveyAssignment = async (assignment: ISurveyAssignment): Promise<void> => {
    const expandedAssigneeIds = editSurveyAssignees.length
      ? await services.membership.expandPrincipalIdsToUserIds(editSurveyAssignees)
      : [];
    const assignedUserIds = expandedAssigneeIds.length ? expandedAssigneeIds : editSurveyAssignees;
    await services.surveyAssignments.update(assignment.Id, {
      DueDate: editSurveyDueDate || undefined,
      AssignedToId: editSurveyAssignees,
      AssignedUsersId: assignedUserIds
    });
    const managerIds = expandedAssigneeIds.length
      ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
      : [];
    try {
      await services.security.secureLibraryItem(
        'SurveyAssignments',
        assignment.Id,
        editSurveyAssignees,
        managerIds
      );
    } catch (e) {
      console.warn('Failed to update survey assignment security:', e);
    }
    setEditingSurveyAssignmentId(null);
    setEditSurveyDueDate('');
    setEditSurveyAssignees([]);
    await loadData();
  };

  const deleteSurveyAssignment = async (assignment: ISurveyAssignment): Promise<void> => {
    if (!window.confirm('Delete this survey assignment?')) return;
    await services.surveyAssignments.delete(assignment.Id);
    setEditingSurveyAssignmentId(null);
    setEditSurveyDueDate('');
    setEditSurveyAssignees([]);
    await loadData();
  };

  const toggleSurveyAssignment = (assignmentId: number): void => {
    setExpandedSurveyAssignments(prev => {
      const next = new Set(prev);
      if (next.has(assignmentId)) {
        next.delete(assignmentId);
      } else {
        next.add(assignmentId);
      }
      return next;
    });
  };

  const createSurvey = async (): Promise<void> => {
    if (!surveyTitle.trim() || !surveyUrl.trim()) {
      setError('Survey title and URL are required.');
      return;
    }
    await services.surveys.create({
      Title: surveyTitle.trim(),
      Url: surveyUrl.trim(),
      DueDate: surveyDueDate || undefined
    });
    setSurveyTitle('');
    setSurveyUrl('');
    setSurveyDueDate('');
    await loadData();
  };

  const createSurveyAssignment = async (): Promise<void> => {
    if (!surveyAssignSurveyId || surveyAssignees.length === 0) {
      setError('Select a survey and at least one assignee.');
      return;
    }

    const survey = surveys.find(s => s.Id === Number(surveyAssignSurveyId));
    if (!survey) {
      setError('Survey not found.');
      return;
    }

    const expandedAssigneeIds = surveyAssignees.length
      ? await services.membership.expandPrincipalIdsToUserIds(surveyAssignees)
      : [];
    const assignedUserIds = expandedAssigneeIds.length ? expandedAssigneeIds : surveyAssignees;
    const createdAssignment = await services.surveyAssignments.create({
      Title: `Assignment: ${survey.Title}`,
      SurveyId: survey.Id,
      SurveyUrl: survey.Url,
      DueDate: surveyAssignDueDate || undefined,
      AssignedToId: surveyAssignees,
      AssignedUsersId: assignedUserIds
    });
    const managerIds = expandedAssigneeIds.length
      ? await services.membership.getManagerPrincipalIdsForUsers(expandedAssigneeIds)
      : [];
    try {
      if (createdAssignment?.Id) {
        await services.security.secureLibraryItem(
          'SurveyAssignments',
          createdAssignment.Id,
          surveyAssignees,
          managerIds
        );
      }
    } catch (e) {
      console.warn('Failed to secure survey assignment:', e);
    }

    setSurveyAssignSurveyId('');
    setSurveyAssignDueDate('');
    setSurveyAssignees([]);
    await loadData();
  };

  const isAdmin = userRole === 'Admin';

  const filteredMyAssignments = myAssignments.filter(a => {
    const video = getVideoForAssignment(a);
    const name = video?.FileLeafRef || a.Title || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const requiredAssignments = filteredMyAssignments.filter(a => !myCompletionSet.has(a.Id));
  const completedAssignments = filteredMyAssignments.filter(a => myCompletionSet.has(a.Id));

  if (tabLoading[activeTab]) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading {activeTab === 'my-training' ? 'training' : activeTab}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <AlertCircle size={48} />
        <h3>Error Loading Training</h3>
        <p>{error}</p>
        <button onClick={loadData} className={styles.retryBtn}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.training}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Training</h1>
          <p className={styles.subtitle}>
            Assigned training, surveys, and completion tracking
          </p>
        </div>
        {isAdmin && (
          <button className={styles.createBtn} onClick={() => setActiveTab('assignments')}>
            <Plus size={20} />
            New Assignment
          </button>
        )}
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'my-training' ? styles.active : ''}`}
          onClick={() => setActiveTab('my-training')}
        >
          <BookOpen size={20} />
          My Training
        </button>
        {(isAdmin || userRole === 'Manager') && (
          <button
            className={`${styles.tab} ${activeTab === 'assignments' ? styles.active : ''}`}
            onClick={() => setActiveTab('assignments')}
          >
            <Target size={20} />
            Assignments
          </button>
        )}
        <button
          className={`${styles.tab} ${activeTab === 'surveys' ? styles.active : ''}`}
          onClick={() => setActiveTab('surveys')}
        >
          <Target size={20} />
          Surveys
        </button>
      </div>

      {activeTab === 'my-training' && (
        <div className={styles.coursesSection}>
          <div className={styles.toolbar}>
            <div className={styles.searchBar}>
              <Search size={20} />
              <input
                type="text"
                placeholder="Search assigned training..."
                className={styles.searchInput}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button className={styles.filterBtn}>
              <Filter size={20} />
              Filters
            </button>
          </div>

          {requiredAssignments.length === 0 ? (
            <div className={styles.emptyState}>
              <CheckCircle size={48} />
              <h3>No required training</h3>
              <p>You're all caught up.</p>
            </div>
          ) : (
            <div className={styles.coursesGrid}>
              {requiredAssignments.map(assignment => {
                const video = getVideoForAssignment(assignment);
                const title = video?.FileLeafRef || assignment.Title || 'Training';
                const isSelected = selectedAssignmentId === assignment.Id;
                const isEditing = editingAssignmentId === assignment.Id;
                const completionRecord = myCompletionMap.get(assignment.Id);
                const persistedProgress = completionRecord?.ProgressPercent ?? 0;
                const liveProgress = videoProgressByAssignment[assignment.Id] ?? persistedProgress;
                const isCompleted = !!completionRecord?.CompletedOn || liveProgress >= 100;
                const isInProgress = !isCompleted && liveProgress > 0;
                const statusLabel = isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Not Started';
                return (
                  <div key={assignment.Id} className={styles.courseCard}>
                    <div className={styles.courseHeader}>
                      <div className={styles.courseCategory}>Assigned</div>
                      <div
                        className={`${styles.courseStatus} ${
                          isCompleted
                            ? styles.statusCompleted
                            : isInProgress
                            ? styles.statusInProgress
                            : styles.statusNotStarted
                        }`}
                      >
                        {statusLabel}
                      </div>
                      {isOverdue(assignment.DueDate) && (
                        <div className={(styles as any).courseLevel}>Overdue</div>
                      )}
                      {isAdmin && (
                        <div className={styles.adminActions}>
                          <button
                            className={styles.iconBtn}
                            onClick={() => startEditAssignment(assignment)}
                            title="Edit assignment"
                            type="button"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className={`${styles.iconBtn} ${styles.deleteBtn}`}
                            onClick={() => deleteAssignment(assignment)}
                            title="Delete assignment"
                            type="button"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <h3 className={styles.courseTitle}>{title}</h3>
                    <div className={styles.courseStats}>
                      <div className={styles.stat}>
                        <Calendar size={16} />
                        <span>Due: {formatDate(assignment.DueDate)}</span>
                      </div>
                    </div>
                    {isAdmin && isEditing && (
                      <div className={styles.editPanel}>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <label className={styles.label}>
                              <span>Due Date</span>
                              <input
                                className={styles.input}
                                type="date"
                                value={editDueDate}
                                onChange={e => setEditDueDate(e.target.value)}
                              />
                            </label>
                          </div>
                        </div>
                        <div className={styles.formRow}>
                          <div className={styles.formGroup}>
                            <div className={styles.label}>
                              <span>Assigned To</span>
                            </div>
                            <MultiSelectUsers
                              options={assignableUsers}
                              selectedIds={editAssignees}
                              onChange={ids => setEditAssignees(ids)}
                              placeholder="Select users or groups..."
                              batchSize={50}
                            />
                          </div>
                        </div>
                        {/* Only show the text input for quiz/survey URL */}
                    )}
                    <div className={styles.courseFooter}>
                      <div className={styles.instructor}>
                        <Users size={16} />
                        <span>Assigned to you</span>
                      </div>
                      <div className={styles.courseActions}>
                        <button
                          className={styles.continueBtn}
                          onClick={() => setSelectedAssignmentId(assignment.Id)}
                        >
                          <PlayCircle size={16} />
                          Watch
                        </button>
                      </div>
                    </div>
                    {isSelected && video && (
                      <div style={{ marginTop: '12px' }}>
                        <video
                          style={{ width: '100%', borderRadius: '8px' }}
                          controls
                          src={absoluteFileUrl(video.FileRef)}
                          onTimeUpdate={e =>
                            handleTrainingProgress(
                              assignment.Id,
                              e.currentTarget.currentTime,
                              e.currentTarget.duration || 0
                            )
                          }
                          onEnded={() => {
                            setVideoEndedByAssignment(prev => ({
                              ...prev,
                              [assignment.Id]: true
                            }));
                            // Find assigned survey for this user and training
                            // Match survey assignment by assigned user and surveyId (from assignment)
                            const mySurvey = mySurveyAssignments.find(
                              s =>
                                s.AssignedTo?.some(u => u.Id === currentUserId) &&
                                s.SurveyId === assignment.SurveyId
                            );
                            if (mySurvey) {
                              const survey = surveys.find(sv => sv.Id === mySurvey.SurveyId);
                              if (survey?.Url) {
                                setSurveyModalUrl(survey.Url);
                                setSurveyModalOpen(true);
                                surveyCompletedRef.current = false;
                              }
                            }
                          }}
                        />
                        {videoEndedByAssignment[assignment.Id] && (() => {
                          // Find assigned survey for this user and training
                          const mySurvey = mySurveyAssignments.find(
                            s =>
                              s.AssignedTo?.some(u => u.Id === currentUserId) &&
                              s.DueDate === assignment.DueDate
                          );
                          if (mySurvey) {
                            // Only show 'Complete Training' button after survey modal is closed
                            return surveyCompletedRef.current ? (
                              <button
                                className={styles.completedBtn}
                                onClick={async () => {
                                  await markTrainingComplete(assignment.Id);
                                  await markSurveyComplete(mySurvey.Id);
                                }}
                              >
                                <CheckCircle size={16} />
                                Complete Training
                              </button>
                            ) : null;
                          }
                          // If no survey assigned, show complete button as before
                          return (
                            <button
                              className={styles.completedBtn}
                              onClick={() => markTrainingComplete(assignment.Id)}
                            >
                              <CheckCircle size={16} />
                              Mark Completed
                            </button>
                          );
                        })()}
                            {/* Survey Modal Popup */}
                            <SurveyModal
                              url={surveyModalUrl}
                              open={surveyModalOpen}
                              onClose={() => {
                                setSurveyModalOpen(false);
                                surveyCompletedRef.current = true;
                              }}
                            />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {completedAssignments.length > 0 && (
            <div className={styles.assignmentsSection}>
              <h3 style={{ marginTop: '16px' }}>Completed</h3>
              <div className={styles.assignmentsList}>
                {completedAssignments.map(assignment => {
                  const video = getVideoForAssignment(assignment);
                  const completion = myCompletions.find(c => c.AssignmentId === assignment.Id);
                  return (
                    <div key={assignment.Id} className={styles.assignmentCard}>
                      <div className={styles.assignmentHeader}>
                        <h3 className={styles.assignmentTitle}>
                          {video?.FileLeafRef || assignment.Title || 'Training'}
                        </h3>
                        <div className={`${styles.assignmentStatus} ${styles.statusCompleted}`}>
                          Completed
                        </div>
                      </div>
                      <div className={styles.assignmentDetails}>
                        <div className={styles.assignmentInfo}>
                          <div className={styles.infoItem}>
                            <Calendar size={16} />
                            <span>Due: {formatDate(assignment.DueDate)}</span>
                          </div>
                          {completion?.CompletedOn && (
                            <div className={styles.infoItem}>
                              <CheckCircle size={16} />
                              <span>Completed on: {formatDateTime(completion.CompletedOn)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className={styles.assignmentsSection}>
          {isAdmin && (
            <>
              <div className={styles.formToggleRow}>
                <button
                  className={styles.formToggleBtn}
                  type="button"
                  onClick={() => setShowTrainingForm(prev => !prev)}
                >
                  <Plus size={16} />
                  {showTrainingForm ? 'Hide Assignment Form' : 'Create Assignment'}
                </button>
              </div>
              {showTrainingForm && (
                <div className={styles.formCard}>
                  <div className={styles.formHeader}>
                    <h3>Create Training Assignment</h3>
                  </div>
                  <div className={styles.formContent}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Training Video</span>
                          <select
                            className={styles.select}
                            value={assignmentVideoId}
                            onChange={e => {
                              const val = e.target.value;
                              setAssignmentVideoId(val ? Number(val) : '');
                            }}
                          >
                            <option value="">Select a video</option>
                            {videos.map(v => (
                              <option key={v.Id} value={v.Id}>
                                {v.FileLeafRef}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Due Date</span>
                          <input
                            className={styles.input}
                            type="date"
                            value={assignmentDueDate}
                            onChange={e => setAssignmentDueDate(e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <div className={styles.label}>
                          <span>Assigned To</span>
                        </div>
                        <MultiSelectUsers
                          options={assignableUsers}
                          selectedIds={assignmentAssignees}
                          onChange={ids => setAssignmentAssignees(ids)}
                          placeholder="Select users or groups..."
                          batchSize={50}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Quiz/Survey (Paste Microsoft Forms iframe URL)</span>
                          <input
                            className={styles.input}
                            type="text"
                            value={surveyUrl}
                            onChange={e => setSurveyUrl(e.target.value)}
                            placeholder="Paste Microsoft Forms iframe URL here"
                          />
                        </label>
                      </div>
                    </div>
                    <div className={styles.formActions}>
                      <button className={styles.saveBtn} onClick={async () => {
                        await createAssignment();
                        // If a survey is selected, assign it to the same users as the training assignment
                        if (surveyAssignSurveyId) {
                          // Find the selected survey object to get its URL
                          const selectedSurvey = surveys.find(s => s.Id === surveyAssignSurveyId);
                          await services.surveyAssignments.create({
                            SurveyId: surveyAssignSurveyId,
                            SurveyUrl: selectedSurvey?.Url || '',
                            DueDate: surveyAssignDueDate || undefined,
                            AssignedToId: surveyAssignees.length > 0 ? surveyAssignees : assignmentAssignees,
                          });
                          setSurveyAssignSurveyId('');
                          setSurveyAssignDueDate('');
                          setSurveyAssignees([]);
                        }
                      }}>
                        <Plus size={16} />
                        Create Assignment
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className={styles.assignmentsList}>
            {allAssignments.map(assignment => {
              const video = getVideoForAssignment(assignment);
              const people = trainingPeopleByAssignmentId[assignment.Id];
              const totalAssigned =
                people?.totalAssigned ??
                (assignment.AssignedUsers ? assignment.AssignedUsers.length : (assignment.AssignedTo || []).length);
              const completedCount = people?.completedCount ?? getCompletionStats(assignment.Id).completed;
              const completionPercent = totalAssigned
                ? Math.min(100, Math.round((completedCount / totalAssigned) * 100))
                : 0;
              const remainingPercent = Math.max(0, 100 - completionPercent);
              const completionNames = people?.completedNames ?? getCompletionNames(assignment.Id);
              const progressEntries = trainingCompletionByAssignment.get(assignment.Id) || [];
              const completionEntries =
                progressEntries.filter(
                  entry => entry.completedOn || (entry.progress ?? 0) >= 100
                );
              const progressByUserId = new Map(
                progressEntries.map(entry => [entry.userId, entry.progress ?? 0])
              );
              const remainingNames = people?.remainingNames ?? [];
              const inProgressNames = people?.inProgressNames ?? [];
              const assignedNames = people?.assignedNames ?? [];
              const statusLabel =
                people?.status ??
                (isOverdue(assignment.DueDate) ? 'overdue' : 'in-progress');
              const statsTotal = totalAssigned;
              const isLocked = isAssignmentFullyCompleted(assignment);
              const isEditing = editingAssignmentId === assignment.Id;
              const isExpanded = expandedTrainingAssignments.has(assignment.Id);
              return (
                <div key={assignment.Id} className={styles.assignmentCard}>
                  <div className={styles.assignmentHeader}>
                    <h3 className={styles.assignmentTitle}>
                      {video?.FileLeafRef || assignment.Title || 'Training'}
                    </h3>
                    <div className={(styles as any).assignmentStatus}>
                      {statusLabel}
                    </div>
                    {isAdmin && (
                      <div className={styles.adminActions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => !isLocked && startEditAssignment(assignment)}
                          title={isLocked ? 'Completed training cannot be edited' : 'Edit assignment'}
                          type="button"
                          disabled={isLocked}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.deleteBtn}`}
                          onClick={() => !isLocked && deleteAssignment(assignment)}
                          title={isLocked ? 'Completed training cannot be deleted' : 'Delete assignment'}
                          type="button"
                          disabled={isLocked}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.assignmentMetaRow}>
                    <div className={styles.infoItem}>
                      <Users size={16} />
                      <span>
                        {assignedNames.length === 1
                          ? `Assigned to: ${assignedNames[0]}`
                          : `Assigned to: ${statsTotal}`}
                      </span>
                    </div>
                    <div className={styles.infoItem}>
                      <Calendar size={16} />
                      <span>Due: {formatDate(assignment.DueDate)}</span>
                    </div>
                  </div>
                  <div className={styles.progressInline}>
                    <div className={styles.progressInlineContent}>
                      <div className={styles.progressHeader}>
                        <span>
                          Progress: {completedCount} of {statsTotal} completed
                        </span>
                        <span
                          className={
                            completionPercent === 100 ? styles.completeText : styles.remainingText
                          }
                        >
                          {completionPercent === 100
                            ? '100% complete'
                            : `${remainingPercent}% remaining`}
                        </span>
                      </div>
                      <div className={styles.progressBarTrack}>
                        <div
                          className={styles.progressBarFill}
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                    </div>
                    <button
                      className={styles.expandBtn}
                      type="button"
                      onClick={() => toggleTrainingAssignment(assignment.Id)}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {isAdmin && isEditing && (
                    <div className={styles.editPanel}>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            <span>Due Date</span>
                            <input
                              className={styles.input}
                              type="date"
                              value={editDueDate}
                              onChange={e => setEditDueDate(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <div className={styles.label}>
                            <span>Assigned To</span>
                          </div>
                          <MultiSelectUsers
                            options={assignableUsers}
                            selectedIds={editAssignees}
                            onChange={ids => setEditAssignees(ids)}
                            placeholder="Select users or groups..."
                            batchSize={50}
                          />
                        </div>
                      </div>
                      <div className={styles.formActions}>
                        <button
                          className={styles.saveBtn}
                          onClick={() => saveEditAssignment(assignment)}
                          type="button"
                        >
                          <Edit size={16} />
                          Save
                        </button>
                        <button
                          className={styles.cancelBtn}
                          onClick={cancelEditAssignment}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {isExpanded && (
                    <div className={styles.assignmentDetails}>
                    <div className={styles.assignmentInfo}>
                      {completionNames.length > 0 && (
                        <div className={styles.completionNames}>
                          <span>Completed by</span>
                          <div className={styles.nameList}>
                            {(completionEntries.length ? completionEntries : []).map((entry, index) => {
                              const name =
                                completionUsers[entry.userId] ||
                                completionNames[index] ||
                                `User ${entry.userId}`;
                              return (
                                <span
                                  key={`${assignment.Id}-completed-${entry.userId}-${index}`}
                                  className={`${styles.nameBadge} ${styles.statusCompleted}`}
                                  title={
                                    entry.completedOn
                                      ? `Completed on ${formatDateTime(entry.completedOn)}`
                                      : undefined
                                  }
                                >
                                  {name}
                                  {entry.completedOn && (
                                    <span className={styles.completedOn}>
                                      {formatDateTime(entry.completedOn)}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {inProgressNames.length > 0 && (
                        <div className={styles.completionNames}>
                          <span>In Progress</span>
                          <div className={styles.nameList}>
                            {inProgressNames.map((name, index) => (
                              <span
                                key={`${assignment.Id}-inprogress-${index}`}
                                className={`${styles.nameBadge} ${styles.statusInProgress}`}
                              >
                                {name}
                                {(() => {
                                  const userId = people?.inProgressUserIds?.[index] ?? 0;
                                  const progress = progressByUserId.get(userId);
                                  return progress && progress > 0 && progress < 100 ? (
                                    <span className={styles.progressHint}>{progress}%</span>
                                  ) : null;
                                })()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {remainingNames.length > 0 && (
                        <div className={styles.completionNames}>
                          <span>Pending</span>
                          <div className={styles.pendingList}>
                            {remainingNames.map((name, index) => (
                              <div key={`${assignment.Id}-pending-${index}`} className={styles.pendingItem}>
                                <span>{name}</span>
                                <span className={`${styles.pendingStatus} ${styles.statusNotStarted}`}>
                                  Not Started
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'surveys' && (
        <div className={styles.assignmentsSection}>
          {isAdmin && (
            <>
              <div className={styles.formToggleRow}>
                <button
                  className={styles.formToggleBtn}
                  type="button"
                  onClick={() => setShowSurveyCreateForm(prev => !prev)}
                >
                  <Plus size={16} />
                  {showSurveyCreateForm ? 'Hide Create Survey' : 'Add Survey'}
                </button>
                <button
                  className={styles.formToggleBtn}
                  type="button"
                  onClick={() => setShowSurveyAssignForm(prev => !prev)}
                >
                  <Plus size={16} />
                  {showSurveyAssignForm ? 'Hide Assign Survey' : 'Assign Survey'}
                </button>
              </div>

              {showSurveyCreateForm && (
                <div className={styles.formCard}>
                  <div className={styles.formHeader}>
                    <h3>Create Survey</h3>
                  </div>
                  <div className={styles.formContent}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Title</span>
                          <input
                            className={styles.input}
                            type="text"
                            value={surveyTitle}
                            onChange={e => setSurveyTitle(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>URL</span>
                          <input
                            className={styles.input}
                            type="text"
                            value={surveyUrl}
                            onChange={e => setSurveyUrl(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Due Date</span>
                          <input
                            className={styles.input}
                            type="date"
                            value={surveyDueDate}
                            onChange={e => setSurveyDueDate(e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className={styles.formActions}>
                      <button className={styles.saveBtn} onClick={createSurvey}>
                        <Plus size={16} />
                        Add Survey
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showSurveyAssignForm && (
                <div className={styles.formCard}>
                  <div className={styles.formHeader}>
                    <h3>Assign Survey</h3>
                  </div>
                  <div className={styles.formContent}>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Survey</span>
                          <select
                            className={styles.select}
                            value={surveyAssignSurveyId === null ? '' : surveyAssignSurveyId}
                            onChange={e => {
                              const val = e.target.value;
                              setSurveyAssignSurveyId(val ? Number(val) : '');
                            }}
                          >
                            <option value="">Select survey</option>
                            {surveys.map(s => (
                              <option key={s.Id} value={s.Id}>
                                {s.Title}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Due Date</span>
                          <input
                            className={styles.input}
                            type="date"
                            value={surveyAssignDueDate}
                            onChange={e => setSurveyAssignDueDate(e.target.value)}
                          />
                        </label>
                      </div>
                    </div>
                    <div className={styles.formRow}>
                      <div className={styles.formGroup}>
                        <div className={styles.label}>
                          <span>Assigned To</span>
                        </div>
                        <MultiSelectUsers
                          options={assignableUsers}
                          selectedIds={surveyAssignees}
                          onChange={ids => setSurveyAssignees(ids)}
                          placeholder="Select users or groups..."
                          batchSize={50}
                        />
                      </div>
                    </div>
                    <div className={styles.formActions}>
                      <button className={styles.saveBtn} onClick={createSurveyAssignment}>
                        <Plus size={16} />
                        Assign Survey
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div className={styles.assignmentsList}>
            {(isAdmin || userRole === 'Manager' ? allSurveyAssignments : mySurveyAssignments).map(assignment => {
              const survey = getSurveyForAssignment(assignment);
              const stats = getSurveyCompletionStats(assignment.Id);
              const isMyAssignment = mySurveyAssignments.some(a => a.Id === assignment.Id);
              const isCompleted = mySurveyCompletionSet.has(assignment.Id);
              const people = surveyPeopleByAssignmentId[assignment.Id];
              const totalAssigned =
                people?.totalAssigned ??
                (assignment.AssignedUsers ? assignment.AssignedUsers.length : (assignment.AssignedTo || []).length);
              const completedCount = people?.completedCount ?? stats.completed;
              const completionPercent = totalAssigned
                ? Math.min(100, Math.round((completedCount / totalAssigned) * 100))
                : 0;
              const remainingPercent = Math.max(0, 100 - completionPercent);
              const completionNames = people?.completedNames ?? getSurveyCompletionNames(assignment.Id);
              const completionEntries =
                surveyCompletionByAssignment.get(assignment.Id) || [];
              const remainingNames = people?.remainingNames ?? [];
              const assignedNames = people?.assignedNames ?? [];
              const statusLabel =
                people?.status ??
                (isOverdue(assignment.DueDate) ? 'overdue' : 'in-progress');
              const isLocked = isSurveyAssignmentFullyCompleted(assignment);
              const isEditing = editingSurveyAssignmentId === assignment.Id;
              const isExpanded = expandedSurveyAssignments.has(assignment.Id);

              return (
                <div key={assignment.Id} className={styles.assignmentCard}>
                  <div className={styles.assignmentHeader}>
                    <h3 className={styles.assignmentTitle}>{survey?.Title || assignment.Title || 'Survey'}</h3>
                    <div className={(styles as any).assignmentStatus}>
                      {statusLabel}
                    </div>
                    {isAdmin && (
                      <div className={styles.adminActions}>
                        <button
                          className={styles.iconBtn}
                          onClick={() => !isLocked && startEditSurveyAssignment(assignment)}
                          title={isLocked ? 'Completed survey cannot be edited' : 'Edit assignment'}
                          type="button"
                          disabled={isLocked}
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          className={`${styles.iconBtn} ${styles.deleteBtn}`}
                          onClick={() => !isLocked && deleteSurveyAssignment(assignment)}
                          title={isLocked ? 'Completed survey cannot be deleted' : 'Delete assignment'}
                          type="button"
                          disabled={isLocked}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.assignmentMetaRow}>
                    <div className={styles.infoItem}>
                      <Users size={16} />
                      <span>
                        {assignedNames.length === 1
                          ? `Assigned: ${assignedNames[0]}`
                          : `Assigned: ${totalAssigned}`}
                      </span>
                    </div>
                    <div className={styles.infoItem}>
                      <Calendar size={16} />
                      <span>Due: {formatDate(assignment.DueDate)}</span>
                    </div>
                  </div>
                  <div className={styles.progressInline}>
                    <div className={styles.progressInlineContent}>
                      <div className={styles.progressHeader}>
                        <span>
                          Progress: {completedCount} of {totalAssigned} completed
                        </span>
                        <span
                          className={
                            completionPercent === 100 ? styles.completeText : styles.remainingText
                          }
                        >
                          {completionPercent === 100
                            ? '100% complete'
                            : `${remainingPercent}% remaining`}
                        </span>
                      </div>
                      <div className={styles.progressBarTrack}>
                        <div
                          className={styles.progressBarFill}
                          style={{ width: `${completionPercent}%` }}
                        />
                      </div>
                    </div>
                    <button
                      className={styles.expandBtn}
                      type="button"
                      onClick={() => toggleSurveyAssignment(assignment.Id)}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {isAdmin && isEditing && (
                    <div className={styles.editPanel}>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            <span>Due Date</span>
                            <input
                              className={styles.input}
                              type="date"
                              value={editSurveyDueDate}
                              onChange={e => setEditSurveyDueDate(e.target.value)}
                            />
                          </label>
                        </div>
                      </div>
                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <div className={styles.label}>
                            <span>Assigned To</span>
                          </div>
                          <MultiSelectUsers
                            options={assignableUsers}
                            selectedIds={editSurveyAssignees}
                            onChange={ids => setEditSurveyAssignees(ids)}
                            placeholder="Select users or groups..."
                            batchSize={50}
                          />
                        </div>
                      </div>
                      <div className={styles.formActions}>
                        <button
                          className={styles.saveBtn}
                          onClick={() => saveEditSurveyAssignment(assignment)}
                          type="button"
                        >
                          <Edit size={16} />
                          Save
                        </button>
                        <button
                          className={styles.cancelBtn}
                          onClick={cancelEditSurveyAssignment}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                  {isExpanded && (
                    <div className={styles.assignmentDetails}>
                    <div className={styles.assignmentInfo}>
                      {completionNames.length > 0 && (
                        <div className={styles.completionNames}>
                          <span>Completed by</span>
                          <div className={styles.nameList}>
                            {(completionEntries.length ? completionEntries : []).map((entry, index) => {
                              const name =
                                completionUsers[entry.userId] ||
                                completionNames[index] ||
                                `User ${entry.userId}`;
                              return (
                                <span
                                  key={`${assignment.Id}-completed-${entry.userId}-${index}`}
                                  className={`${styles.nameBadge} ${styles.statusCompleted}`}
                                  title={
                                    entry.completedOn
                                      ? `Completed on ${formatDateTime(entry.completedOn)}`
                                      : undefined
                                  }
                                >
                                  {name}
                                  {entry.completedOn && (
                                    <span className={styles.completedOn}>
                                      {formatDateTime(entry.completedOn)}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {remainingNames.length > 0 && (
                        <div className={styles.completionNames}>
                          <span>Pending</span>
                          <div className={styles.pendingList}>
                            {remainingNames.map((name, index) => (
                              <div key={`${assignment.Id}-pending-${index}`} className={styles.pendingItem}>
                                <span>{name}</span>
                                <span className={`${styles.pendingStatus} ${styles.statusNotStarted}`}>
                                  Not Started
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  )}
                  {isMyAssignment && !isCompleted && (
                    <div className={styles.assignmentActions}>
                      {survey?.Url && (
                        <button
                          className={styles.viewBtn}
                          onClick={() => {
                            setOpenedSurveyAssignments(prev => ({
                              ...prev,
                              [assignment.Id]: true
                            }));
                            window.open(survey.Url, '_blank');
                          }}
                        >
                          Open Survey
                        </button>
                      )}
                      {openedSurveyAssignments[assignment.Id] && (
                        <button
                          className={styles.editBtn}
                          onClick={() => markSurveyComplete(assignment.Id)}
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  )}
                  {isMyAssignment && isCompleted && (
                    <div className={styles.assignmentActions}>
                      <button className={styles.completedBtn}>
                        <CheckCircle size={16} />
                        Completed
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Training;
