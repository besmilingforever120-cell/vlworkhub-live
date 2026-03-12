import { BaseSharePointService } from '../core/BaseSharePointService';

export class SecurityService extends BaseSharePointService {
  async secureLibraryItem(
    listTitle: string,
    itemId: number,
    readPrincipalIds: number[],
    managerIds: number[] = []
  ): Promise<void> {
    try {
      await this.post(
        `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${itemId})/breakroleinheritance(copyRoleAssignments=false)`,
        {}
      );

      const { owners } = await this.getAssociatedGroups();
      if (!owners) {
        throw new Error(
          `Associated groups are not configured on this site (owners missing). ` +
          `Open Site permissions and ensure Owners exist.`
        );
      }

      const [fullCtrlId, readId] = await Promise.all([
        this.getRoleDefinitionId('Full Control'),
        this.getRoleDefinitionId('Read')
      ]);

      const permissions = [
        { principalId: owners.Id, roleDefId: fullCtrlId },
        ...readPrincipalIds.map(principalId => ({ principalId, roleDefId: readId })),
        ...managerIds.map(principalId => ({ principalId, roleDefId: readId }))
      ];

      const seen = new Set<number>();
      for (const perm of permissions) {
        if (!perm.principalId || seen.has(perm.principalId)) continue;
        seen.add(perm.principalId);
        await this.post(
          `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${itemId})/roleassignments/addroleassignment(principalid=${perm.principalId},roledefid=${perm.roleDefId})`,
          {}
        );
      }
    } catch (error) {
      console.error('Error securing library item:', error);
      throw error;
    }
  }

  async secureTaskItem(
    taskId: number,
    assigneeIds: number[],
    managerIds: number[] = []
  ): Promise<void> {
    try {
      const listTitle = 'Tasks';
      await this.post(
        `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${taskId})/breakroleinheritance(copyRoleAssignments=false)`,
        {}
      );

      const { owners } = await this.getAssociatedGroups();
      if (!owners) {
        throw new Error(
          `Associated groups are not configured on this site (owners missing). ` +
          `Open Site permissions and ensure Owners exist.`
        );
      }

      const [fullCtrlId, readId, contribId] = await Promise.all([
        this.getRoleDefinitionId('Full Control'),
        this.getRoleDefinitionId('Read'),
        this.getRoleDefinitionId('Contribute')
      ]);

      const permissions = [
        { principalId: owners.Id, roleDefId: fullCtrlId },
        ...assigneeIds.map(principalId => ({
          principalId,
          roleDefId: contribId
        })),
        ...managerIds.map(principalId => ({
          principalId,
          roleDefId: readId
        }))
      ];

      const seen = new Set<number>();
      for (const perm of permissions) {
        if (!perm.principalId || seen.has(perm.principalId)) continue;
        seen.add(perm.principalId);
        await this.post(
          `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${taskId})/roleassignments/addroleassignment(principalid=${perm.principalId},roledefid=${perm.roleDefId})`,
          {}
        );
      }
    } catch (error) {
      console.error('Error securing task item:', error);
      throw error;
    }
  }

  async secureAnnouncementItem(
    announcementId: number,
    audiencePrincipalIds: number[] = []
  ): Promise<void> {
    try {
      const listTitle = 'Announcements';
      await this.post(
        `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${announcementId})/breakroleinheritance(copyRoleAssignments=false)`,
        {}
      );

      const { owners, members, visitors } = await this.getAssociatedGroups();
      if (!owners || !members) {
        throw new Error(
          `Associated groups are not configured on this site (owners or members missing). ` +
          `Open Site permissions and ensure Owners/Members (and optionally Visitors) exist.`
        );
      }

      const [fullCtrlId, readId] = await Promise.all([
        this.getRoleDefinitionId('Full Control'),
        this.getRoleDefinitionId('Read')
      ]);

      const permissions: Array<{ principalId: number; roleDefId: number }> = [
        { principalId: owners.Id, roleDefId: fullCtrlId },
        { principalId: members.Id, roleDefId: readId },
        ...(visitors ? [{ principalId: visitors.Id, roleDefId: readId }] : [])
      ];

      for (const audienceId of audiencePrincipalIds) {
        permissions.push({ principalId: audienceId, roleDefId: readId });
      }

      for (const perm of permissions) {
        await this.post(
          `${this.baseUrl}/_api/web/lists/getbytitle('${listTitle}')/items(${announcementId})/roleassignments/addroleassignment(principalid=${perm.principalId},roledefid=${perm.roleDefId})`,
          {}
        );
      }
    } catch (error) {
      console.error('Error securing announcement item:', error);
      throw error;
    }
  }

