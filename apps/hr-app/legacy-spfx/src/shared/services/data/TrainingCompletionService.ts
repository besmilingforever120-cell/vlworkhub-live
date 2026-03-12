import { BaseSharePointService } from '../core/BaseSharePointService';
import { ITrainingCompletion } from '../../models';

type CompletionWrite = Record<string, string | number | undefined>;

export class TrainingCompletionService extends BaseSharePointService {
  private listTitle = 'TrainingCompletions';
  private fieldMap?: {
    assignmentId: string;
    userId: string;
    completedOn: string;
    progressPercent?: string;
    lastPositionSeconds?: string;
    durationSeconds?: string;
    lastUpdatedOn?: string;
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
    const progressPercent = lookup(['ProgressPercent']);
    const lastPositionSeconds = lookup(['LastPositionSeconds']);
    const durationSeconds = lookup(['DurationSeconds']);
    const lastUpdatedOn = lookup(['LastUpdatedOn']);

    this.fieldMap = {
      assignmentId,
      userId,
      completedOn,
      progressPercent,
      lastPositionSeconds,
      durationSeconds,
      lastUpdatedOn
    };
  }

  async getByAssignments(assignmentIds: number[]): Promise<ITrainingCompletion[]> {
    if (!assignmentIds.length) return [];

    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const filter = assignmentIds.map(id => `${fields.assignmentId} eq ${id}`).join(' or ');
    const selectFields = [
      'Id',
      fields.assignmentId,
      fields.userId,
      fields.completedOn,
      fields.progressPercent,
      fields.lastPositionSeconds,
      fields.durationSeconds,
      fields.lastUpdatedOn,
      'Created'
    ].filter(Boolean);
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
        CompletedOn: item[fields.completedOn],
        ProgressPercent: fields.progressPercent ? item[fields.progressPercent] : undefined,
        LastPositionSeconds: fields.lastPositionSeconds ? item[fields.lastPositionSeconds] : undefined,
        DurationSeconds: fields.durationSeconds ? item[fields.durationSeconds] : undefined,
        LastUpdatedOn: fields.lastUpdatedOn ? item[fields.lastUpdatedOn] : undefined
      })) as ITrainingCompletion[];
    } catch (error) {
      console.warn('Training completions list may not exist:', error);
      return [];
    }
  }

  async getByUser(userId: number): Promise<ITrainingCompletion[]> {
    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const selectFields = [
      'Id',
      fields.assignmentId,
      fields.userId,
      fields.completedOn,
      fields.progressPercent,
      fields.lastPositionSeconds,
      fields.durationSeconds,
      fields.lastUpdatedOn,
      'Created'
    ].filter(Boolean);
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
        CompletedOn: item[fields.completedOn],
        ProgressPercent: fields.progressPercent ? item[fields.progressPercent] : undefined,
        LastPositionSeconds: fields.lastPositionSeconds ? item[fields.lastPositionSeconds] : undefined,
        DurationSeconds: fields.durationSeconds ? item[fields.durationSeconds] : undefined,
        LastUpdatedOn: fields.lastUpdatedOn ? item[fields.lastUpdatedOn] : undefined
      })) as ITrainingCompletion[];
    } catch (error) {
      console.warn('Training completions list may not exist:', error);
      return [];
    }
  }

  async setCompleted(assignmentId: number, userId: number): Promise<void> {
    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    const existing = await this.get<{ value: ITrainingCompletion[] }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
        `?$select=Id,${encodeURIComponent(fields.assignmentId)},${encodeURIComponent(fields.userId)}` +
        `&$filter=${encodeURIComponent(`(${fields.assignmentId} eq ${assignmentId}) and (${fields.userId} eq ${userId})`)}`
    );

    const payload: CompletionWrite = {
      [fields.assignmentId]: assignmentId,
      [fields.userId]: userId,
      [fields.completedOn]: new Date().toISOString(),
      ...(fields.progressPercent ? { [fields.progressPercent]: 100 } : {}),
      ...(fields.lastUpdatedOn ? { [fields.lastUpdatedOn]: new Date().toISOString() } : {})
    };

    if (existing.value.length > 0) {
      await this.postWithoutResponse(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${existing.value[0].Id})`,
        payload,
        { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
      );
    } else {
      await this.post<ITrainingCompletion>(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
        payload
      );
    }
  }

  async setProgress(
    assignmentId: number,
    userId: number,
    progressPercent: number,
    lastPositionSeconds: number,
    durationSeconds: number
  ): Promise<void> {
    await this.ensureFieldMap();
    const fields = this.fieldMap!;
    if (!fields.progressPercent) {
      return;
    }
    const existing = await this.get<{ value: ITrainingCompletion[] }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
        `?$select=Id,${encodeURIComponent(fields.assignmentId)},${encodeURIComponent(fields.userId)}` +
        `&$filter=${encodeURIComponent(`(${fields.assignmentId} eq ${assignmentId}) and (${fields.userId} eq ${userId})`)}`
    );

    const payload: CompletionWrite = {
      [fields.assignmentId]: assignmentId,
      [fields.userId]: userId,
      [fields.progressPercent]: Math.min(100, Math.max(0, Math.round(progressPercent))),
      ...(fields.lastPositionSeconds ? { [fields.lastPositionSeconds]: Math.max(0, Math.round(lastPositionSeconds)) } : {}),
      ...(fields.durationSeconds ? { [fields.durationSeconds]: Math.max(0, Math.round(durationSeconds)) } : {}),
      ...(fields.lastUpdatedOn ? { [fields.lastUpdatedOn]: new Date().toISOString() } : {})
    };

    if (existing.value.length > 0) {
      await this.postWithoutResponse(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items(${existing.value[0].Id})`,
        payload,
        { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' }
      );
    } else {
      await this.post<ITrainingCompletion>(
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
        payload
      );
    }
  }
}
