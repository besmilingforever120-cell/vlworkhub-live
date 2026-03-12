import { WebPartContext } from '@microsoft/sp-webpart-base';
import { RoleService } from './auth/RoleService';
import { SecurityService } from './auth/SecurityService';
import { AnnouncementService } from './data/AnnouncementService';
import { TaskService } from './data/TaskService';
import { TaskUserStateService } from './data/TaskUserStateService';
import { EmployeeService } from './data/EmployeeService';
import { NotificationService } from './data/NotificationService';
import { TrainingVideoService } from './data/TrainingVideoService';
import { TrainingAssignmentService } from './data/TrainingAssignmentService';
import { TrainingCompletionService } from './data/TrainingCompletionService';
import { SurveyService } from './data/SurveyService';
import { SurveyAssignmentService } from './data/SurveyAssignmentService';
import { SurveyCompletionService } from './data/SurveyCompletionService';
import { DocumentAssignmentService } from './data/DocumentAssignmentService';
import { OnboardingService } from './onboarding/OnboardingService';
import { UserService } from './user/UserService';
import { MembershipService } from './user/MembershipService';
import { ListDiagnosticsService } from './diagnostics/ListDiagnosticsService';
import { ProvisioningService } from './provisioning/ProvisioningService';
import { EmailService } from './email/EmailService'; // ✅ NEW

export class SharePointServiceFactory {
  private static instances = new WeakMap<WebPartContext, SharePointServiceFactory>();

  private constructor(
    public readonly roles: RoleService,
    public readonly security: SecurityService,
    public readonly announcements: AnnouncementService,
    public readonly tasks: TaskService,
    public readonly taskUserStates: TaskUserStateService,
    public readonly employees: EmployeeService,
    public readonly notifications: NotificationService,
    public readonly trainingVideos: TrainingVideoService,
    public readonly trainingAssignments: TrainingAssignmentService,
    public readonly trainingCompletions: TrainingCompletionService,
    public readonly surveys: SurveyService,
    public readonly surveyAssignments: SurveyAssignmentService,
    public readonly surveyCompletions: SurveyCompletionService,
    public readonly documentAssignments: DocumentAssignmentService,
    public readonly onboarding: OnboardingService,
    public readonly user: UserService,
    public readonly membership: MembershipService,
    public readonly diagnostics: ListDiagnosticsService,
    public readonly provisioning: ProvisioningService,
    public readonly email: EmailService // ✅ NEW
  ) {}

  static getInstance(context: WebPartContext): SharePointServiceFactory {
    if (!this.instances.has(context)) {
      this.instances.set(
        context,
        new SharePointServiceFactory(
          new RoleService(context),
          new SecurityService(context),
          new AnnouncementService(context),
          new TaskService(context),
          new TaskUserStateService(context),
          new EmployeeService(context),
          new NotificationService(context),
          new TrainingVideoService(context),
          new TrainingAssignmentService(context),
          new TrainingCompletionService(context),
          new SurveyService(context),
          new SurveyAssignmentService(context),
          new SurveyCompletionService(context),
          new DocumentAssignmentService(context),
          new OnboardingService(context),
          new UserService(context),
          new MembershipService(context),
          new ListDiagnosticsService(context),
          new ProvisioningService(context),
          new EmailService(context) // ✅ NEW
        )
      );
    }

    return this.instances.get(context)!;
  }
}