  private async getAssociatedGroups(): Promise<{
    owners?: { Id: number; Title: string };
    members?: { Id: number; Title: string };
    visitors?: { Id: number; Title: string };
  }> {
    const PREFERRED_OWNER_TITLES = ['dev-HR Owners', 'Owners'];
    const PREFERRED_MEMBER_TITLES = ['dev-HR Members', 'Members'];
    const PREFERRED_VISITOR_TITLES = ['dev-HR Visitors', 'Visitors'];

    const safeGet = async <T>(url: string): Promise<T | undefined> => {
      try {
        return await this.get<T>(url);
      } catch {
        return undefined;
      }
    };

    const ownersRes = await safeGet<{ Id: number; Title: string }>(
      `${this.baseUrl}/_api/web/associatedownergroup?$select=Id,Title`
    );
    const membersRes = await safeGet<{ Id: number; Title: string }>(
      `${this.baseUrl}/_api/web/associatedmembergroup?$select=Id,Title`
    );
    const visitorsRes = await safeGet<{ Id: number; Title: string }>(
      `${this.baseUrl}/_api/web/associatedvisitorgroup?$select=Id,Title`
    );

    let owners = ownersRes;
    let members = membersRes;
    let visitors = visitorsRes;

    if (!owners || !members || !visitors) {
      const all = await safeGet<{ value: { Id: number; Title: string }[] }>(
        `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title`
      );
      const allGroups = all?.value || [];

      const pickExact = (titles: string[]) =>
        allGroups.find(g => titles.some(t => g.Title.toLowerCase() === t.toLowerCase()));

      owners = owners || pickExact(PREFERRED_OWNER_TITLES);
      members = members || pickExact(PREFERRED_MEMBER_TITLES);
      visitors = visitors || pickExact(PREFERRED_VISITOR_TITLES);

      const pickFuzzy = (re: RegExp) => allGroups.find(g => re.test(g.Title));
      owners = owners || pickFuzzy(/\bowners?\b/i);
      members = members || pickFuzzy(/\bmembers?\b/i);
      visitors = visitors || pickFuzzy(/\bvisitors?\b/i);
    }

    try {
      owners = owners || (await this.getGroupByName('Owners'));
    } catch (error) {
      console.error('Error fetching direct reports:', error);
    }
    try {
      members = members || (await this.getGroupByName('Members'));
    } catch (error) {
      console.error('Error fetching direct reports:', error);
    }
    try {
      visitors = visitors || (await this.getGroupByName('Visitors'));
    } catch (error) {
      console.error('Error fetching direct reports:', error);
    }

    return { owners, members, visitors };
  }

  private async getGroupByName(groupName: string): Promise<{ Id: number; Title: string }> {
    const groups = await this.get<{ value: { Id: number; Title: string }[] }>(
      `${this.baseUrl}/_api/web/sitegroups?$filter=Title eq '${groupName}'&$select=Id,Title`
    );
    if (!groups.value.length) throw new Error(`Group '${groupName}' not found`);
    return groups.value[0];
  }

  private async getRoleDefinitionId(roleName: string): Promise<number> {
    const roleDefs = await this.get<{ value: { Id: number; Name: string }[] }>(
      `${this.baseUrl}/_api/web/roledefinitions?$filter=Name eq '${roleName}'&$select=Id,Name`
    );
    if (!roleDefs.value.length) throw new Error(`Role definition '${roleName}' not found`);
    return roleDefs.value[0].Id;
  }
}
