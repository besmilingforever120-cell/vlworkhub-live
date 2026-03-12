export interface ISurvey {
  Id: number;
  Title: string;
  Url: string;
  DueDate?: string;
  Created?: string;
}

export interface ISurveyAssignment {
  Id: number;
  Title?: string;
  SurveyId: number;
  SurveyUrl: string;
  DueDate?: string;
  AssignedTo?: Array<{ Id: number; Title: string }>;
  AssignedUsers?: Array<{ Id: number; Title: string }>;
  Created?: string;
}

export interface ISurveyCompletion {
  Id: number;
  AssignmentId: number;
  UserId: number;
  CompletedOn?: string;
}
