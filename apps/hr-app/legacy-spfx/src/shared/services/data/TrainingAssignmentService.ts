import { BaseSharePointService } from '../core/BaseSharePointService';
import { ITrainingAssignment } from '../../models';

type TrainingAssignmentWrite = {
  Title?: string;
  VideoId: number;
  VideoUrl: string;
  DueDate?: string;
  AssignedToId?: number[];
  AssignedUsersId?: number[];
  SurveyUrl?: string;
};

export class TrainingAssignmentService extends BaseSharePointService {
  private listTitle = 'TrainingAssignments';

  async getAll(top = 500): Promise<ITrainingAssignment[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,VideoId,VideoUrl,DueDate,AssignedTo/Id,AssignedTo/Title,AssignedUsers/Id,AssignedUsers/Title,Created` +
      `&$expand=AssignedTo,AssignedUsers&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ITrainingAssignment[] }>(url);
    return data.value;
  }

  async getByPrincipalIds(principalIds: number[], top = 500): Promise<ITrainingAssignment[]> {
    if (!principalIds.length) return [];

    const filter = principalIds.map(id => `AssignedToId eq ${id}`).join(' or ');
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,VideoId,VideoUrl,DueDate,AssignedTo/Id,AssignedTo/Title,AssignedUsers/Id,AssignedUsers/Title,Created` +
      `&$expand=AssignedTo,AssignedUsers&$filter=${encodeURIComponent(filter)}` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ITrainingAssignment[] }>(url);
    return data.value;
  }

  async create(data: TrainingAssignmentWrite): Promise<ITrainingAssignment> {
    const payload: TrainingAssignmentWrite = {
      Title: data.Title,
      VideoId: data.VideoId,
      VideoUrl: data.VideoUrl,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      AssignedUsersId: data.AssignedUsersId,
      SurveyUrl: data.SurveyUrl
    };

    return await this.post<ITrainingAssignment>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      payload
    );
  }

  async update(id: number, data: Partial<TrainingAssignmentWrite>): Promise<void> {
    const payload: Partial<TrainingAssignmentWrite> = {
      Title: data.Title,
      VideoId: data.VideoId,
      VideoUrl: data.VideoUrl,
      DueDate: data.DueDate,
      AssignedToId: data.AssignedToId,
      AssignedUsersId: data.AssignedUsersId,
      SurveyUrl: data.SurveyUrl
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
