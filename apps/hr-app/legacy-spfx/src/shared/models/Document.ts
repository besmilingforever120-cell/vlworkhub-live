export interface IDocumentAssignment {
  Id: number;
  Title?: string;
  DocumentName: string;
  DocumentUrl: string;
  DocumentUniqueId?: string;
  DueDate?: string;
  Status?: string;
  CompletedOn?: string;
  UserCopyUrl?: string;
  AssignedTo?: { Id: number; Title: string };
  AssignmentGroupId?: number;
  AssignmentGroupTitle?: string;
  SourceItemId?: number;
}
