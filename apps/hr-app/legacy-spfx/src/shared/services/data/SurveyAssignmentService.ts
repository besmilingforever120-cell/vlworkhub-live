import { BaseSharePointService } from '../core/BaseSharePointService';
import { ISurveyAssignment } from '../../models';

type SurveyAssignmentWrite = {
  Title?: string;
  SurveyId: number;
  SurveyUrl: string;
  DueDate?: string;
  AssignedToId?: number[];
  AssignedUsersId?: number[];
};

export class SurveyAssignmentService extends BaseSharePointService {
  private listTitle = 'SurveyAssignments';

  async getAll(top = 500): Promise<ISurveyAssignment[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,SurveyId,SurveyUrl,DueDate,AssignedTo/Id,AssignedTo/Title,AssignedUsers/Id,AssignedUsers/Title,Created` +
      `&$expand=AssignedTo,AssignedUsers&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ISurveyAssignment[] }>(url);
    return data.value;
  }

  async getByPrincipalIds(principalIds: number[], top = 500): Promise<ISurveyAssignment[]> {
    if (!principalIds.length) return [];

    const filter = principalIds.map(id => `AssignedToId eq ${id}`).join(' or ');
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,SurveyId,SurveyUrl,DueDate,AssignedTo/Id,AssignedTo/Title,AssignedUsers/Id,AssignedUsers/Title,Created` +
      `&$expand=AssignedTo,AssignedUsers&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ISurveyAssignment[] }>(url);
    return data.value;
  }

  async create(data: SurveyAssignmentWrite): Promise<ISurveyAssignment> {
    const payload: SurveyAssignmentWrite = {
      Title: data.Title,
      SurveyId: data.SurveyId,
      SurveyUrl: data.SurveyUrl,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      AssignedUsersId: data.AssignedUsersId
    };

    return await this.post<ISurveyAssignment>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      payload
    );
  }

  async update(id: number, data: Partial<SurveyAssignmentWrite>): Promise<void> {
    const payload: Partial<SurveyAssignmentWrite> = {
      Title: data.Title,
      SurveyId: data.SurveyId,
      SurveyUrl: data.SurveyUrl,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      AssignedUsersId: data.AssignedUsersId
    };

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
