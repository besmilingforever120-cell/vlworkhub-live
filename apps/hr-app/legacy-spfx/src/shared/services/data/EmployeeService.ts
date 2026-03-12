import { BaseSharePointService } from '../core/BaseSharePointService';
import { IEmployee } from '../../models';

export class EmployeeService extends BaseSharePointService {
  private listTitle = 'Employees';

  async getAll(top = 500): Promise<IEmployee[]> {
    const select = [
      'Id',
      'JobTitle',
      'Status',
      'StartDate',
      'TerminationDate',
      'Phone',
      'Full_x0020_Name/Title',
      'Manager/Title',
      'Department/Title'
    ].join(',');
    const expand = ['Full_x0020_Name', 'Manager', 'Department'].join(',');

    const url =
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(this.listTitle)}')/items` +
      `?$select=${select}&$expand=${expand}&$orderby=Full_x0020_Name/Title asc&$top=${top}`;

    const data = await this.get<{ value: any[] }>(url);

    return data.value.map(v => ({
      Id: v.Id,
      FullName: v.Full_x0020_Name?.Title ?? '',
      JobTitle: v.JobTitle ?? '',
      Status: v.Status ?? '',
      StartDate: v.StartDate ?? '',
      TerminationDate: v.TerminationDate ?? '',
      Department: v.Department?.Title ?? '',
      LocationTitle: v.location ?? '',
      Phone: v.Phone ?? '',
      Manager: v.Manager?.Title ?? ''
    }));
  }
}