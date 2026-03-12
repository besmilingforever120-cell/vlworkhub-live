import { MSGraphClientV3 } from '@microsoft/sp-http';
import { BaseSharePointService } from '../core/BaseSharePointService';
import { UserService } from './UserService';

export class MembershipService extends BaseSharePointService {
  private fieldCache: Record<string, Record<string, string>> = {};
  private aadGroupMemberCache: Map<number, Array<{ Id: number; Title: string }>> = new Map();
  private spGroupMemberCache: Map<number, Array<{ Id: number; Title: string }>> = new Map();
  private spGroupTitleCache: Map<string, Array<{ Id: number; Title: string }>> = new Map();

  private async loadFieldsForList(listTitle: string): Promise<Record<string, string>> {
    if (this.fieldCache[listTitle]) return this.fieldCache[listTitle];

    const data = await this.get<{ value: Array<{ InternalName: string; Title: string }> }>(
      `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/fields?$select=InternalName,Title`
    );

    const map: Record<string, string> = {};
    data.value.forEach(field => {
      map[field.Title.toLowerCase()] = field.InternalName;
      map[field.InternalName.toLowerCase()] = field.InternalName;
    });

    this.fieldCache[listTitle] = map;
    return map;
  }

  private async resolveFieldName(
    listTitle: string,
    candidates: string[]
  ): Promise<string | null> {
    const map = await this.loadFieldsForList(listTitle);
    for (const name of candidates) {
      const key = name.toLowerCase();
      if (map[key]) return map[key];
    }
    return null;
  }

  async getDepartmentEmployeePrincipalIds(currentUserId: number): Promise<number[]> {
    try {
      const departmentList = 'Department';
      const employeesList = 'Employees';
      const currentUserEmail = (this.context.pageContext?.user?.email || '').trim();

      const currentUserName = (this.context.pageContext?.user?.displayName || '').trim();

      const deptManagerField =
        (await this.resolveFieldName(departmentList, [
          'DeptManager',
          'Dept Manager',
          'Department Manager',
          'DepartmentManager'
        ])) || 'DeptManager';
      const departmentField =
        (await this.resolveFieldName(employeesList, [
          'Department',
          'Dept',
          'DeptName',
          'DepartmentName',
          'Department0'
        ])) || 'Department';
      const fullNameField =
        (await this.resolveFieldName(employeesList, [
          'Full Name',
          'FullName',
          'Full_x0020_Name',
          'Title'
        ])) || 'FullName';
      const managerField =
        (await this.resolveFieldName(employeesList, [
          'Manager',
          'Direct Manager',
          'Employee Manager',
          'Supervisor'
        ])) || 'Manager';
      const employeeEmailField =
        await this.resolveFieldName(employeesList, [
          'Email',
          'E-mail',
          'Work Email',
          'Employee Email',
          'EmployeeEmail',
          'Email Address'
        ]);

      const managerIdFilter = `${managerField}/Id eq ${currentUserId}`;
      const managerEmailFilter = currentUserEmail
        ? `${managerField}/EMail eq '${currentUserEmail.replace(/'/g, "''")}'`
        : '';
      const managerTitleFilter = currentUserName
        ? `${managerField}/Title eq '${currentUserName.replace(/'/g, "''")}'`
        : '';
      const managerFilter = managerEmailFilter
        ? `(${managerIdFilter} or ${managerEmailFilter}${managerTitleFilter ? ` or ${managerTitleFilter}` : ''})`
        : managerTitleFilter
          ? `(${managerIdFilter} or ${managerTitleFilter})`
          : managerIdFilter;

      const deptManagerIdFilter = `${deptManagerField}/Id eq ${currentUserId}`;
      const deptManagerEmailFilter = currentUserEmail
        ? `${deptManagerField}/EMail eq '${currentUserEmail.replace(/'/g, "''")}'`
        : '';
      const deptManagerTitleFilter = currentUserName
        ? `${deptManagerField}/Title eq '${currentUserName.replace(/'/g, "''")}'`
        : '';
      const deptManagerFilter = deptManagerEmailFilter
        ? `(${deptManagerIdFilter} or ${deptManagerEmailFilter}${deptManagerTitleFilter ? ` or ${deptManagerTitleFilter}` : ''})`
        : deptManagerTitleFilter
          ? `(${deptManagerIdFilter} or ${deptManagerTitleFilter})`
          : deptManagerIdFilter;

      const deptUrl =
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(departmentList)}')/items` +
        `?$select=Id,${deptManagerField}/Id&$expand=${deptManagerField}` +
        `&$filter=${encodeURIComponent(deptManagerFilter)}`;
      const deptData = await this.get<{ value: Array<{ Id: number }> }>(deptUrl);
      const deptIds = deptData.value.map(d => d.Id);

      let filter = '';
      if (deptIds.length) {
        const deptFilter = deptIds.map(id => `${departmentField}/Id eq ${id}`).join(' or ');
        filter = `(${deptFilter})`;
      } else {
        filter = managerFilter;
      }

      const selectFields = [
        'Id',
        `${fullNameField}/Id`,
        `${fullNameField}/Title`,
        `${departmentField}/Id`,
        `${managerField}/Id`,
        `${managerField}/Title`,
        `${managerField}/EMail`
      ];
      const expandFields = [fullNameField, departmentField, managerField];
      if (employeeEmailField) {
        selectFields.push(employeeEmailField);
      }

      const buildEmployeesUrl = (filterExpr: string): string =>
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(employeesList)}')/items` +
        `?$select=${selectFields.join(',')}` +
        `&$expand=${expandFields.join(',')}` +
        `&$filter=${encodeURIComponent(filterExpr)}&$top=5000`;

