import { BaseSharePointService } from '../core/BaseSharePointService';
import { ISurveyCompletion } from '../../models';

type CompletionWrite = Record<string, string | number | undefined>;

export class SurveyCompletionService extends BaseSharePointService {
  private listTitle = 'SurveyCompletions';
  private fieldMap?: {
    assignmentId: string;
    userId: string;
    completedOn: string;
  };

  private async ensureFieldMap(): Promise<void> {
    if (this.fieldMap) return;
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/fields` +
      `?$select=InternalName,Title`;
    const data = await this.get<{ value: Array<{ InternalName: string; Title: string }> }>(url);
    const fields = data.value || [];
    const lookup = (candidates: string[]): string | undefined => {
      const lowerCandidates = candidates.map(c => c.toLowerCase());
      const match = fields.find(f =>
        lowerCandidates.includes(f.InternalName.toLowerCase()) ||
        lowerCandidates.includes(f.Title.toLowerCase())
      );
      return match?.InternalName;
    };

    const assignmentId = lookup(['AssignmentId', 'AssignmentIdId']) || 'AssignmentId';
    const userId = lookup(['UserId', 'UserIdId']) || 'UserId';
    const completedOn = lookup(['CompletedOn']) || 'CompletedOn';

    this.fieldMap = {
      assignmentId,
      userId,
      completedOn
    };
  }

  async getByAssignments(assignmentIds: number[]): Promise<ISurveyCompletion[]> {
    if (!assignmentIds.length) return [];

    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const filter = assignmentIds.map(id => `${fields.assignmentId} eq ${id}`).join(' or ');
    const selectFields = ['Id', fields.assignmentId, fields.userId, fields.completedOn, 'Created'];
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=${encodeURIComponent(selectFields.join(','))}` +
      `&$filter=${encodeURIComponent(filter)}` +
      `&$top=5000`;

    try {
      const data = await this.get<{ value: any[] }>(url);
      return data.value.map(item => ({
        Id: item.Id,
        AssignmentId: item[fields.assignmentId],
        UserId: item[fields.userId],
        CompletedOn: item[fields.completedOn]
      })) as ISurveyCompletion[];
    } catch (error) {
      console.warn('Survey completions list may not exist:', error);
      return [];
    }
  }

  async getByUser(userId: number): Promise<ISurveyCompletion[]> {
    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const selectFields = ['Id', fields.assignmentId, fields.userId, fields.completedOn, 'Created'];
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=${encodeURIComponent(selectFields.join(','))}` +
      `&$filter=${encodeURIComponent(`${fields.userId} eq ${userId}`)}&$top=5000`;

    try {
      const data = await this.get<{ value: any[] }>(url);
      return data.value.map(item => ({
        Id: item.Id,
        AssignmentId: item[fields.assignmentId],
        UserId: item[fields.userId],
        CompletedOn: item[fields.completedOn]
      })) as ISurveyCompletion[];
    } catch (error) {
      console.warn('Survey completions list may not exist:', error);
      return [];
    }
  }

  async setCompleted(assignmentId: number, userId: number): Promise<void> {
    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const existing = await this.get<{ value: ISurveyCompletion[] }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
        `?$select=Id,${encodeURIComponent(fields.assignmentId)},${encodeURIComponent(fields.userId)}` +
        `&$filter=${encodeURIComponent(`(${fields.assignmentId} eq ${assignmentId}) and (${fields.userId} eq ${userId})`)}`
    );

    const payload: CompletionWrite = {
      [fields.assignmentId]: assignmentId,
      [fields.userId]: userId,
      [fields.completedOn]: new Date().toISOString()
    };

    if (existing.value.length > 0) {
      await this.postWithoutResponse(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${existing.value[0].Id})`,
        payload,
        { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
      );
    } else {
      await this.post<ISurveyCompletion>(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
        payload
      );
    }
  }
}
