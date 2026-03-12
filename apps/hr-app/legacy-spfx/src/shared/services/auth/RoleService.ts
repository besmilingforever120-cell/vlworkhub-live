import { SPPermission } from '@microsoft/sp-page-context';
import { BaseSharePointService } from '../core/BaseSharePointService';
import { UserRole } from '../../models';
import { ITaskItem } from '../../models';

export class RoleService extends BaseSharePointService {
  private _cachedRole: UserRole | null = null;

  async getCurrentUserRole(): Promise<UserRole> {
    if (this._cachedRole) return this._cachedRole;

    try {
      if (this.isCurrentUserOwner()) {
        this._cachedRole = 'Admin';
        return this._cachedRole;
      }

      const memberGroups = await this.getMySharePointGroupPrincipalIds();
      const memberGroupTitles = await this.getMySharePointGroupTitles();
      const { ownersId, membersId } = await this.getAssociatedGroupIds();

      if (ownersId && memberGroups.includes(ownersId)) {
        this._cachedRole = 'Admin';
        return this._cachedRole;
      }

      if (membersId && memberGroups.includes(membersId)) {
        this._cachedRole = 'Manager';
        return this._cachedRole;
      }

      const isEmployeeGroup = memberGroupTitles.some(
        title => title.trim().toLowerCase() === 'hr all employees'
      );
      if (isEmployeeGroup) {
        this._cachedRole = 'Employee';
        return this._cachedRole;
      }

      this._cachedRole = 'Employee';
      return this._cachedRole;
    } catch (error) {
      console.warn('Error determining user role, defaulting to Employee:', error);
      this._cachedRole = 'Employee';
      return this._cachedRole;
    }
  }

  async isAdmin(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async isManager(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Manager';
  }

  async isEmployee(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Employee';
  }

  async canCreateTasks(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async canDeleteTask(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async canCreateAnnouncements(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async canEditAnnouncement(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async canDeleteAnnouncement(): Promise<boolean> {
    return (await this.getCurrentUserRole()) === 'Admin';
  }

  async canEditTask(_task: ITaskItem, _currentUserId: number): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'Admin';
  }

  isCurrentUserOwner(): boolean {
    try {
      const perms = this.context.pageContext.web.permissions;
      return (
        perms.hasPermission(SPPermission.manageWeb) ||
        perms.hasPermission(SPPermission.managePermissions)
      );
    } catch {
      return false;
    }
  }

  /**
   * ✅ FIXED: Get SharePoint group IDs that current user belongs to
   * Uses the correct REST API endpoint
   */
  private async getMySharePointGroupPrincipalIds(): Promise<number[]> {
    try {
      // Method 1: Get current user's groups directly
      const userGroups = await this.get<{ value: { Id: number; Title: string }[] }>(
        `${this.baseUrl}/_api/web/currentuser/groups?$select=Id,Title`
      );

      return userGroups.value.map(g => g.Id);
    } catch (error) {
      console.warn('Failed to get user groups via currentuser/groups, trying alternative method:', error);

      try {
        // Method 2: Fallback - Get all groups and check membership individually
        const allGroups = await this.get<{ value: { Id: number; Title: string }[] }>(
          `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title`
        );

        const currentUserId = this.context.pageContext.legacyPageContext.userId;
        const groupIds: number[] = [];

        // Check each group's users
        for (const group of allGroups.value) {
          try {
            const groupUsers = await this.get<{ value: { Id: number }[] }>(
              `${this.baseUrl}/_api/web/sitegroups/getbyid(${group.Id})/users?$select=Id&$filter=Id eq ${currentUserId}`
            );

            if (groupUsers.value.length > 0) {
              groupIds.push(group.Id);
            }
          } catch {
            // Skip groups we can't access
            continue;
          }
        }

        return groupIds;
      } catch (fallbackError) {
        console.error('All methods to get user groups failed:', fallbackError);
        return [];
      }
    }
  }

  private async getMySharePointGroupTitles(): Promise<string[]> {
    try {
      const userGroups = await this.get<{ value: { Title: string }[] }>(
        `${this.baseUrl}/_api/web/currentuser/groups?$select=Title`
      );
      return userGroups.value.map(g => g.Title || '').filter(Boolean);
    } catch {
      return [];
    }
  }

  private async getAssociatedGroupIds(): Promise<{ ownersId?: number; membersId?: number }> {
    const safeGet = async <T>(url: string): Promise<T | undefined> => {
      try {
        return await this.get<T>(url);
      } catch {
        return undefined;
      }
    };

    const owners = await safeGet<{ Id: number; Title: string }>(
      `${this.baseUrl}/_api/web/associatedownergroup?$select=Id,Title`
    );
    const members = await safeGet<{ Id: number; Title: string }>(
      `${this.baseUrl}/_api/web/associatedmembergroup?$select=Id,Title`
    );

    if (owners?.Id || members?.Id) {
      return { ownersId: owners?.Id, membersId: members?.Id };
    }

    const all = await safeGet<{ value: { Id: number; Title: string }[] }>(
      `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title`
    );
    const allGroups = all?.value || [];
    const ownerGroup = allGroups.find(g => /\bowners?\b/i.test(g.Title));
    const memberGroup = allGroups.find(g => /\bmembers?\b/i.test(g.Title));

    return { ownersId: ownerGroup?.Id, membersId: memberGroup?.Id };
  }
}
