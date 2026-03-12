import { BaseSharePointService } from '../core/BaseSharePointService';

export class ListDiagnosticsService extends BaseSharePointService {
  async getListFields(listTitle: string): Promise<any[]> {
    try {
      const url = `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(
        listTitle
      )}')/fields?$select=Title,InternalName,TypeAsString`;
      const data = await this.get<{ value: any[] }>(url);
      return data.value;
    } catch (error) {
      console.error(`Error getting fields for list ${listTitle}:`, error);
      return [];
    }
  }

  async debugAnnouncementItem(id: number, listTitle = 'Announcements'): Promise<void> {
    try {
      console.log('=== ANNOUNCEMENT DEBUG INFO ===');
      const fields = await this.getListFields(listTitle);
      console.log(
        'Fields:',
        fields.map(f => ({ Title: f.Title, InternalName: f.InternalName, Type: f.TypeAsString }))
      );
      const url = `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(
        listTitle
      )}')/items(${id})`;
      const item = await this.get<any>(url);
      console.log('Item:', item);
      console.log('=== END DEBUG INFO ===');
    } catch (error) {
      console.error('Debug failed:', error);
    }
  }

  async debugTaskItem(id: number, listTitle = 'Tasks'): Promise<void> {
    try {
      console.log('=== TASK DEBUG INFO ===');
      const fields = await this.getListFields(listTitle);
      console.log(
        'Fields:',
        fields.map(f => ({ Title: f.Title, InternalName: f.InternalName, Type: f.TypeAsString }))
      );
      const url = `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(
        listTitle
      )}')/items(${id})`;
      const item = await this.get<any>(url);
      console.log('Item:', item);
      console.log('=== END DEBUG INFO ===');
    } catch (error) {
      console.error('Debug failed:', error);
    }
  }
}