      let employeesData = await this.get<{ value: any[] }>(buildEmployeesUrl(filter));
      if (!employeesData.value.length && deptIds.length) {
        employeesData = await this.get<{ value: any[] }>(buildEmployeesUrl(managerFilter));
      }

      if (deptIds.length) {
        const managerMatches = employeesData.value.filter(item => {
          const manager = item[managerField];
          const managerId = Number(manager?.Id ?? 0);
          const managerEmail = String(manager?.EMail || '').trim().toLowerCase();
          const managerTitle = String(manager?.Title || '').trim().toLowerCase();

          if (managerId && managerId === currentUserId) return true;
          if (currentUserEmail && managerEmail === currentUserEmail.toLowerCase())
            return true;
          if (currentUserName && managerTitle === currentUserName.toLowerCase())
            return true;
          return false;
        });
        employeesData = { value: managerMatches };
      }

      const ids = new Set<number>();
      const pending: Array<Promise<void>> = [];
      employeesData.value.forEach(item => {
        const person = item[fullNameField];
        const id = person?.Id ? Number(person.Id) : null;
        if (id) {
          ids.add(id);
          return;
        }

        const personEmail = person?.EMail ? String(person.EMail || '').trim() : '';
        const email = personEmail
          ? personEmail
          : employeeEmailField
            ? String(item[employeeEmailField] || '').trim()
            : '';
        if (email) {
          pending.push(
            this.ensureUserId(email).then(userId => {
              if (userId) ids.add(userId);
            })
          );
        }
      });

      if (pending.length) {
        await Promise.all(pending);
      }

