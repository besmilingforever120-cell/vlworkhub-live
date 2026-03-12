export interface ITaskItem {
  Id: number;
  Title: string;
  DueDate?: string;
  Status?: string;
  Priority?: string;
  Description?: string;
  AssignedTo?: { Id: number; Title: string };
  AssignedUsers?: Array<{ Id: number; Title: string }>;
  Created?: string;
  Modified?: string;
}

export interface ITaskUserState {
  Id: number;
  TaskId: number;
  UserId: number;
  UserTitle?: string;
  Status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  CompletedOn?: string;
  Created: string;
  Modified: string;
}

export interface ITaskWithProgress extends ITaskItem {
  userStates: ITaskUserState[];
  myStatus?: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  completionStats: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    blocked: number;
  };
}
