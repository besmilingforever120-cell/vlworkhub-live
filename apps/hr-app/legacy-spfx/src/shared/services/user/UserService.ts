import { BaseSharePointService } from '../core/BaseSharePointService';

export class UserService extends BaseSharePointService {
  private _currentUserId: number | null = null;
  private _cachedAllUsers: Array<{ Id: number; Title: string; PrincipalType: number }> | null = null;
  private _cacheTimestamp: number | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private _cachedSiteGroups: Array<{ Id: number; Title: string }> | null = null;
  private _siteGroupsCacheTime: number | null = null;

  async getCurrentUserId(): Promise<number> {
    if (this._currentUserId) return this._currentUserId;

    const data = await this.get<{ Id: number }>(
      `${this.baseUrl}/_api/web/currentuser?$select=Id`
    );
    this._currentUserId = Number(data.Id);
    return this._currentUserId;
  }

  async ensureUserId(logon: string): Promise<number | null> {
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

  /**
   * Get all assignable users based on current user's role and visibility
   * - Admin: Can see ALL users from "All Employees Members" SharePoint group
   * - Manager: Can see their team (visible principals)
   * - Employee: Can only see themselves
   */
  async getAllAssignableUsers(
  currentUserRole: 'Admin' | 'Manager' | 'Employee',
  visiblePrincipalIds: number[]
): Promise<Array<{ Id: number; Title: string; PrincipalType?: number }>> {
  try {
    const allUsers = new Map<number, { Title: string; PrincipalType: number }>();

    // ADMIN: Fetch ALL users from site
    if (currentUserRole === 'Admin') {
      const now = Date.now();
      if (
        this._cachedAllUsers && 
        this._cacheTimestamp && 
        (now - this._cacheTimestamp < this.CACHE_DURATION)
      ) {
        console.log('Using cached user list');
        this._cachedAllUsers.forEach(user => {
          allUsers.set(user.Id, { Title: user.Title, PrincipalType: user.PrincipalType });
        });
      } else {
        console.log('Fetching fresh user list from current site...');
        
        // Fetch all users (we'll filter by email client-side)
        const allSiteUsersUrl = 
          `${this.baseUrl}/_api/web/siteusers` +
          `?$select=Id,Title,Email,PrincipalType` +
          `&$filter=PrincipalType eq 1 or PrincipalType eq 4 or PrincipalType eq 8` +
          `&$top=5000`;
        
        const result = await this.get<{
          value: Array<{ Id: number; Title: string; Email: string; PrincipalType: number }>;
        }>(allSiteUsersUrl);
        
        // ✅ Filter by @vdacl.ca domain client-side
        result.value.forEach(user => {
          const isGroup = user.PrincipalType !== 1;
          const isValidUser = 
            !user.Title.includes('System Account') && 
            !user.Title.includes('app@sharepoint') &&
            !user.Title.startsWith('i:0#') &&
            (
              isGroup ||
              (user.Email && user.Email.toLowerCase().endsWith('@vdacl.ca'))
            ); // Client-side filter
          
          if (isValidUser) {
            allUsers.set(user.Id, { Title: user.Title, PrincipalType: user.PrincipalType });
          }
        });
        
        this._cachedAllUsers = Array.from(allUsers.entries()).map(([Id, entry]) => ({
          Id,
          Title: entry.Title,
          PrincipalType: entry.PrincipalType
        }));
        this._cacheTimestamp = Date.now();
        
        console.log(`✅ Successfully loaded ${allUsers.size} @vdacl.ca users`);
      }
    }
    // MANAGER or EMPLOYEE: Filter visible users
    else {
      if (visiblePrincipalIds.length > 0) {
        const userFilter = visiblePrincipalIds.map(id => `Id eq ${id}`).join(' or ');
        const visibleUsersUrl = 
          `${this.baseUrl}/_api/web/siteusers` +
          `?$select=Id,Title,Email,PrincipalType` +
          `&$filter=(${userFilter}) and (PrincipalType eq 1 or PrincipalType eq 4 or PrincipalType eq 8)` +
          `&$top=5000`;
        
        const result = await this.get<{
          value: Array<{ Id: number; Title: string; Email: string; PrincipalType: number }>;
        }>(visibleUsersUrl);
        
        // ✅ Filter by @vdacl.ca domain client-side
        result.value.forEach(user => {
          const isGroup = user.PrincipalType !== 1;
          const isValidUser = 
            !user.Title.includes('System Account') && 
            !user.Title.includes('app@sharepoint') &&
            !user.Title.startsWith('i:0#') &&
            (
              isGroup ||
              (user.Email && user.Email.toLowerCase().endsWith('@vdacl.ca'))
            ); // Client-side filter
          
          if (isValidUser) {
            allUsers.set(user.Id, { Title: user.Title, PrincipalType: user.PrincipalType });
          }
        });
      }
    }

    const siteGroups = await this.getSiteGroups().catch(
      (): Array<{ Id: number; Title: string }> => []
    );
    const groupList =
      currentUserRole === 'Admin'
        ? siteGroups
        : siteGroups.filter(group => visiblePrincipalIds.includes(group.Id));

    groupList.forEach(group => {
      allUsers.set(group.Id, { Title: group.Title, PrincipalType: 8 });
    });

    // ✅ Check if current user has @vdacl.ca email before including
    const currentUserId = this.context.pageContext.legacyPageContext.userId;
    const currentUserName = this.context.pageContext.user.displayName;
    const currentUserEmail = this.context.pageContext.user.email;
    
    if (currentUserEmail?.toLowerCase().endsWith('@vdacl.ca') && !allUsers.has(currentUserId)) {
      allUsers.set(currentUserId, { Title: currentUserName, PrincipalType: 1 });
    }

    // If no users found and current user has correct domain, return current user
    if (allUsers.size === 0 && currentUserEmail?.toLowerCase().endsWith('@vdacl.ca')) {
      allUsers.set(currentUserId, { Title: currentUserName, PrincipalType: 1 });
    }

    return Array.from(allUsers.entries())
      .map(([Id, entry]) => ({ Id, Title: entry.Title, PrincipalType: entry.PrincipalType }))
      .sort((a, b) => a.Title.localeCompare(b.Title));

  } catch (error) {
    console.error('Error fetching assignable users:', error);
    
    const currentUserId = this.context.pageContext.legacyPageContext.userId;
    const currentUserName = this.context.pageContext.user.displayName;
    return [{ Id: currentUserId, Title: currentUserName, PrincipalType: 1 }];
  }
}

  /**
   * Clear the user cache (useful for manual refresh)
   */
  clearUserCache(): void {
    this._cachedAllUsers = null;
    this._cacheTimestamp = null;
  }

  /**
   * Get user details by their IDs
   * Useful for resolving principal IDs to user names
   */
  async getUsersByIds(userIds: number[]): Promise<Array<{ Id: number; Title: string }>> {
    if (userIds.length === 0) return [];

    try {
      const filter = userIds.map(id => `Id eq ${id}`).join(' or ');
      const url = 
        `${this.baseUrl}/_api/web/siteusers` +
        `?$select=Id,Title&$filter=${encodeURIComponent(filter)}&$top=5000`;
      
      const result = await this.get<{ value: Array<{ Id: number; Title: string }> }>(url);
      return result.value;
    } catch (error) {
      console.error('Error fetching users by IDs:', error);
      return [];
    }
  }

  async getPrincipalsByIds(
    principalIds: number[]
  ): Promise<Array<{ Id: number; Title: string; PrincipalType: number }>> {
    if (!principalIds.length) return [];

    try {
      const filter = principalIds.map(id => `Id eq ${id}`).join(' or ');
      const url =
        `${this.baseUrl}/_api/web/siteusers` +
        `?$select=Id,Title,PrincipalType&$filter=${encodeURIComponent(filter)}&$top=5000`;
      const result = await this.get<{
        value: Array<{ Id: number; Title: string; PrincipalType: number }>;
      }>(url);
      return result.value;
    } catch (error) {
      console.error('Error fetching principals by IDs:', error);
      return [];
    }
  }

  private async getSiteGroups(): Promise<Array<{ Id: number; Title: string }>> {
    const now = Date.now();
    if (
      this._cachedSiteGroups &&
      this._siteGroupsCacheTime &&
      now - this._siteGroupsCacheTime < this.CACHE_DURATION
    ) {
      return this._cachedSiteGroups;
    }

    try {
      const data = await this.get<{ value: Array<{ Id: number; Title: string }> }>(
        `${this.baseUrl}/_api/web/sitegroups?$select=Id,Title&$top=5000`
      );
      const groups = data.value.filter(group => !group.Title.includes('System Account'));
      this._cachedSiteGroups = groups;
      this._siteGroupsCacheTime = Date.now();
      return groups;
    } catch (error) {
      console.error('Error fetching site groups:', error);
      return [];
    }
  }

  public async getSharePointGroups(): Promise<Array<{ Id: number; Title: string }>> {
    return this.getSiteGroups();
  }
}
