import * as React from 'react';
import { useState, useEffect, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Dashboard.module.scss';
import {
  Users,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Pause,
  RefreshCw,
  PenTool,
  FileSignature,
  Shield,
  PlayCircle
} from 'lucide-react';
import { AppContext } from '../App';
import { SharePointServiceFactory } from '../../../../shared/services';
import FileService, { FileRow } from '../../../../shared/services/documents/FileService';
import {
  IAnnouncement,
  ITaskItem,
  ITaskWithProgress,
  ITrainingVideo,
  ITrainingAssignment,
  ITrainingCompletion,
  ISurvey,
  ISurveyAssignment,
  ISurveyCompletion,
  UserRole
} from '../../../../shared/models';

interface IDashboardProps {
  userDisplayName: string;
}

interface IStat {
  title: string;
  value: string;
  change: string | string[];
  icon: React.ComponentType<any>;
  color: string;
}

interface IActivity {
  type: string;
  name: string;
  action: string;
  time: string;
  priority?: string;
}

interface IUpcomingTask {
  id: number;
  title: string;
  priority: string;
  dueDate: string;
  status?: string;
  assignedTo?: string;
  myStatus?: string;
  pendingNames?: string[];
}

type PendingTrainingStats = {
  pending: ITrainingAssignment[];
  pendingNameMap: Record<number, string[]>;
  inProgressCount: number;
  overdueCount: number;
};

type TaskStatusCounts = {
  pending: number;
  inProgress: number;
  overdue: number;
};

const Dashboard: React.FC<IDashboardProps> = ({ userDisplayName }) => {
  const navigate = useNavigate();
  const context = useContext(AppContext);
  
  const services = useMemo(
    () => SharePointServiceFactory.getInstance(context!),
    [context]
  );

  const fileService = useMemo(
    () => context ? new FileService(context, 'HR Documents', 'Signatures') : null,
    [context]
  );

  const [announcements, setAnnouncements] = useState<IAnnouncement[]>([]);
  const [documentsToSign, setDocumentsToSign] = useState<FileRow[]>([]);
  const [pendingDocumentNamesByUrl, setPendingDocumentNamesByUrl] = useState<
    Record<string, string[]>
  >({});
  const [trainingVideos, setTrainingVideos] = useState<ITrainingVideo[]>([]);
  const [surveyList, setSurveyList] = useState<ISurvey[]>([]);
  const [trainingRequired, setTrainingRequired] = useState<number>(0);
  const [trainingInProgress, setTrainingInProgress] = useState<number>(0);
  const [trainingOverdue, setTrainingOverdue] = useState<number>(0);
  const [pendingTrainings, setPendingTrainings] = useState<ITrainingAssignment[]>([]);
  const [pendingTrainingNamesByAssignment, setPendingTrainingNamesByAssignment] = useState<
    Record<number, string[]>
  >({});
  const [surveyRequired, setSurveyRequired] = useState<number>(0);
  const [surveyOverdue, setSurveyOverdue] = useState<number>(0);
  const [pendingSurveys, setPendingSurveys] = useState<ISurveyAssignment[]>([]);
  const [pendingSurveyNamesByAssignment, setPendingSurveyNamesByAssignment] = useState<
    Record<number, string[]>
  >({});
  const [pendingTaskNamesByTaskId, setPendingTaskNamesByTaskId] = useState<
    Record<number, string[]>
  >({});
  const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
  const [taskStatusCounts, setTaskStatusCounts] = useState<TaskStatusCounts>({
    pending: 0,
    inProgress: 0,
    overdue: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [updatingTask, setUpdatingTask] = useState<number | null>(null);
  const [tasksEx, setTasksEx] = useState<ITaskWithProgress[]>([]);
  const [documentsPage, setDocumentsPage] = useState<number>(1);
  const [tasksPage, setTasksPage] = useState<number>(1);
  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    void loadData();
  }, []);

  const resolveAssignmentUserIds = async <
    T extends {
      Id: number;
      AssignedTo?: Array<{ Id: number; Title?: string }>;
      AssignedUsers?: Array<{ Id: number; Title?: string }>;
    }
  >(
    assignments: T[],
    role: string | null,
    teamUserIdSet?: Set<number>
  ): Promise<Map<number, number[]>> => {
    if (!assignments.length) return new Map();

    const principalIdSet = new Set<number>();
    const principalTitleMap = new Map<number, string>();
    assignments.forEach((assignment: T) => {
      const assignedUsers = assignment.AssignedUsers || [];
      assignedUsers.forEach((principal: { Id: number; Title?: string }) => {
        const id = Number(principal.Id);
        if (id) {
          principalIdSet.add(id);
          if (principal.Title) {
            principalTitleMap.set(id, principal.Title);
          }
        }
      });

      (assignment.AssignedTo || []).forEach((principal: { Id: number; Title?: string }) => {
        const id = Number(principal.Id);
        if (id) {
          principalIdSet.add(id);
          if (principal.Title) {
            principalTitleMap.set(id, principal.Title);
          }
        }
      });
    });
    const principalIds = Array.from(principalIdSet);

    const principals = principalIds.length
      ? await services.user
          .getPrincipalsByIds(principalIds)
          .catch((): Array<{ Id: number; Title: string; PrincipalType: number }> => [])
      : [];
    const principalMap = new Map<number, { Id: number; Title: string; PrincipalType: number }>(
      principals.map(principal => [principal.Id, principal])
    );

    const groupMembersMap = new Map<number, Array<{ Id: number; Title: string }>>();
    const siteGroups = await services.user.getSharePointGroups().catch(
      (): Array<{ Id: number; Title: string }> => []
    );
    const siteGroupIdByTitle = new Map<string, number>(
      siteGroups.map(g => [g.Title.trim().toLowerCase(), g.Id])
    );
    await Promise.all(
      principalIds.map(async (id: number) => {
        const info = principalMap.get(id);
        const titleHint = info?.Title || principalTitleMap.get(id) || '';
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
        groupMembersMap.set(id, members);
      })
    );

    const byAssignment = new Map<number, number[]>();
    assignments.forEach((assignment: T) => {
      const userIds = new Set<number>();

      const expandPrincipal = (principal: { Id: number; Title?: string }) => {
        const principalId = Number(principal.Id);
        if (!principalId) return;

        const info = principalMap.get(principalId);
        const members = groupMembersMap.get(principalId) || [];
        const titleHint = info?.Title || principal.Title || principalTitleMap.get(principalId) || '';
        const isGroup = members.length > 0 || (info ? info.PrincipalType !== 1 : Boolean(titleHint));

        if (isGroup) {
          members.forEach((member: { Id: number }) => userIds.add(member.Id));
        } else {
          userIds.add(principalId);
        }
      };

      const assignedUsers = assignment.AssignedUsers || [];
      assignedUsers.forEach(expandPrincipal);

      (assignment.AssignedTo || []).forEach(expandPrincipal);

      // For managers: only include userIds that are in their team
      if (role === 'Manager' && teamUserIdSet) {
        const filtered = Array.from(userIds).filter(id => teamUserIdSet.has(id));
        byAssignment.set(assignment.Id, filtered);
      } else {
        byAssignment.set(assignment.Id, Array.from(userIds));
      }
    });

    return byAssignment;
  };

  const isTrainingCompletion = (completion: ITrainingCompletion): boolean =>
    Boolean(completion.CompletedOn) || (completion.ProgressPercent ?? 0) >= 100;

  const formatNameList = (names: string[], max = 3): string => {
    if (!names.length) return 'None';
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')} +${names.length - max} more`;
  };

  const loadData = async (): Promise<void> => {
  try {
    setLoading(true);

    const role = await services.roles.getCurrentUserRole();
    setUserRole(role);

    const ownerStatus: boolean = services.roles.isCurrentUserOwner();
    const currentUserId = await services.user.getCurrentUserId();
    const myPrincipalIds = await services.membership.getMyPrincipalIds(currentUserId);
    const teamUserIds = role === 'Manager'
      ? await services.membership.getDepartmentEmployeePrincipalIds(currentUserId)
      : [];
    const teamUserIdSet = new Set<number>([currentUserId, ...teamUserIds]);

    const promises: Promise<any>[] = [];
    promises.push(services.announcements.getActive().catch(() => []));
    let tasksPromise: Promise<ITaskItem[]>;
    if (ownerStatus) {
      tasksPromise = services.tasks.getAll().catch(() => []);
    } else {
      if (role === 'Manager') {
        tasksPromise = services.tasks.getAll().catch(() => []);
      } else {
        tasksPromise = services.membership.getVisiblePrincipalIds(currentUserId)
          .then((ids: number[]) => services.tasks.getByPrincipalIds(ids))
          .catch(() => []);
      }
    }
    promises.push(tasksPromise);

    if (fileService) {
      promises.push(loadDocumentsToSign());
    } else {
      promises.push(Promise.resolve([]));
    }

    promises.push(services.trainingVideos.getAll().catch(() => []));
    promises.push(services.surveys.getAll().catch(() => []));

    const [
      announcementsData,
      tasksData,
      documentsData,
      trainingVideosData,
      surveysData
    ] = await Promise.all(promises);

    setAnnouncements((announcementsData as IAnnouncement[]) || []);
    setDocumentsToSign((documentsData as FileRow[]) || []);
    setTrainingVideos((trainingVideosData as ITrainingVideo[]) || []);
    setSurveyList((surveysData as ISurvey[]) || []);

    const meId = await services.user.getCurrentUserId();
    const enriched = await services.taskUserStates.enrichTasksWithProgress((tasksData as ITaskItem[]) || [], meId);
    setTasksEx(enriched);

    const taskAssignments = enriched.map(task => {
      const assignedUsers = (task as any).AssignedUsers;
      const assignedUsersList = Array.isArray(assignedUsers)
        ? assignedUsers
        : assignedUsers
          ? [assignedUsers]
          : [];
      const assigned = (task as any).AssignedTo;
      const people = Array.isArray(assigned) ? assigned : assigned ? [assigned] : [];
      return { Id: task.Id, AssignedTo: people, AssignedUsers: assignedUsersList };
    });
    const taskAssignedMap = await resolveAssignmentUserIds(taskAssignments, role, teamUserIdSet);
    const taskAssignedIdSet = new Set<number>();
    Array.from(taskAssignedMap.values()).forEach(ids =>
      ids.forEach(id => {
        if (role !== 'Manager' || teamUserIdSet.has(id)) {
          taskAssignedIdSet.add(id);
        }
      })
    );
    const taskAssignedUsers = await services.user
      .getUsersByIds(Array.from(taskAssignedIdSet))
      .catch((): Array<{ Id: number; Title: string }> => []);
    const taskUserNameMap = taskAssignedUsers.reduce<Record<number, string>>((acc, user) => {
      acc[user.Id] = user.Title;
      return acc;
    }, {});

    const taskPendingNameMap: Record<number, string[]> = {};
    const taskPendingIds: number[] = [];
    let pendingCount = 0;
    let inProgressCount = 0;
    let overdueCount = 0;

    enriched.forEach(task => {
      const assignedUserIdsRaw = taskAssignedMap.get(task.Id) || [];
      const assignedUserIds =
        role === 'Manager'
          ? assignedUserIdsRaw.filter(id => teamUserIdSet.has(id))
          : assignedUserIdsRaw;
      if (role === 'Manager' && assignedUserIds.length === 0) {
        return;
      }

      const completedUsers = new Set(
        (task.userStates || [])
          .filter(state => state.Status === 'Completed')
          .filter(state => role !== 'Manager' || teamUserIdSet.has(state.UserId))
          .map(state => state.UserId)
      );
      const inProgressUsers = new Set(
        (task.userStates || [])
          .filter(state => state.Status === 'In Progress')
          .filter(state => role !== 'Manager' || teamUserIdSet.has(state.UserId))
          .map(state => state.UserId)
      );

      if (role === 'Employee') {
        const myStatus = (task.myStatus || 'Not Started').toLowerCase();
        const isCompleted = myStatus === 'completed';
        if (!isCompleted) {
          taskPendingIds.push(task.Id);
          if (myStatus === 'in progress') {
            inProgressCount += 1;
          } else {
            pendingCount += 1;
          }
          if (task.DueDate && getDaysUntilDue(task.DueDate) < 0) {
            overdueCount += 1;
          }
        }
        return;
      }

      const totalAssigned =
        assignedUserIds.length || task.completionStats?.total || 0;
      const isFullyCompleted = totalAssigned > 0
        ? completedUsers.size >= totalAssigned
        : (task.Status || '').toLowerCase() === 'completed';
      const hasProgress = completedUsers.size > 0 || inProgressUsers.size > 0;

      if (!isFullyCompleted) {
        taskPendingIds.push(task.Id);
        if (hasProgress) {
          inProgressCount += 1;
        } else {
          pendingCount += 1;
        }
        if (task.DueDate && getDaysUntilDue(task.DueDate) < 0) {
          overdueCount += 1;
        }

        if (assignedUserIds.length > 0) {
          const remainingIds = assignedUserIds.filter(id => !completedUsers.has(id));
          taskPendingNameMap[task.Id] = remainingIds.map(
            id => taskUserNameMap[id] || `User ${id}`
          );
        }
      }
    });

    setPendingTaskNamesByTaskId(taskPendingNameMap);
    setPendingTaskIds(taskPendingIds);
    setTaskStatusCounts({
      pending: pendingCount,
      inProgress: inProgressCount,
      overdue: overdueCount
    });

    const now = new Date();
    const loadTraining = async () => {
      const buildPendingTraining = async (
        assignments: ITrainingAssignment[],
        completions: ITrainingCompletion[],
        visibleUserIds?: Set<number>
      ): Promise<PendingTrainingStats> => {
        const assignedMap = await resolveAssignmentUserIds(assignments, role, teamUserIdSet);
        const filteredAssignedMap = new Map<number, number[]>();
        const allAssignedIds = new Set<number>();

        assignedMap.forEach((ids, assignmentId) => {
          const filteredIds = visibleUserIds
            ? ids.filter(id => visibleUserIds.has(id))
            : ids;
          filteredAssignedMap.set(assignmentId, filteredIds);
          filteredIds.forEach(id => allAssignedIds.add(id));
        });
        const allAssignedUsers = await services.user
          .getUsersByIds(Array.from(allAssignedIds))
          .catch((): Array<{ Id: number; Title: string }> => []);
        const userNameMap = allAssignedUsers.reduce<Record<number, string>>((acc, user) => {
          acc[user.Id] = user.Title;
          return acc;
        }, {});

        const pendingNameMap: Record<number, string[]> = {};
        const pending = assignments.filter(assignment => {
          const assignedUserIds = filteredAssignedMap.get(assignment.Id) || [];
          if (visibleUserIds && assignedUserIds.length === 0) return false;

          const completionEntries = completions
            .filter(c => c.AssignmentId === assignment.Id)
            .filter(c => !visibleUserIds || visibleUserIds.has(c.UserId));
          const completedUsers = new Set(
            completionEntries.filter(isTrainingCompletion).map(c => c.UserId)
          );
          const isFullyCompleted = assignedUserIds.length
            ? assignedUserIds.every(id => completedUsers.has(id))
            : completedUsers.size >= (assignment.AssignedTo ? assignment.AssignedTo.length : 0);

          if (!isFullyCompleted) {
            const remainingIds = assignedUserIds.length
              ? assignedUserIds.filter(id => !completedUsers.has(id))
              : [];
            pendingNameMap[assignment.Id] = remainingIds.map(
              id => userNameMap[id] || `User ${id}`
            );
          }

          return !isFullyCompleted;
        });

        const inProgressCount = pending.filter(assignment => {
          const entries = completions.filter(c => c.AssignmentId === assignment.Id);
          if (!entries.length) return false;
          return entries.some(
            entry => !isTrainingCompletion(entry) && (entry.ProgressPercent ?? 0) > 0
          );
        }).length;

        const overdueCount = pending.filter(
          assignment => assignment.DueDate && new Date(assignment.DueDate) < now
        ).length;

        return { pending, pendingNameMap, inProgressCount, overdueCount };
      };

      if (role === 'Admin') {
        const assignments = await services.trainingAssignments
          .getAll()
          .catch(() => [] as ITrainingAssignment[]);
        const ids = assignments.map(a => a.Id);
        const allCompletions = await services.trainingCompletions
          .getByAssignments(ids)
          .catch(() => [] as ITrainingCompletion[]);
        const { pending, pendingNameMap, inProgressCount, overdueCount } =
          await buildPendingTraining(assignments, allCompletions);

        setTrainingRequired(pending.length);
        setTrainingInProgress(inProgressCount);
        setTrainingOverdue(overdueCount);
        setPendingTrainings(pending);
        setPendingTrainingNamesByAssignment(pendingNameMap);
        return;
      }

      if (role === 'Manager') {
        const assignments = await services.trainingAssignments
          .getAll()
          .catch(() => [] as ITrainingAssignment[]);
        const ids = assignments.map(a => a.Id);
        const allCompletions = await services.trainingCompletions
          .getByAssignments(ids)
          .catch(() => [] as ITrainingCompletion[]);
        const { pending, pendingNameMap, inProgressCount, overdueCount } =
          await buildPendingTraining(assignments, allCompletions, teamUserIdSet);

        setTrainingRequired(pending.length);
        setTrainingInProgress(inProgressCount);
        setTrainingOverdue(overdueCount);
        setPendingTrainings(pending);
        setPendingTrainingNamesByAssignment(pendingNameMap);
        return;
      }

      const assignments = await services.trainingAssignments
        .getByPrincipalIds(myPrincipalIds)
        .catch(() => [] as ITrainingAssignment[]);
      const myCompletions = await services.trainingCompletions
        .getByUser(currentUserId)
        .catch(() => [] as ITrainingCompletion[]);
      const pending = assignments.filter(assignment => {
        const entries = myCompletions.filter(c => c.AssignmentId === assignment.Id);
        return !entries.some(isTrainingCompletion);
      });
      const inProgressCount = pending.filter(assignment => {
        const entries = myCompletions.filter(c => c.AssignmentId === assignment.Id);
        return entries.some(entry => !isTrainingCompletion(entry) && (entry.ProgressPercent ?? 0) > 0);
      }).length;
      const overdueCount = pending.filter(
        assignment => assignment.DueDate && new Date(assignment.DueDate) < now
      ).length;

      setTrainingRequired(pending.length);
      setTrainingInProgress(inProgressCount);
      setTrainingOverdue(overdueCount);
      setPendingTrainings(pending);
      setPendingTrainingNamesByAssignment({});
    };

    const loadSurveys = async () => {
      if (role === 'Admin') {
        const assignments = await services.surveyAssignments
          .getAll()
          .catch(() => [] as ISurveyAssignment[]);
        const ids = assignments.map(a => a.Id);
        const allCompletions = await services.surveyCompletions
          .getByAssignments(ids)
          .catch(() => [] as ISurveyCompletion[]);
        const assignedMap = await resolveAssignmentUserIds(assignments, role, teamUserIdSet);
        const allAssignedIds = new Set<number>();
        Array.from(assignedMap.values()).forEach(ids => ids.forEach(id => allAssignedIds.add(id)));
        const allAssignedUsers = await services.user
          .getUsersByIds(Array.from(allAssignedIds))
          .catch((): Array<{ Id: number; Title: string }> => []);
        const userNameMap = allAssignedUsers.reduce<Record<number, string>>((acc, user) => {
          acc[user.Id] = user.Title;
          return acc;
        }, {});

        const pendingNameMap: Record<number, string[]> = {};
        const pending = assignments.filter(assignment => {
          const assignedUserIds = assignedMap.get(assignment.Id) || [];
          const completionEntries = allCompletions.filter(c => c.AssignmentId === assignment.Id);
          const completedUsers = new Set(
            completionEntries.filter(c => c.CompletedOn).map(c => c.UserId)
          );
          const isFullyCompleted = assignedUserIds.length
            ? assignedUserIds.every(id => completedUsers.has(id))
            : completedUsers.size >= (assignment.AssignedTo ? assignment.AssignedTo.length : 0);

          if (!isFullyCompleted) {
            const remainingIds = assignedUserIds.length
              ? assignedUserIds.filter(id => !completedUsers.has(id))
              : [];
            pendingNameMap[assignment.Id] = remainingIds.map(
              id => userNameMap[id] || `User ${id}`
            );
          }

          return !isFullyCompleted;
        });

        const overdue = pending.filter(a => a.DueDate && new Date(a.DueDate) < now);
        setSurveyRequired(pending.length);
        setSurveyOverdue(overdue.length);
        setPendingSurveys(pending);
        setPendingSurveyNamesByAssignment(pendingNameMap);
        return;
      }

      if (role === 'Manager') {
        const assignments = await services.surveyAssignments
          .getAll()
          .catch(() => [] as ISurveyAssignment[]);
        const ids = assignments.map(a => a.Id);
        const allCompletions = await services.surveyCompletions
          .getByAssignments(ids)
          .catch(() => [] as ISurveyCompletion[]);
        const assignedMap = await resolveAssignmentUserIds(assignments, role, teamUserIdSet);
        const filteredAssignedMap = new Map<number, number[]>();
        const allAssignedIds = new Set<number>();
        assignedMap.forEach((ids, assignmentId) => {
          const filteredIds = ids.filter(id => teamUserIdSet.has(id));
          filteredAssignedMap.set(assignmentId, filteredIds);
          filteredIds.forEach(id => allAssignedIds.add(id));
        });
        const allAssignedUsers = await services.user
          .getUsersByIds(Array.from(allAssignedIds))
          .catch((): Array<{ Id: number; Title: string }> => []);
        const userNameMap = allAssignedUsers.reduce<Record<number, string>>((acc, user) => {
          acc[user.Id] = user.Title;
          return acc;
        }, {});

        const pendingNameMap: Record<number, string[]> = {};
        const pending = assignments.filter(assignment => {
          const assignedUserIds = filteredAssignedMap.get(assignment.Id) || [];
          if (assignedUserIds.length === 0) return false;
          const completionEntries = allCompletions
            .filter(c => c.AssignmentId === assignment.Id)
            .filter(c => teamUserIdSet.has(c.UserId));
          const completedUsers = new Set(
            completionEntries.filter(c => c.CompletedOn).map(c => c.UserId)
          );
          const isFullyCompleted = assignedUserIds.length
            ? assignedUserIds.every(id => completedUsers.has(id))
            : completedUsers.size >= (assignment.AssignedTo ? assignment.AssignedTo.length : 0);

          if (!isFullyCompleted) {
            const remainingIds = assignedUserIds.length
              ? assignedUserIds.filter(id => !completedUsers.has(id))
              : [];
            pendingNameMap[assignment.Id] = remainingIds.map(
              id => userNameMap[id] || `User ${id}`
            );
          }

          return !isFullyCompleted;
        });

        const overdue = pending.filter(a => a.DueDate && new Date(a.DueDate) < now);
        setSurveyRequired(pending.length);
        setSurveyOverdue(overdue.length);
        setPendingSurveys(pending);
        setPendingSurveyNamesByAssignment(pendingNameMap);
        return;
      }

      const assignments = await services.surveyAssignments
        .getByPrincipalIds(myPrincipalIds)
        .catch(() => [] as ISurveyAssignment[]);
      const myCompletions = await services.surveyCompletions
        .getByUser(currentUserId)
        .catch(() => [] as ISurveyCompletion[]);
      const pending = assignments.filter(assignment => {
        const completionEntries = myCompletions.filter(c => c.AssignmentId === assignment.Id);
        return !completionEntries.some(c => c.CompletedOn);
      });

      const overdue = pending.filter(a => a.DueDate && new Date(a.DueDate) < now);
      setSurveyRequired(pending.length);
      setSurveyOverdue(overdue.length);
      setPendingSurveys(pending);
      setPendingSurveyNamesByAssignment({});
    };

    await Promise.all([loadTraining(), loadSurveys()]);

  } catch (error) {
    console.error('Error loading dashboard data:', error);
    setAnnouncements([]);
    setDocumentsToSign([]);
    setTrainingVideos([]);
    setSurveyList([]);
    setPendingTrainings([]);
    setPendingSurveys([]);
    setPendingTrainingNamesByAssignment({});
    setPendingSurveyNamesByAssignment({});
    setPendingTaskNamesByTaskId({});
    setPendingTaskIds([]);
    setTaskStatusCounts({ pending: 0, inProgress: 0, overdue: 0 });
    setTasksEx([]);
  } finally {
    setLoading(false);
  }
};

  const loadDocumentsToSign = async (): Promise<FileRow[]> => {
    if (!fileService) return [];

    try {
      const currentUserId = await services.user.getCurrentUserId();
      const role = await services.roles.getCurrentUserRole();
      const teamUserIds = role === 'Manager'
        ? await services.membership.getDepartmentEmployeePrincipalIds(currentUserId)
        : [];

      let assignedUserIds: number[] = [];
      if (role === 'Admin') {
        const employees = await fileService.getAllActiveEmployees();
        const ensuredIds = await Promise.all(
          employees.map(emp => services.user.ensureUserId(emp.email))
        );
        assignedUserIds = ensuredIds.filter((id): id is number => Number.isFinite(id as number));
      } else if (role === 'Manager') {
        assignedUserIds = [currentUserId, ...teamUserIds];
      } else {
        assignedUserIds = [currentUserId];
      }

      const assignments = role === 'Admin'
        ? await services.documentAssignments.getAll().catch(() => [])
        : await services.documentAssignments.getByAssignedToIds(assignedUserIds).catch(() => []);

      const pendingAssignments = assignments.filter(a => String(a.Status || '').toLowerCase() !== 'completed');

      const userIds = Array.from(
        new Set(pendingAssignments.map(a => a.AssignedTo?.Id).filter(Boolean) as number[])
      );
      const users = userIds.length
        ? await services.user.getUsersByIds(userIds).catch(() => [])
        : [];
      const userNameMap = users.reduce<Record<number, string>>((acc, user) => {
        acc[user.Id] = user.Title;
        return acc;
      }, {});

      const pendingNameMap: Record<string, string[]> = {};
      pendingAssignments.forEach(assignment => {
        if (!assignment.DocumentUrl || !assignment.AssignedTo?.Id) return;
        const names = pendingNameMap[assignment.DocumentUrl] || [];
        const name = userNameMap[assignment.AssignedTo.Id] || assignment.AssignedTo.Title || `User ${assignment.AssignedTo.Id}`;
        pendingNameMap[assignment.DocumentUrl] = names.includes(name) ? names : [...names, name];
      });

      const docsList = await fileService.resolveDocumentLibrary();
      const allFolderUrl = `${docsList.rootUrl}/Employees/All`;
      const allFiles = await fileService.getFilesInFolder(allFolderUrl).catch(() => [] as FileRow[]);
      const fileMap = new Map(allFiles.map(file => [file.ServerRelativeUrl, file]));

      const pendingDocs: FileRow[] = [];
      const seen = new Set<string>();
      pendingAssignments.forEach(assignment => {
        const doc = assignment.DocumentUrl ? fileMap.get(assignment.DocumentUrl) : undefined;
        if (doc && !seen.has(doc.ServerRelativeUrl)) {
          seen.add(doc.ServerRelativeUrl);
          pendingDocs.push(doc);
        }
      });

      setPendingDocumentNamesByUrl(pendingNameMap);
      return pendingDocs;
    } catch (error) {
      console.error('Error loading documents to sign:', error);
      setPendingDocumentNamesByUrl({});
      return [];
    }
  };

  /**
   * ✅ PROGRESSIVE STATUS UPDATE - same as Tasks component
   * Not Started → In Progress → Completed
   */
  const updateMyTaskStatus = async (taskId: number): Promise<void> => {
    setUpdatingTask(taskId);
    try {
      const currentUserId = await services.user.getCurrentUserId();
      
      // Find the task and get my current status
      const task = tasksEx.find(t => t.Id === taskId);
      const myCurrentStatus = task?.myStatus || 'Not Started';
      
      // Determine next status
      let nextStatus: 'In Progress' | 'Completed';
      if (myCurrentStatus === 'Not Started') {
        nextStatus = 'In Progress';
        console.log(`📝 Starting task ${taskId} (Not Started → In Progress)`);
      } else if (myCurrentStatus === 'In Progress') {
        nextStatus = 'Completed';
        console.log(`✅ Completing task ${taskId} (In Progress → Completed)`);
      } else {
        // Already completed or blocked
        console.log('⚠️ Task is already completed or blocked');
        setUpdatingTask(null);
        return;
      }

      // Update my status in TaskUserState
      await services.taskUserStates.setMyTaskStatus(taskId, nextStatus, currentUserId);

      console.log(`✅ Status updated successfully, reloading...`);
      
      // Small delay before reload
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refresh everything
      await loadData();
      
    } catch (error) {
      console.error('Error updating task status:', error);
      alert('Failed to update task status. Please try again.');
    } finally {
      setUpdatingTask(null);
    }
  };

  const getTimeAgo = (dateString: string | undefined): string => {
    if (!dateString) return 'Unknown';
    try {
      const now = new Date();
      const past = new Date(dateString);
      const diffInHours = Math.floor((now.getTime() - past.getTime()) / (1000 * 60 * 60));

      if (diffInHours < 1) return 'Just now';
      if (diffInHours < 24) return `${diffInHours} hours ago`;
      const days = Math.floor(diffInHours / 24);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } catch {
      return 'Unknown';
    }
  };

  const getDaysUntilDue = (dateString: string | undefined): number => {
    if (!dateString) return 0;
    try {
      const now = new Date();
      const due = new Date(dateString);
      return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return 0;
    }
  };

  const trainingVideoById = useMemo(() => {
    return new Map<number, ITrainingVideo>(
      trainingVideos.map(video => [video.Id, video])
    );
  }, [trainingVideos]);

  const surveyById = useMemo(() => {
    return new Map<number, ISurvey>(
      surveyList.map(survey => [survey.Id, survey])
    );
  }, [surveyList]);

  const getStatusIcon = (status: string | undefined): JSX.Element => {
    const statusLower = status?.toLowerCase() || '';
    switch (statusLower) {
      case 'completed':
        return <CheckCircle size={16} />;
      case 'in progress':
        return <Clock size={16} />;
      case 'blocked':
        return <XCircle size={16} />;
      case 'not started':
        return <Pause size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const getPriorityClass = (priority: string | undefined): string => {
    const priorityLower = priority?.toLowerCase() || '';
    switch (priorityLower) {
      case 'critical':
      case 'highly important':
      case 'high':
        return 'high';
      case 'important':
      case 'medium':
        return 'medium';
      case 'normal':
      case 'low':
      default:
        return 'low';
    }
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
        return <Users size={16} />;
      default:
        return <Users size={16} />;
    }
  };

  const documentsNeedingSignature: number = documentsToSign.length;
  const overdueDocuments: number = documentsToSign.filter((doc: FileRow) => {
    const fields = doc.ListItemAllFields || {};
    const dueDate = fields['DueDate'] || fields['Due_x0020_Date'];
    if (!dueDate) return false;
    return getDaysUntilDue(dueDate) < 0;
  }).length;

  const pendingTasks: number = taskStatusCounts.pending;
  const inProgressTasks: number = taskStatusCounts.inProgress;
  const overdueTasks: number = taskStatusCounts.overdue;
  const stats: IStat[] = [
    {
      title: 'Documents',
      value: documentsNeedingSignature.toString(),
      change: [
        `Pending: ${documentsNeedingSignature}`,
        `Over due: ${overdueDocuments}`
      ],
      icon: FileSignature,
      color: overdueDocuments > 0 ? 'red' : 'blue'
    },
    {
      title: 'Training',
      value: Math.max(0, trainingRequired - trainingInProgress).toString(),
      change: [
        `Not Started: ${Math.max(0, trainingRequired - trainingInProgress)}`,
        `In progress: ${trainingInProgress}`,
        `Over due: ${trainingOverdue}`
      ],
      icon: PlayCircle,
      color: trainingOverdue > 0 ? 'red' : 'purple'
    },
    {
      title: 'Surveys',
      value: surveyRequired.toString(),
      change: [
        `Required: ${surveyRequired}`,
        `Over due: ${surveyOverdue}`
      ],
      icon: CheckCircle,
      color: surveyOverdue > 0 ? 'red' : 'blue'
    },
    {
      title: 'Tasks',
      value: (pendingTasks + inProgressTasks + overdueTasks).toString(),
      change: [
        `Pending: ${pendingTasks}`,
        `In progress: ${inProgressTasks}`,
        `Over due: ${overdueTasks}`
      ],
      icon: CheckCircle,
      color: 'purple'
    }
  ];

  const recentActivities: IActivity[] = announcements
    .slice(0, 4)
    .map((announcement: IAnnouncement) => ({
      type: 'announcement',
      name: announcement.Author?.Title || 'System',
      action: `posted "${announcement.Title}"`,
      time: getTimeAgo(announcement.Created),
      priority: announcement.Priority
    }));

  const isAdminTaskView = userRole === 'Admin' || userRole === 'Manager';
  const upcomingTasks: IUpcomingTask[] = tasksEx
    .filter(t => {
      const itemStatus = (t.Status || '').toLowerCase();
      const itemActive = itemStatus === 'not started' || itemStatus === 'in progress';

      if (isAdminTaskView) {
        return pendingTaskIds.includes(t.Id);
      }

      const myDone = (t.myStatus || '').toLowerCase() === 'completed';
      const myBlocked = (t.myStatus || '').toLowerCase() === 'blocked';
      return itemActive && !myDone && !myBlocked;
    })
    .sort((a, b) => {
      const aDays = getDaysUntilDue(a.DueDate);
      const bDays = getDaysUntilDue(b.DueDate);
      return aDays - bDays;
    })
    .map((task) => {
      const assignedNames = Array.isArray(task.AssignedTo)
        ? task.AssignedTo.map(p => p.Title).join(', ')
        : (task as any).AssignedTo?.Title;
      const pendingNames = isAdminTaskView
        ? (pendingTaskNamesByTaskId[task.Id] || [])
        : [];

      return {
        id: task.Id,
        title: task.Title,
        priority: getPriorityClass(task.Priority),
        dueDate: task.DueDate
          ? getDaysUntilDue(task.DueDate) === 0
            ? 'Today'
            : getDaysUntilDue(task.DueDate) < 0
              ? 'Overdue'
              : new Date(task.DueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : 'No date',
        status: task.Status,
        assignedTo: assignedNames,
        myStatus: task.myStatus,
        pendingNames
      };
    });

  // Pagination calculations
  const totalDocuments = documentsToSign.length;
  const totalDocumentPages = Math.ceil(totalDocuments / ITEMS_PER_PAGE);
  const documentStartIndex = (documentsPage - 1) * ITEMS_PER_PAGE;
  const documentEndIndex = documentStartIndex + ITEMS_PER_PAGE;
  const paginatedDocuments = documentsToSign.slice(documentStartIndex, documentEndIndex);

  const totalTasks = upcomingTasks.length;
  const totalTaskPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);
  const taskStartIndex = (tasksPage - 1) * ITEMS_PER_PAGE;
  const taskEndIndex = taskStartIndex + ITEMS_PER_PAGE;
  const paginatedTasks = upcomingTasks.slice(taskStartIndex, taskEndIndex);
  const pendingTrainingCount = pendingTrainings.length;
  const pendingSurveyCount = pendingSurveys.length;

  const getStatCardColor = (color: string): string => {
    switch (color) {
      case 'blue':
        return `${styles.statCard} ${styles.blue}`;
      case 'green':
        return `${styles.statCard} ${styles.green}`;
      case 'purple':
        return `${styles.statCard} ${styles.purple}`;
      case 'amber':
        return `${styles.statCard} ${styles.amber}`;
      case 'red':
        return `${styles.statCard} ${styles.red}`;
      default:
        return styles.statCard;
    }
  };

  if (loading) {
    return (
      <div className={styles.dashboard}>
        <div className={styles.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <div>
              <h1 className={styles.title}>Loading Dashboard...</h1>
              <p className={styles.subtitle}>Please wait while we fetch your data.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome back, {userDisplayName}</h1>
          <p className={styles.subtitle}>{"Here's what needs your attention today."}</p>
          <div className={styles.roleIndicator}>
            {getRoleIcon(userRole)}
            <span>Role: {getRoleDisplay(userRole)}</span>
          </div>
        </div>
        <div>
          <button className={styles.actionBtn} onClick={loadData}>
            <RefreshCw size={20} />
            Refresh
          </button>
        </div>
      </div>

      <div className={styles.statsGrid}>
        {/* Make stat cards clickable to navigate to their respective pages */}
        {stats.map((stat: IStat, index: number) => {
          let navPath = '';
          switch (stat.title.toLowerCase()) {
            case 'documents': navPath = '/documents'; break;
            case 'tasks': navPath = '/tasks'; break;
            case 'training': navPath = '/training'; break;
            case 'surveys': navPath = '/surveys'; break;
            default: navPath = '';
          }
          return (
            <div
              key={index}
              className={getStatCardColor(stat.color)}
              style={navPath ? { cursor: 'pointer' } : {}}
              onClick={navPath ? () => navigate(navPath) : undefined}
            >
              <div className={styles.statIcon}>
                <stat.icon size={24} />
              </div>
              <div className={styles.statContent}>
                <h3 className={styles.statValue}>{stat.value}</h3>
                <p className={styles.statTitle}>{stat.title}</p>
                {Array.isArray(stat.change) ? (
                  <div className={styles.statChangeList}>
                    {stat.change.map((line, lineIndex) => (
                      <div key={lineIndex} className={styles.statChangeLine}>
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className={styles.statChange}>{stat.change}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.contentGrid}>
        {/* Documents Requiring Signature Card */}
        <div className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Documents Requiring Signature</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PenTool size={16} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {documentsToSign.length} pending
              </span>
            </div>
          </div>
          <div className={styles.activityList}>
            {paginatedDocuments.length > 0 ? (
              paginatedDocuments.map((doc: FileRow, index: number) => {
                const fields = doc.ListItemAllFields || {};
                const dueDate = fields['DueDate'] || fields['Due_x0020_Date'];
                const isOverdue = dueDate && getDaysUntilDue(dueDate) < 0;
                const pendingNames = pendingDocumentNamesByUrl[doc.ServerRelativeUrl] || [];
                return (
                  <div
                    key={doc.UniqueId || index}
                    className={styles.activityItem}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/documents`, { state: { selectedId: doc.UniqueId } })}
                  >
                    <div className={`${styles.activityIcon} ${styles.task}`}>
                      <FileSignature size={16} />
                    </div>
                    <div className={styles.activityContent}>
                      <p>
                        <strong>{doc.Name}</strong>
                        {isOverdue && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '700',
                              textTransform: 'uppercase'
                            }}
                          >
                            OVERDUE
                          </span>
                        )}
                      </p>
                      <span className={styles.activityTime}>
                        {dueDate
                          ? `Due: ${new Date(dueDate).toLocaleDateString()}`
                          : 'No due date'}
                      </span>
                      {pendingNames.length > 0 && (
                        <div className={styles.taskPendingNames}>
                          Pending: {formatNameList(pendingNames)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>All documents are signed</p>
              </div>
            )}
          </div>
          {totalDocuments > ITEMS_PER_PAGE && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={() => setDocumentsPage(p => Math.max(1, p - 1))}
                disabled={documentsPage === 1}
              >
                Previous
              </button>
              <span className={styles.paginationInfo}>
                Page {documentsPage} of {totalDocumentPages}
              </span>
              <button
                className={styles.paginationBtn}
                onClick={() => setDocumentsPage(p => Math.min(totalDocumentPages, p + 1))}
                disabled={documentsPage === totalDocumentPages}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Tasks Card - Updated with Progressive Status */}
        <div className={styles.tasksCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Your Tasks</h2>
            {userRole === 'Admin' && (
              <button className={styles.addBtn} onClick={() => navigate('/tasks')}>
                + Add Task
              </button>
            )}
          </div>
          <div className={styles.tasksList}>
            {paginatedTasks.length > 0 ? (
              paginatedTasks.map((task: IUpcomingTask, index: number) => {
                // ✅ Determine button text based on current status
                const myStatus = task.myStatus || 'Not Started';
                let buttonText = '';
                if (myStatus === 'Not Started') {
                  buttonText = 'Start Task';
                } else if (myStatus === 'In Progress') {
                  buttonText = 'Mark Complete';
                }
                return (
                  <div
                    key={index}
                    className={styles.taskItem}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/tasks`, { state: { selectedId: task.id } })}
                  >
                    <div className={styles.taskContent}>
                      <h4 className={styles.taskTitle}>{task.title}</h4>
                      <div className={styles.taskMeta}>
                        <span className={`${styles.priority} ${(styles as any)[task.priority]}`}>
                          {task.priority}
                        </span>
                        <span className={styles.dueDate}>Due: {task.dueDate}</span>
                      </div>
                      {task.assignedTo && (
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                          Assigned to: {task.assignedTo}
                        </div>
                      )}
                      {task.pendingNames && task.pendingNames.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                          Pending: {formatNameList(task.pendingNames)}
                        </div>
                      )}
                      {/* ✅ Show my current status */}
                      <div style={{ 
                        fontSize: '11px', 
                        color: myStatus === 'In Progress' ? '#3b82f6' : '#6b7280',
                        marginTop: '4px',
                        fontWeight: myStatus === 'In Progress' ? '600' : '400'
                      }}>
                        My Status: {myStatus}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {getStatusIcon(myStatus)}
                      {/* ✅ Progressive button - only show if not completed/blocked */}
                      {myStatus !== 'Completed' && myStatus !== 'Blocked' && (
                        <button
                          className={styles.taskAction}
                          onClick={e => { e.stopPropagation(); updateMyTaskStatus(task.id); }}
                          disabled={updatingTask === task.id}
                        >
                          {updatingTask === task.id ? 'Updating...' : buttonText}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>No pending tasks</p>
              </div>
            )}
          </div>
          {totalTasks > ITEMS_PER_PAGE && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={() => setTasksPage(p => Math.max(1, p - 1))}
                disabled={tasksPage === 1}
              >
                Previous
              </button>
              <span className={styles.paginationInfo}>
                Page {tasksPage} of {totalTaskPages}
              </span>
              <button
                className={styles.paginationBtn}
                onClick={() => setTasksPage(p => Math.min(totalTaskPages, p + 1))}
                disabled={tasksPage === totalTaskPages}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* Pending Training Card */}
        <div className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Pending Training</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PlayCircle size={16} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {pendingTrainingCount} pending
              </span>
            </div>
          </div>
          <div className={styles.activityList}>
            {pendingTrainings.length > 0 ? (
              pendingTrainings.slice(0, ITEMS_PER_PAGE).map((assignment, index) => {
                const video = trainingVideoById.get(assignment.VideoId);
                const title = video?.FileLeafRef || assignment.Title || 'Training';
                const dueDate = assignment.DueDate;
                const isOverdue = dueDate && getDaysUntilDue(dueDate) < 0;
                const pendingNames = pendingTrainingNamesByAssignment[assignment.Id] || [];
                return (
                  <div
                    key={assignment.Id || index}
                    className={styles.activityItem}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/training`, { state: { selectedId: assignment.Id } })}
                  >
                    <div className={`${styles.activityIcon} ${styles.training}`}>
                      <PlayCircle size={16} />
                    </div>
                    <div className={styles.activityContent}>
                      <p>
                        <strong>{title}</strong>
                        {isOverdue && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '700',
                              textTransform: 'uppercase'
                            }}
                          >
                            OVERDUE
                          </span>
                        )}
                      </p>
                      <span className={styles.activityTime}>
                        {dueDate
                          ? `Due: ${new Date(dueDate).toLocaleDateString()}`
                          : 'No due date'}
                      </span>
                      {pendingNames.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                          Pending: {formatNameList(pendingNames)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>No pending training</p>
              </div>
            )}
          </div>
        </div>

        {/* Pending Surveys Card */}
        <div className={styles.activityCard}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Pending Surveys</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} style={{ color: '#6b7280' }} />
              <span style={{ fontSize: '14px', color: '#6b7280' }}>
                {pendingSurveyCount} pending
              </span>
            </div>
          </div>
          <div className={styles.activityList}>
            {pendingSurveys.length > 0 ? (
              pendingSurveys.slice(0, ITEMS_PER_PAGE).map((assignment, index) => {
                const survey = surveyById.get(assignment.SurveyId);
                const title = survey?.Title || assignment.Title || 'Survey';
                const dueDate = assignment.DueDate;
                const isOverdue = dueDate && getDaysUntilDue(dueDate) < 0;
                const pendingNames = pendingSurveyNamesByAssignment[assignment.Id] || [];
                return (
                  <div
                    key={assignment.Id || index}
                    className={styles.activityItem}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/training`, { state: { tab: 'surveys', selectedId: assignment.Id } })}
                  >
                    <div className={`${styles.activityIcon} ${styles.task}`}>
                      <CheckCircle size={16} />
                    </div>
                    <div className={styles.activityContent}>
                      <p>
                        <strong>{title}</strong>
                        {isOverdue && (
                          <span
                            style={{
                              marginLeft: '8px',
                              fontSize: '10px',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '700',
                              textTransform: 'uppercase'
                            }}
                          >
                            OVERDUE
                          </span>
                        )}
                      </p>
                      <span className={styles.activityTime}>
                        {dueDate
                          ? `Due: ${new Date(dueDate).toLocaleDateString()}`
                          : 'No due date'}
                      </span>
                      {pendingNames.length > 0 && (
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                          Pending: {formatNameList(pendingNames)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '24px', color: '#6b7280' }}>
                <CheckCircle size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p>No pending surveys</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Latest Announcements */}
      {announcements.length > 0 && (
        <div
          style={{
            background: 'white',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            border: '1px solid #f3f4f6'
          }}
        >
          <h2 className={styles.sectionTitle}>Latest Announcements</h2>
          <div className={styles.activityList}>
            {recentActivities.map((activity: IActivity, index: number) => (
              <div key={index} className={styles.activityItem}>
                <div className={`${styles.activityIcon} ${styles.announcement}`}>
                  <AlertCircle size={16} />
                </div>
                <div className={styles.activityContent}>
                  <p>
                    <strong>{activity.name}</strong> {activity.action}
                    {activity.priority && activity.priority !== 'Normal' && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '10px',
                          backgroundColor:
                            activity.priority === 'Highly Important' ? '#fef2f2' : '#fefbf2',
                          color:
                            activity.priority === 'Highly Important' ? '#dc2626' : '#d97706',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '700',
                          textTransform: 'uppercase'
                        }}
                      >
                        {activity.priority}
                      </span>
                    )}
                    </p>
                  <span className={styles.activityTime}>{activity.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