      return [...ids];
    } catch (error) {
      console.warn('Failed to resolve department employees:', error);
      return [];
    }
  }

  async getManagerVisiblePrincipalIds(currentUserId: number): Promise<number[]> {
    const set = new Set<number>();
    set.add(currentUserId);
    (await this.getDepartmentEmployeePrincipalIds(currentUserId)).forEach(i => set.add(i));
    return [...set];
  }
  async getMeAndDirectReportIds(currentUserId: number): Promise<number[]> {
    const set = new Set<number>();
    set.add(currentUserId);

    try {
      const reports = await this.getMyDirectReportsAccountNames();
      const ids = await Promise.all(reports.map(a => this.ensureUserId(a)));
      ids.forEach(i => i && set.add(i));
    } catch (error) {
      console.error('Error fetching direct reports:', error);
    }

    return [...set];
  }

  async getMyDirectReportsAccountNames(): Promise<string[]> {
    try {
      const data = await this.get<any>(
        `${this.baseUrl}/_api/SP.UserProfiles.PeopleManager/GetMyProperties?$select=DirectReports`
      );
      const arr = data?.DirectReports?.results ?? data?.DirectReports ?? [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  /**
   * ✅ FIXED: Get SharePoint group IDs that current user belongs to
   * Uses the correct REST API endpoint
   */
  async getMySharePointGroupPrincipalIds(): Promise<number[]> {
    try {
      // Method 1: Get current user's groups directly (most efficient)
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

  async getMyAadGroupPrincipalIdsOnSite(): Promise<number[]> {
  try {
    const client = (await this.context.msGraphClientFactory.getClient('3')) as MSGraphClientV3;

    const groupIds = new Set<string>();
    // ✅ Fixed: removed @odata.type from $select
    let url = '/me/transitiveMemberOf?$select=id&$top=999';

    while (url) {
      const res: any = await client.api(url).get();
      res.value.forEach((e: any) => {
        // ✅ @odata.type is still available in the response!
        if (e['@odata.type'] === '#microsoft.graph.group' && e.id) {
          groupIds.add(e.id.toLowerCase());
        }
      });
      url = res['@odata.nextLink']?.replace('https://graph.microsoft.com/v1.0', '') ?? '';
    }

    if (!groupIds.size) return [];

    const siteUsers = await this.get<{
      value: { Id: number; LoginName: string; PrincipalType: number }[];
    }>(`${this.baseUrl}/_api/web/siteusers?$select=Id,Title,LoginName,PrincipalType`);

    return siteUsers.value
      .filter(
        u =>
          u.PrincipalType === 4 &&
          groupIds.has(u.LoginName.toLowerCase().match(/[0-9a-f-]{36}/)?.[0] ?? '')
      )
      .map(u => u.Id);
  } catch {
    return [];
  }
}

  async getSharePointGroupMembers(
    groupId: number
  ): Promise<Array<{ Id: number; Title: string }>> {
    try {
      if (this.spGroupMemberCache.has(groupId)) {
        return this.spGroupMemberCache.get(groupId) || [];
      }

      const data = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
        `${this.baseUrl}/_api/web/sitegroups/getbyid(${groupId})/users?$select=Id,Title`
      );
      this.spGroupMemberCache.set(groupId, data.value);
      return data.value;
    } catch (error) {
      // Fallback: the provided ID may be a site user principal ID for a SharePoint group.
      try {
        const siteUser = await this.get<{
          Id: number;
          Title: string;
          LoginName: string;
          PrincipalType: number;
        }>(
          `${this.baseUrl}/_api/web/siteusers/getbyid(${groupId})?$select=Id,Title,LoginName,PrincipalType`
        );

        const groupTitle = String(siteUser?.Title || '').trim();
        if (!groupTitle) return [];

        const groupData = await this.get<{
          value: Array<{ Id: number; Title: string }>;
        }>(
          `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title&$filter=${encodeURIComponent(
            `Title eq '${groupTitle.replace(/'/g, "''")}'`
          )}`
        );

        const matched = groupData.value?.[0];
        if (!matched?.Id) return [];

        const membersData = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
          `${this.baseUrl}/_api/web/sitegroups/getbyid(${matched.Id})/users?$select=Id,Title`
        );
        this.spGroupMemberCache.set(groupId, membersData.value);
        return membersData.value;
      } catch (fallbackError) {
        console.warn('Failed to resolve SharePoint group members:', fallbackError);
        return [];
      }
    }
  }

  async getSharePointGroupMembersByTitle(
    groupTitle: string
  ): Promise<Array<{ Id: number; Title: string }>> {
    const title = String(groupTitle || '').trim();
    if (!title) return [];

    if (this.spGroupTitleCache.has(title)) {
      return this.spGroupTitleCache.get(title) || [];
    }

    try {
      const groupData = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
        `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title&$filter=${encodeURIComponent(
          `Title eq '${title.replace(/'/g, "''")}'`
        )}`
      );

      const matched = groupData.value?.[0];
      if (!matched?.Id) {
        this.spGroupTitleCache.set(title, []);
        return [];
      }

      const membersData = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
        `${this.baseUrl}/_api/web/sitegroups/getbyid(${matched.Id})/users?$select=Id,Title`
      );

      this.spGroupTitleCache.set(title, membersData.value);
      return membersData.value;
    } catch (error) {
      console.warn('Failed to resolve SharePoint group members by title:', error);
      this.spGroupTitleCache.set(title, []);
      return [];
    }
  }

  private async getAadGroupMembersByPrincipalId(
    principalId: number
  ): Promise<Array<{ Id: number; Title: string }>> {
    if (this.aadGroupMemberCache.has(principalId)) {
      return this.aadGroupMemberCache.get(principalId) || [];
    }

    try {
      const siteUser = await this.get<{
        Id: number;
        LoginName: string;
        Title: string;
        PrincipalType: number;
      }>(`${this.baseUrl}/_api/web/siteusers/getbyid(${principalId})?$select=Id,LoginName,Title,PrincipalType`);

      const guidMatch = siteUser.LoginName?.match(/[0-9a-f-]{36}/i);
      const groupId = guidMatch?.[0];
      if (!groupId) return [];

      const client = (await this.context.msGraphClientFactory.getClient('3')) as MSGraphClientV3;
      let url = `/groups/${groupId}/members?$select=displayName,userPrincipalName,mail&$top=999`;
      const members: Array<{ Id: number; Title: string }> = [];

      while (url) {
        const res: any = await client.api(url).get();
        for (const entry of res.value || []) {
          const email = String(entry.userPrincipalName || entry.mail || '').trim();
          if (!email) continue;
          const ensured = await this.ensureUserId(email);
          if (ensured) {
            members.push({ Id: ensured, Title: entry.displayName || email });
          }
        }
        url = res['@odata.nextLink']?.replace('https://graph.microsoft.com/v1.0', '') ?? '';
      }

      this.aadGroupMemberCache.set(principalId, members);
      return members;
    } catch (error) {
      console.warn('Failed to resolve AAD group members:', error);
      return [];
    }
  }

  async getPrincipalMembers(
    principalId: number,
    principalType?: number
  ): Promise<Array<{ Id: number; Title: string }>> {
    if (!principalId) return [];

    if (principalType === 1) {
      return [];
    }

    if (principalType === 8) {
      return await this.getSharePointGroupMembers(principalId);
    }

    if (principalType === 4) {
      const aadMembers = await this.getAadGroupMembersByPrincipalId(principalId);
      if (aadMembers.length) return aadMembers;
    }

    const spMembers = await this.getSharePointGroupMembers(principalId);
    if (spMembers.length) return spMembers;

    const aadMembers = await this.getAadGroupMembersByPrincipalId(principalId);
    return aadMembers;
  }

  async expandPrincipalIdsToUserIds(principalIds: number[]): Promise<number[]> {
    if (!principalIds.length) return [];

    try {
      const userIds = new Set<number>();
      const userService = new UserService(this.context);

      const principals = await userService.getPrincipalsByIds(principalIds);
      for (const principal of principals) {
        if (principal.PrincipalType === 1) {
          userIds.add(principal.Id);
          continue;
        }
        const members = await this.getPrincipalMembers(principal.Id, principal.PrincipalType);
        members.forEach(member => userIds.add(member.Id));
      }

      return [...userIds];
    } catch (error) {
      console.warn('Failed to expand principals to user IDs:', error);
      return [];
    }
  }

  async getManagerPrincipalIdsForUsers(userIds: number[]): Promise<number[]> {
    if (!userIds.length) return [];

    try {
      const managerIds = new Set<number>();

      const employeesList = 'Employees';
      const departmentList = 'Department';
      const fullNameField =
        (await this.resolveFieldName(employeesList, [
          'Full Name',
          'FullName',
          'Full_x0020_Name',
          'Title'
        ])) || 'FullName';
      const managerField =
        (await this.resolveFieldName(employeesList, [
          'Manager',
          'Direct Manager',
          'Employee Manager',
          'Supervisor'
        ])) || 'Manager';
      const departmentField =
        (await this.resolveFieldName(employeesList, [
          'Department',
          'Dept',
          'DeptName',
          'DepartmentName',
          'Department0'
        ])) || 'Department';
      const deptManagerField =
        (await this.resolveFieldName(departmentList, [
          'DeptManager',
          'Dept Manager',
          'Department Manager',
          'DepartmentManager'
        ])) || 'DeptManager';

      const employeeFilter = userIds
        .map(id => `${fullNameField}/Id eq ${id}`)
        .join(' or ');
      const employeesUrl =
        `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(employeesList)}')/items` +
        `?$select=Id,${fullNameField}/Id,${managerField}/Id,${managerField}/Title,${managerField}/EMail,${departmentField}/Id` +
        `&$expand=${fullNameField},${managerField},${departmentField}` +
        `&$filter=${encodeURIComponent(employeeFilter)}&$top=5000`;

      const employeesData = await this.get<{ value: any[] }>(employeesUrl);
      const deptIds = new Set<number>();

      for (const item of employeesData.value) {
        const manager = item[managerField];
        const managerId = Number(manager?.Id ?? 0);
        const managerEmail = String(manager?.EMail || '').trim();

        if (managerId) {
          managerIds.add(managerId);
        } else if (managerEmail) {
          const ensured = await this.ensureUserId(managerEmail);
          if (ensured) managerIds.add(ensured);
        }

        const deptId = Number(item?.[departmentField]?.Id ?? 0);
        if (deptId) deptIds.add(deptId);
      }

      if (deptIds.size) {
        const deptFilter = [...deptIds].map(id => `Id eq ${id}`).join(' or ');
        const deptUrl =
          `${this.baseUrl}/_api/web/lists/getbytitle('${encodeURIComponent(departmentList)}')/items` +
          `?$select=Id,${deptManagerField}/Id,${deptManagerField}/Title,${deptManagerField}/EMail` +
          `&$expand=${deptManagerField}` +
          `&$filter=${encodeURIComponent(deptFilter)}&$top=5000`;

        const deptData = await this.get<{ value: any[] }>(deptUrl);
        for (const dept of deptData.value) {
          const manager = dept[deptManagerField];
          const managerId = Number(manager?.Id ?? 0);
          const managerEmail = String(manager?.EMail || '').trim();

          if (managerId) {
            managerIds.add(managerId);
          } else if (managerEmail) {
            const ensured = await this.ensureUserId(managerEmail);
            if (ensured) managerIds.add(ensured);
          }
        }
      }

      if (managerIds.size) {
        return [...managerIds];
      }

      // Fallback to Graph manager lookup if list-based mapping is unavailable.
      const filter = userIds.map(id => `Id eq ${id}`).join(' or ');
      const url =
        `${this.baseUrl}/_api/web/siteusers` +
        `?$select=Id,LoginName,PrincipalType&$filter=${encodeURIComponent(filter)}&$top=5000`;

      const data = await this.get<{
        value: { Id: number; LoginName: string; PrincipalType: number }[];
      }>(url);

      for (const user of data.value) {
        if (user.PrincipalType !== 1) continue;

        const managerLogin = await this.getManagerAccountName(user.LoginName);
        if (!managerLogin) continue;

        const managerId = await this.ensureUserId(managerLogin);
        if (managerId) managerIds.add(managerId);
      }

      return [...managerIds];
    } catch (error) {
      console.warn('Failed to resolve manager principal IDs:', error);
      return [];
    }
  }

  async getVisiblePrincipalIds(currentUserId: number): Promise<number[]> {
    const set = new Set<number>();
    (await this.getMeAndDirectReportIds(currentUserId)).forEach(i => set.add(i));
    (await this.getMySharePointGroupPrincipalIds()).forEach(i => set.add(i));
    (await this.getMyAadGroupPrincipalIdsOnSite()).forEach(i => set.add(i));
    return [...set];
  }

  async getMyPrincipalIds(currentUserId: number): Promise<number[]> {
    const set = new Set<number>();
    set.add(currentUserId);
    (await this.getMySharePointGroupPrincipalIds()).forEach(i => set.add(i));
    (await this.getMyAadGroupPrincipalIdsOnSite()).forEach(i => set.add(i));
    return [...set];
  }

  private async getManagerAccountName(accountName: string): Promise<string | null> {
    try {
      const url =
        `${this.baseUrl}/_api/SP.UserProfiles.PeopleManager/GetPropertiesFor(accountName=@v)` +
        `?@v='${encodeURIComponent(accountName)}'`;
      const data = await this.get<any>(url);

      const props = data?.UserProfileProperties?.results ?? data?.UserProfileProperties ?? [];
      const managerProp = props.find((p: any) => p.Key === 'Manager');
      const raw = managerProp?.Value ? String(managerProp.Value).trim() : '';
      if (!raw) return null;

      if (raw.includes('|')) return raw;
      if (raw.includes('@')) return `i:0#.f|membership|${raw}`;
      return raw;
    } catch {
      return null;
    }
  }

  private async ensureUserId(logon: string): Promise<number | null> {
    try {
      const data = await this.post<any>(`${this.baseUrl}/_api/web/ensureUser`, {
        logonName: logon
      });
      return Number(data?.Id ?? data?.d?.Id ?? null);
    } catch {
      if (logon.includes('@') && !logon.includes('|')) {
        return this.ensureUserId(`i:0#.f|membership|${logon}`);
      }
      return null;
    }
  }
}
