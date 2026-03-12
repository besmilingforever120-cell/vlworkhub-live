import { BaseSharePointService } from '../core/BaseSharePointService';
import { ITaskItem } from '../../models';

type TaskWrite = {
  Title: string;
  DueDate?: string;
  Status?: string;
  Priority?: string;
  Description?: string;
  AssignedToId?: number | number[];
  AssignedUsersId?: number[];
};

export class TaskService extends BaseSharePointService {
  private listTitle = 'Tasks';
  
  /**
   * ✅ ENHANCED: Sort by Created date (most recent first) instead of DueDate
   */
  async getAll(top = 200): Promise<ITaskItem[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,DueDate,Status,Priority,Description,Created,Modified,AssignedTo/Id,AssignedTo/Title,AssignedUsers/Id,AssignedUsers/Title` +
      `&$expand=AssignedTo,AssignedUsers&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ITaskItem[] }>(url);
    return data.value;
  }
 
  /**
   * ✅ ENHANCED: Sort by Created date (most recent first)
   */
  async getByPrincipalIds(
    principalIds: number[] = [],
    top = 200,
    personFieldInternalName = 'AssignedTo'
  ): Promise<ITaskItem[]> {
    const filter = principalIds.length
      ? `&$filter=${principalIds.map(id => `${personFieldInternalName}Id eq ${id}`).join(' or ')}`
      : '';

    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items?` +
      `$select=Id,Title,DueDate,Status,Priority,Description,Created,Modified,${personFieldInternalName}/Id,${personFieldInternalName}/Title,AssignedUsers/Id,AssignedUsers/Title` +
      `&$expand=${personFieldInternalName},AssignedUsers${filter}&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ITaskItem[] }>(url);
    return data.value;
  }

  async create(data: TaskWrite): Promise<ITaskItem> {
    const payload: TaskWrite = {
      Title: data.Title,
      DueDate: data.DueDate,
      Status: data.Status ?? 'Not Started',
      Priority: data.Priority ?? 'Normal',
      Description: data.Description,
      AssignedToId: data.AssignedToId,
      AssignedUsersId: data.AssignedUsersId
    };

    return await this.post<ITaskItem>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      payload
    );
  }

  async update(id: number, data: Partial<TaskWrite> & { AssignedTo?: { Id: number } | Array<{ Id: number }> }): Promise<void> {
    const payload: any = {};

    if (data.Title !== undefined) payload.Title = data.Title;
    if (data.DueDate !== undefined) payload.DueDate = data.DueDate;
    if (data.Status !== undefined) payload.Status = data.Status;
    if (data.Priority !== undefined) payload.Priority = data.Priority;
    if (data.Description !== undefined) payload.Description = data.Description;

    if (data.AssignedToId !== undefined) {
      payload.AssignedToId = data.AssignedToId;
    }
    if ((data as any).AssignedUsersId !== undefined) {
      payload.AssignedUsersId = (data as any).AssignedUsersId;
    } else if (data.AssignedTo) {
      const people = Array.isArray(data.AssignedTo) ? data.AssignedTo : [data.AssignedTo];
      payload.AssignedToId = people.map(p => p.Id);
    }

    await this.postWithoutResponse(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${id})`,
      payload,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
    );
  }

  async delete(id: number): Promise<void> {
    await this.postWithoutResponse(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${id})`,
      undefined,
      { 'IF-MATCH': '*', 'X-HTTP-Method': 'DELETE' }
    );
  }
}
