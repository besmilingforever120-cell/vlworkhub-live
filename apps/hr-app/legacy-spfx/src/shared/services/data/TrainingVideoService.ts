import { BaseSharePointService } from '../core/BaseSharePointService';
import { ITrainingVideo } from '../../models';

export class TrainingVideoService extends BaseSharePointService {
  private listTitle = 'Training Videos';

  async getAll(top = 200): Promise<ITrainingVideo[]> {
    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=Id,Title,FileRef,FileLeafRef,UniqueId,Created,Modified` +
      `&$orderby=Created desc&$top=${top}`;

    const data = await this.get<{ value: ITrainingVideo[] }>(url);
    return data.value;
  }
}
