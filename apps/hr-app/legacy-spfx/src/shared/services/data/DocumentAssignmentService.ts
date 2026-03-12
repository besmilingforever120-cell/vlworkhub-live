import { BaseSharePointService } from '../core/BaseSharePointService';
import { IDocumentAssignment } from '../../models';

type DocumentAssignmentWrite = {
  Title?: string;
  DocumentName: string;
  DocumentUrl: string;
  DocumentUniqueId?: string;
  DueDate?: string;
  AssignedToId: number;
  Status?: string;
  CompletedOn?: string;
  UserCopyUrl?: string;
  AssignmentGroupId?: number;
  AssignmentGroupTitle?: string;
  SourceItemId?: number;
};

export class DocumentAssignmentService extends BaseSharePointService {
  private listTitle = 'DocumentAssignments';

  async getByDocumentUrl(docUrl: string, top = 2000): Promise<IDocumentAssignment[]> {
    const safeUrl = docUrl.replace(/'/g, "''");
    const filter = `DocumentUrl eq '${safeUrl}'`;
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,DocumentName,DocumentUrl,DocumentUniqueId,DueDate,Status,CompletedOn,UserCopyUrl,AssignedTo/Id,AssignedTo/Title,AssignmentGroupId,AssignmentGroupTitle,SourceItemId` +
      `&$expand=AssignedTo&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: IDocumentAssignment[] }>(url);
    return data.value;
  }

  async getByDocumentAndUser(docUrl: string, userId: number): Promise<IDocumentAssignment | null> {
    const safeUrl = docUrl.replace(/'/g, "''");
    const filter = `DocumentUrl eq '${safeUrl}' and AssignedToId eq ${userId}`;
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,DocumentName,DocumentUrl,DocumentUniqueId,DueDate,Status,CompletedOn,UserCopyUrl,AssignedTo/Id,AssignedTo/Title,AssignmentGroupId,AssignmentGroupTitle,SourceItemId` +
      `&$expand=AssignedTo&$filter=${encodeURIComponent(filter)}` +
      `&$top=1`;

    const data = await this.get<{ value: IDocumentAssignment[] }>(url);
    return data.value[0] || null;
  }

  async getByAssignedToIds(assignedToIds: number[], top = 2000): Promise<IDocumentAssignment[]> {
    if (!assignedToIds.length) return [];

    const filter = assignedToIds.map(id => `AssignedToId eq ${id}`).join(' or ');
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,DocumentName,DocumentUrl,DocumentUniqueId,DueDate,Status,CompletedOn,UserCopyUrl,AssignedTo/Id,AssignedTo/Title,AssignmentGroupId,AssignmentGroupTitle,SourceItemId` +
      `&$expand=AssignedTo&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: IDocumentAssignment[] }>(url);
    return data.value;
  }

  async getAll(top = 2000): Promise<IDocumentAssignment[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,DocumentName,DocumentUrl,DocumentUniqueId,DueDate,Status,CompletedOn,UserCopyUrl,AssignedTo/Id,AssignedTo/Title,AssignmentGroupId,AssignmentGroupTitle,SourceItemId` +
      `&$expand=AssignedTo&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: IDocumentAssignment[] }>(url);
    return data.value;
  }

  async create(data: DocumentAssignmentWrite): Promise<IDocumentAssignment> {
    const payload: DocumentAssignmentWrite = {
      Title: data.Title,
      DocumentName: data.DocumentName,
      DocumentUrl: data.DocumentUrl,
      DocumentUniqueId: data.DocumentUniqueId,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      Status: data.Status,
      CompletedOn: data.CompletedOn,
      UserCopyUrl: data.UserCopyUrl,
      AssignmentGroupId: data.AssignmentGroupId,
      AssignmentGroupTitle: data.AssignmentGroupTitle,
      SourceItemId: data.SourceItemId
    };

    return await this.post<IDocumentAssignment>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      payload
    );
  }

  async update(id: number, data: Partial<DocumentAssignmentWrite>): Promise<void> {
    const payload: Partial<DocumentAssignmentWrite> = {
      Title: data.Title,
      DocumentName: data.DocumentName,
      DocumentUrl: data.DocumentUrl,
      DocumentUniqueId: data.DocumentUniqueId,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      Status: data.Status,
      CompletedOn: data.CompletedOn,
      UserCopyUrl: data.UserCopyUrl,
      AssignmentGroupId: data.AssignmentGroupId,
      AssignmentGroupTitle: data.AssignmentGroupTitle,
      SourceItemId: data.SourceItemId
    };

    await this.postWithoutResponse(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${id})`,
      payload,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  }

  async markCompleted(docUrl: string, userId: number, userCopyUrl?: string): Promise<void> {
    const existing = await this.getByDocumentAndUser(docUrl, userId);
    if (!existing) return;

    await this.update(existing.Id, {
      Status: 'Completed',
      CompletedOn: new Date().toISOString(),
      UserCopyUrl: userCopyUrl || existing.UserCopyUrl
    });
  }
}
