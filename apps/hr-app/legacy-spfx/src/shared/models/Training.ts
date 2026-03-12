export interface ITrainingVideo {
  Id: number;
  Title?: string;
  FileRef: string;
  FileLeafRef: string;
  UniqueId?: string;
  Created?: string;
  Modified?: string;
}

export interface ITrainingAssignment {
  Id: number;
  Title?: string;
  VideoId: number;
  VideoUrl: string;
  DueDate?: string;
  AssignedTo?: Array<{ Id: number; Title: string }>;
  AssignedUsers?: Array<{ Id: number; Title: string }>;
  SurveyUrl?: string;
  Created?: string;
}

export interface ITrainingCompletion {
  Id: number;
  AssignmentId: number;
  UserId: number;
  CompletedOn?: string;
  ProgressPercent?: number;
  LastPositionSeconds?: number;
  DurationSeconds?: number;
  LastUpdatedOn?: string;
}
