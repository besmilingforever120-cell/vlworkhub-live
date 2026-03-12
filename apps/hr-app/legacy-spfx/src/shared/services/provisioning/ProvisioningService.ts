import '@pnp/sp/lists';
import '@pnp/sp/fields';
import '@pnp/sp/webs';
import { FieldUserSelectionMode } from '@pnp/sp/fields';
import { BaseSharePointService } from '../core/BaseSharePointService';

export class ProvisioningService extends BaseSharePointService {
  async ensureTrainingAssets(): Promise<void> {
    try {
      const trainingLibrary = await this.ensureList('Training Videos', 101);
      await this.ensureList('TrainingAssignments', 100);
      await this.ensureList('TrainingCompletions', 100);
      await this.ensureList('Surveys', 100);
      await this.ensureList('SurveyAssignments', 100);
      await this.ensureList('SurveyCompletions', 100);
      await this.ensureList('DocumentAssignments', 100);

      await this.ensureTrainingAssignmentFields();
      await this.ensureTrainingCompletionFields();
      await this.ensureSurveyFields();
      await this.ensureSurveyAssignmentFields();
      await this.ensureSurveyCompletionFields();
      await this.ensureDocumentAssignmentFields();

      await this.ensureLibraryExists(trainingLibrary);
    } catch (error) {
      console.warn('Training provisioning skipped:', error);
    }
  }

  async ensureTaskAssignedToField(): Promise<void> {
    try {
      const list = await this.ensureList('Tasks', 171);
      await this.ensureUserField(list, 'AssignedTo', true);
      await this.ensureUserField(list, 'AssignedUsers', true);
    } catch (error) {
      console.warn('Task assignment field check skipped:', error);
    }
  }

  async ensureDocumentAssignments(): Promise<void> {
    try {
      await this.ensureList('DocumentAssignments', 100);
      await this.ensureDocumentAssignmentFields();
    } catch (error) {
      console.warn('Document assignment field check skipped:', error);
    }
  }

  private async ensureTrainingAssignmentFields(): Promise<void> {
    const list = await this.ensureList('TrainingAssignments', 100);
    await this.ensureNumberField(list, 'VideoId');
    await this.ensureTextField(list, 'VideoUrl');
    await this.ensureDateField(list, 'DueDate');
    await this.ensureUserField(list, 'AssignedTo', true);
    await this.ensureUserField(list, 'AssignedUsers', true);
  }

  private async ensureTrainingCompletionFields(): Promise<void> {
    const list = await this.ensureList('TrainingCompletions', 100);
    await this.ensureNumberField(list, 'AssignmentId');
    await this.ensureNumberField(list, 'UserId');
    await this.ensureDateField(list, 'CompletedOn');
    await this.ensureNumberField(list, 'ProgressPercent');
    await this.ensureNumberField(list, 'LastPositionSeconds');
    await this.ensureNumberField(list, 'DurationSeconds');
    await this.ensureDateField(list, 'LastUpdatedOn');
  }

  private async ensureSurveyFields(): Promise<void> {
    const list = await this.ensureList('Surveys', 100);
    await this.ensureTextField(list, 'Url');
    await this.ensureDateField(list, 'DueDate');
  }

  private async ensureSurveyAssignmentFields(): Promise<void> {
    const list = await this.ensureList('SurveyAssignments', 100);
    await this.ensureNumberField(list, 'SurveyId');
    await this.ensureTextField(list, 'SurveyUrl');
    await this.ensureDateField(list, 'DueDate');
    await this.ensureUserField(list, 'AssignedTo', true);
    await this.ensureUserField(list, 'AssignedUsers', true);
  }

  private async ensureSurveyCompletionFields(): Promise<void> {
    const list = await this.ensureList('SurveyCompletions', 100);
    await this.ensureNumberField(list, 'AssignmentId');
    await this.ensureNumberField(list, 'UserId');
    await this.ensureDateField(list, 'CompletedOn');
  }

  private async ensureDocumentAssignmentFields(): Promise<void> {
    const list = await this.ensureList('DocumentAssignments', 100);
    await this.ensureTextField(list, 'DocumentName');
    await this.ensureTextField(list, 'DocumentUrl');
    await this.ensureTextField(list, 'DocumentUniqueId');
    await this.ensureDateField(list, 'DueDate');
    await this.ensureTextField(list, 'Status');
    await this.ensureDateField(list, 'CompletedOn');
    await this.ensureTextField(list, 'UserCopyUrl');
    await this.ensureNumberField(list, 'AssignmentGroupId');
    await this.ensureTextField(list, 'AssignmentGroupTitle');
    await this.ensureNumberField(list, 'SourceItemId');
    await this.ensureUserField(list, 'AssignedTo', false);
    await this.ensureUserField(list, 'AssignedBy', false);
  }

  private async ensureList(title: string, template: number): Promise<any> {
    try {
      await this.sp.web.lists.getByTitle(title).select('Id')();
      return this.sp.web.lists.getByTitle(title);
    } catch {
      await this.sp.web.lists.add(title, '', template, false);
      return this.sp.web.lists.getByTitle(title);
    }
  }

  private async ensureLibraryExists(list: any): Promise<void> {
    try {
      await list.rootFolder.select('ServerRelativeUrl')();
    } catch {
      // No-op: list should already exist.
    }
  }

  private async ensureTextField(list: any, name: string): Promise<void> {
    await this.ensureField(list, name, async () => {
      await list.fields.addText(name);
    });
  }

  private async ensureNumberField(list: any, name: string): Promise<void> {
    await this.ensureField(list, name, async () => {
      await list.fields.addNumber(name);
    });
  }

  private async ensureDateField(list: any, name: string): Promise<void> {
    await this.ensureField(list, name, async () => {
      await list.fields.addDateTime(name);
    });
  }

  private async ensureUserField(list: any, name: string, multi: boolean): Promise<void> {
    const props = {
      SelectionMode: FieldUserSelectionMode.PeopleAndGroups,
      AllowMultipleValues: multi
    };

    try {
      await list.fields.getByInternalNameOrTitle(name)();
      await list.fields
        .getByInternalNameOrTitle(name)
        .update(props, 'SP.FieldUser');
    } catch {
      await list.fields.addUser(name, props);
    }
  }

  private async ensureField(
    list: any,
    name: string,
    create: () => Promise<void>
  ): Promise<void> {
    try {
      await list.fields.getByInternalNameOrTitle(name)();
    } catch {
      await create();
    }
  }
}
