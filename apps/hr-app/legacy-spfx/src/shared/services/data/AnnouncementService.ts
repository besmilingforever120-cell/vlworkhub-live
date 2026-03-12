import { BaseSharePointService } from '../core/BaseSharePointService';
import { IAnnouncement, IAnnouncementUpdate } from '../../models';

export class AnnouncementService extends BaseSharePointService {
  private listTitle = 'Announcements';

  async getAll(top = 5): Promise<IAnnouncement[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,Body,Created,Author/Title,StartDate,EndDate,Priority` +
      `&$expand=Author&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: IAnnouncement[] }>(url);
    return data.value;
  }

  async getActive(top = 20): Promise<IAnnouncement[]> {
    const now = new Date().toISOString();
    const filter = `(StartDate le datetime'${now}') and ((EndDate ge datetime'${now}') or (EndDate eq null))`;

    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,Body,Created,Author/Title,StartDate,EndDate,Priority` +
      `&$expand=Author&$filter=${encodeURIComponent(filter)}&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: IAnnouncement[] }>(url);
    return this.sortByPriority(data.value);
  }

  async create(data: IAnnouncementUpdate): Promise<IAnnouncement> {
    const payload = {
      Title: data.Title,
      Body: data.Body ?? '',
      StartDate: data.StartDate ?? null,
      EndDate: data.EndDate ?? null,
      Priority: data.Priority ?? 'Normal'
    };

    return await this.post<IAnnouncement>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      payload
    );
  }

  async update(id: number, data: Partial<IAnnouncementUpdate>): Promise<void> {
    const payload: any = {};
    if (data.Title !== undefined) payload.Title = data.Title;
    if (data.Body !== undefined) payload.Body = data.Body;
    if (data.StartDate !== undefined) payload.StartDate = data.StartDate;
    if (data.EndDate !== undefined) payload.EndDate = data.EndDate;
    if (data.Priority !== undefined) payload.Priority = data.Priority;

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

  private sortByPriority(announcements: IAnnouncement[]): IAnnouncement[] {
    const weight = (p?: string) =>
      p === 'Highly Important' ? 3 : p === 'Important' ? 2 : 1;

    return announcements.sort((a, b) => {
      const byPri = weight(b.Priority) - weight(a.Priority);
      return byPri || new Date(b.Created).getTime() - new Date(a.Created).getTime();
    });
  }
}