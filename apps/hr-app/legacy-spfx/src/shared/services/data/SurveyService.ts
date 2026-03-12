import { BaseSharePointService } from '../core/BaseSharePointService';
import { ISurvey } from '../../models';

export class SurveyService extends BaseSharePointService {
  private listTitle = 'Surveys';

  async getAll(top = 200): Promise<ISurvey[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,Url,DueDate,Created` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ISurvey[] }>(url);
    return data.value;
  }

  async create(data: { Title: string; Url: string; DueDate?: string }): Promise<ISurvey> {
    return await this.post<ISurvey>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items`,
      data
    );
  }
}
