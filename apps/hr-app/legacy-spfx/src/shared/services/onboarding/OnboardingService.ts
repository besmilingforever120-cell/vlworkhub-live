import { BaseSharePointService } from '../core/BaseSharePointService';

export class OnboardingService extends BaseSharePointService {
  async uploadFile(file: File, fileName: string): Promise<string> {
    const folder = this.sp.web.getFolderByServerRelativePath('/sites/hr/OnboardingDocuments');
    const result = await folder.files.addUsingPath(fileName, file, { Overwrite: true });
    return result.ServerRelativeUrl;
  }

  async addDocument(data: {
    Title: string;
    EmployeeEmail: string;
    DocumentType: string;
    FileUrl: string;
    Status?: string;
  }) {
    return await this.sp.web.lists
      .getByTitle('OnboardingDocuments')
      .items.add({ ...data, Status: data.Status ?? 'Submitted' });
  }

  async upsertStatus(
    email: string,
    data: {
      CompletionDate?: string;
      SectionsCompleted?: any;
      Status: string;
      CurrentStep: string;
    }
  ) {
    const list = this.sp.web.lists.getByTitle('OnboardingStatus');
    const existing = await list.items.filter(`Email eq '${email}'`)();

    const payload = {
      Email: email,
      CompletionDate: data.CompletionDate ?? null,
      SectionsCompleted: JSON.stringify(data.SectionsCompleted ?? []),
      Status: data.Status,
      CurrentStep: data.CurrentStep
    };

    if (existing.length > 0) {
      await list.items.getById(existing[0].Id).update(payload);
    } else {
      await list.items.add(payload);
    }
  }

  async addSectionProgress(data: {
    Title: string;
    EmployeeEmail: string;
    SectionIndex: number;
    CompletedDate: string;
    IsCompleted: boolean;
  }) {
    return await this.sp.web.lists.getByTitle('OnboardingSectionProgress').items.add(data);
  }

  async getSectionProgress(email: string) {
    return await this.sp.web.lists
      .getByTitle('OnboardingSectionProgress')
      .items.filter(`EmployeeEmail eq '${email}'`)();
  }
}