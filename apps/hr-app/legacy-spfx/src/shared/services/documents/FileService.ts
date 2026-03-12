import { SPFI } from "@pnp/sp";
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { getSP } from '../../config/pnpjsConfig'; 
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import "@pnp/sp/files";
import "@pnp/sp/folders";
import "@pnp/sp/fields";
import "@pnp/sp/site-users";

export interface FileRow {
  Name: string;
  ServerRelativeUrl: string;
  UniqueId: string;
  TimeCreated: string;
  TimeLastModified: string;
  Editor?: { Title?: string };
  Author?: { Title?: string };
  ListItemAllFields?: any;
}

export interface SignatureRow {
  Id: number;
  Created: string;
  Note?: string;
  SignedByTitle?: string;
  ImageServerRelativeUrl: string;
  DocumentServerRelativeUrl?: string;
}

interface ResolvedList {
  id: string;
  rootUrl: string;
  title?: string;
}

interface CurrentUser {
  id: number;
  title: string;
  loginName: string;
  email: string;
}

export type OrgWideStatus = 
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Overdue';

export interface SignatureProgress {
  total: number;
  signed: number;
  percentage: number;
  status: OrgWideStatus;
  remainingUsers: string[];
  signedUsers: string[];
}

export interface EmployeeInfo {
  alias: string;
  name: string;
  email: string;
}

export interface InitializationResult {
  success: boolean;
  message: string;
  folderPath?: string;
}

const FIELD_ALIASES: Record<string, string[]> = {
  category: ['Category', 'Category0', 'DocumentCategory'],
  description: ['Description', 'Description0', 'DocumentDescription', 'Notes'],
  department: ['Department', 'Department0', 'DocumentDepartment'],
  requiressignature: ['RequiresSignature', 'Requires_x0020_Signature', 'RequireSignature'],
  duedate: ['DueDate', 'Due_x0020_Date', 'DocumentDueDate'],
  owner: ['Owner', 'DocumentOwner', 'Document_x0020_Owner'],
  status: ['Status', 'DocumentStatus', 'Document_x0020_Status', 'SignatureStatus'],
  signed: ['Signed', 'IsSigned', 'Is_x0020_Signed', 'HasSignature'],
  relateddocument: ['RelatedDocument', 'Related_x0020_Document', 'DocumentReference', 'Document'],
  signedby: ['SignedBy', 'SignedBy0', 'Signed_x0020_By', 'Signer'],
  signatureimage: ['SignatureImage', 'Signature_x0020_Image', 'Image', 'FileRef'],
  documenttype: ['DocumentType', 'Document_x0020_Type', 'Type'],
  signatureprogress: ['SignatureProgress', 'Signature_x0020_Progress', 'Progress'],
  currentsigners: ['CurrentSigners', 'Current_x0020_Signers', 'SignedCount'],
  requiredsigners: ['RequiredSigners', 'Required_x0020_Signers', 'TotalSigners'],
  notsignedby: ['NotSignedBy', 'Not_x0020_Signed_x0020_By', 'PendingSigners'],
};

export default class FileService {
  public sp: SPFI;
  private _docsList?: ResolvedList;
  private _sigsList?: ResolvedList;
  private _docAssignmentsList?: ResolvedList | null;
  private _fieldCache: Record<string, string> = {};
  private _fieldsBatchLoaded = false;
  private _fieldTypeCache: Record<string, { InternalName: string; TypeAsString: string; AllowMultipleValues?: boolean }> = {};
  private _employeeCache?: EmployeeInfo[];
  private _employeeCacheTime?: number;
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private _companyDomain?: string;

  constructor(
    public context: WebPartContext,
    public libraryName: string = 'HR Documents',
    public signaturesListName: string = 'Signatures',
    companyDomain?: string
  ) {
    this.sp = getSP(context);
    this._companyDomain = companyDomain;
  }

  // ==================== UTILITY METHODS ====================

  public async getCurrentUser(): Promise<CurrentUser> {
    try {
      const user = await this.sp.web.currentUser();
      return {
        id: user.Id,
        title: user.Title,
        loginName: user.LoginName,
        email: user.Email
      };
    } catch (error) {
      console.error('[FileService] Error getting current user:', error);
      throw new Error('Failed to get current user information');
    }
  }

  public getLoginAlias(loginNameOrEmail: string): string {
    const claimsTrim = (loginNameOrEmail || '').split('|').pop() || '';
    const emailPart = claimsTrim.includes('@') ? claimsTrim.split('@')[0] : claimsTrim;
    return emailPart.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  public absoluteFileUrl(serverRelativeUrl: string): string {
    const webUrl = this.context.pageContext.web.absoluteUrl;
    const webRelativeUrl = this.context.pageContext.web.serverRelativeUrl;
    const siteUrl = webUrl.substring(0, webUrl.length - webRelativeUrl.length);
    return `${siteUrl}${serverRelativeUrl}`;
  }

  public viewerById(uniqueId: string): string {
    const id = uniqueId.startsWith('{') ? uniqueId : `{${uniqueId}}`;
    return `${this.context.pageContext.web.absoluteUrl}/_layouts/15/Doc.aspx?sourcedoc=${encodeURIComponent(id)}&action=embedview`;
  }

  public viewerByPath(serverRelativeUrl: string): string {
    const encodedUrl = encodeURIComponent(serverRelativeUrl);
    return `${this.context.pageContext.web.absoluteUrl}/_layouts/15/Doc.aspx?sourcedoc=${encodedUrl}&action=embedview`;
  }

  public officeAppsEmbed(serverRelativeUrl: string): string {
    const absoluteUrl = this.absoluteFileUrl(serverRelativeUrl);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteUrl)}`;
  }

  // ==================== LIST RESOLUTION ====================

  public async resolveDocumentLibrary(): Promise<ResolvedList> {
    if (this._docsList) return this._docsList;

    try {
      let list;
      try {
        list = await this.sp.web.lists.getByTitle(this.libraryName)
          .select('Id', 'Title', 'RootFolder/ServerRelativeUrl')
          .expand('RootFolder')();
      } catch {
        const commonNames = ['Documents', 'HR Documents', 'Document Library'];
        for (const name of commonNames) {
          try {
            list = await this.sp.web.lists.getByTitle(name)
              .select('Id', 'Title', 'RootFolder/ServerRelativeUrl')
              .expand('RootFolder')();
            break;
          } catch {
            continue;
          }
        }
      }

      if (!list) {
        throw new Error(`Document library '${this.libraryName}' not found`);
      }

      this._docsList = {
        id: list.Id,
        rootUrl: list.RootFolder.ServerRelativeUrl,
        title: list.Title
      };

      console.log('[FileService] Document library resolved:', this._docsList);
      return this._docsList;

    } catch (error: any) {
      console.error('[FileService] Error resolving document library:', error);
      throw new Error(`Cannot resolve document library: ${error.message}`);
    }
  }

  public async resolveDocuments(): Promise<ResolvedList> {
    return this.resolveDocumentLibrary();
  }

  public async ensureOrgWideMetadataFields(listId?: string): Promise<void> {
    try {
      const docs = listId ? { id: listId } : await this.resolveDocumentLibrary();
      const list = this.sp.web.lists.getById(docs.id);
      const fields = await list.fields.select('InternalName', 'Title')();
      const existing = new Set(fields.map(f => f.InternalName.toLowerCase()));

      const ensureText = async (name: string) => {
        if (!existing.has(name.toLowerCase())) {
          await list.fields.addText(name);
        }
      };
      const ensureNumber = async (name: string) => {
        if (!existing.has(name.toLowerCase())) {
          await list.fields.addNumber(name);
        }
      };

      await Promise.all([
        ensureText('SignedBy'),
        ensureText('NotSignedBy'),
        ensureText('AssignmentType'),
        ensureText('AssignTo'),
        ensureNumber('SignatureProgress'),
        ensureNumber('CurrentSigners'),
        ensureNumber('RequiredSigners')
      ]);

      console.log('[FileService] Org-wide metadata fields ensured');
    } catch (error) {
      console.warn('[FileService] Could not ensure org-wide metadata fields:', error);
    }
  }

  public async resolveSignaturesList(): Promise<ResolvedList> {
    if (this._sigsList) return this._sigsList;

    try {
      const list = await this.sp.web.lists.getByTitle(this.signaturesListName)
        .select('Id', 'Title', 'RootFolder/ServerRelativeUrl')
        .expand('RootFolder')();

      this._sigsList = {
        id: list.Id,
        rootUrl: list.RootFolder.ServerRelativeUrl,
        title: list.Title
      };

      console.log('[FileService] Signatures list resolved:', this._sigsList);
      return this._sigsList;

    } catch (error) {
      console.warn('[FileService] Signatures list not found, creating default reference');
      this._sigsList = {
        id: '',
        rootUrl: `${this.context.pageContext.web.serverRelativeUrl}/${this.signaturesListName}`,
        title: this.signaturesListName
      };
      return this._sigsList;
    }
  }

  // ==================== FIELD RESOLUTION ====================

  public async loadAllListFields(listId: string): Promise<void> {
    if (this._fieldsBatchLoaded) return;

    try {
      const fields = await this.sp.web.lists.getById(listId).fields
        .select('InternalName', 'Title', 'ReadOnlyField', 'FromBaseType')();

      fields.forEach(field => {
        const key = `${listId}_${field.Title.toLowerCase()}`;
        this._fieldCache[key] = field.InternalName;
        
        const internalKey = `${listId}_${field.InternalName.toLowerCase()}`;
        this._fieldCache[internalKey] = field.InternalName;
      });

      this._fieldsBatchLoaded = true;
      console.log(`[FileService] Batch loaded ${fields.length} field mappings`);
    } catch (error) {
      console.warn('[FileService] Error batch loading fields:', error);
    }
  }

  public async resolveFieldNameCached(listId: string, friendlyName: string): Promise<string> {
    const cacheKey = `${listId}_${friendlyName.toLowerCase()}`;
    
    if (this._fieldCache[cacheKey]) {
      return this._fieldCache[cacheKey];
    }

    await this.loadAllListFields(listId);
    
    if (this._fieldCache[cacheKey]) {
      return this._fieldCache[cacheKey];
    }

    console.warn(`[FileService] Field not found in cache: ${friendlyName}`);
    return friendlyName;
  }

  public async resolveFieldName(listId: string, friendlyName: string): Promise<string> {
    const cacheKey = `${listId}_${friendlyName.toLowerCase()}`;
    
    if (this._fieldCache[cacheKey]) {
      return this._fieldCache[cacheKey];
    }

    try {
      const fields = await this.sp.web.lists.getById(listId).fields
        .select('InternalName', 'Title')();

      let field = fields.find(f => 
        f.Title.toLowerCase() === friendlyName.toLowerCase() ||
        f.InternalName.toLowerCase() === friendlyName.toLowerCase()
      );

      if (!field) {
        const aliases = FIELD_ALIASES[friendlyName.toLowerCase()] || [];
        for (const alias of aliases) {
          field = fields.find(f => 
            f.Title.toLowerCase() === alias.toLowerCase() ||
            f.InternalName.toLowerCase() === alias.toLowerCase()
          );
          if (field) break;
        }
      }

      const internalName = field ? field.InternalName : friendlyName;
      this._fieldCache[cacheKey] = internalName;
      
      console.log(`[FileService] Field resolved: ${friendlyName} -> ${internalName}`);
      return internalName;

    } catch (error) {
      console.warn(`[FileService] Error resolving field ${friendlyName}:`, error);
      return friendlyName;
    }
  }

  public async resolveInternalName(listId: string, friendlyName: string): Promise<string> {
    return this.resolveFieldName(listId, friendlyName);
  }

  // ==================== FOLDER OPERATIONS ====================

  public async ensureUserFolder(userAlias: string): Promise<string> {
    const docs = await this.resolveDocumentLibrary();
    const baseUrl = docs.rootUrl;
    const userFolderUrl = `${baseUrl}/Employees/${userAlias}`;

    try {
      await this.sp.web.getFolderByServerRelativePath(userFolderUrl).select('Exists')();
      return userFolderUrl;
    } catch {
      try {
        await this.sp.web.folders.addUsingPath(userFolderUrl);
        console.log(`[FileService] Created user folder: ${userFolderUrl}`);
        return userFolderUrl;
      } catch (error: any) {
        console.warn('[FileService] Failed to create user folder:', error);
        return baseUrl;
      }
    }
  }

  /**
   * SIMPLIFIED: Ensures /Employees/All/Signatures/ folder exists
   * This is the single location for ALL org-wide signatures
   */
  public async ensureOrgWideFolder(): Promise<string> {
    const docs = await this.resolveDocumentLibrary();
    const baseUrl = docs.rootUrl;
    const allFolderUrl = `${baseUrl}/Employees/All`;
    const signaturesFolderUrl = `${allFolderUrl}/Signatures`;

    try {
      // Check if All folder exists
      await this.sp.web.getFolderByServerRelativePath(allFolderUrl).select('Exists')();
      console.log(`[FileService] All folder exists: ${allFolderUrl}`);
    } catch {
      try {
        // Create Employees folder if needed
        const employeesFolderUrl = `${baseUrl}/Employees`;
        try {
          await this.sp.web.getFolderByServerRelativePath(employeesFolderUrl).select('Exists')();
        } catch {
          await this.sp.web.folders.addUsingPath(employeesFolderUrl);
          console.log(`[FileService] Created Employees folder: ${employeesFolderUrl}`);
        }

        // Create All folder
        await this.sp.web.folders.addUsingPath(allFolderUrl);
        console.log(`[FileService] Created All folder: ${allFolderUrl}`);
      } catch (error: any) {
        console.warn('[FileService] Failed to create All folder:', error);
        return baseUrl;
      }
    }

    // Ensure Signatures subfolder exists
    try {
      await this.sp.web.getFolderByServerRelativePath(signaturesFolderUrl).select('Exists')();
      console.log(`[FileService] Signatures folder exists: ${signaturesFolderUrl}`);
    } catch {
      try {
        await this.sp.web.folders.addUsingPath(signaturesFolderUrl);
        console.log(`[FileService] ✅ Created Signatures folder: ${signaturesFolderUrl}`);
      } catch (error: any) {
        console.warn('[FileService] Failed to create Signatures folder:', error);
      }
    }

    return allFolderUrl;
  }

  // ==================== FILE OPERATIONS ====================

  public async getFilesInFolder(folderServerRelativeUrl: string): Promise<FileRow[]> {
    try {
      const files = await this.sp.web.getFolderByServerRelativePath(folderServerRelativeUrl)
        .files
        .select(
          'Name', 
          'ServerRelativeUrl', 
          'UniqueId', 
          'TimeCreated', 
          'TimeLastModified',
          'Author/Title',
          'Editor/Title'
        )
        .expand('ListItemAllFields', 'Author', 'Editor')();

      return files.map((file: any) => ({
        Name: file.Name,
        ServerRelativeUrl: file.ServerRelativeUrl,
        UniqueId: file.UniqueId,
        TimeCreated: file.TimeCreated,
        TimeLastModified: file.TimeLastModified,
        Author: file.Author ? { Title: file.Author.Title } : undefined,
        Editor: file.Editor ? { Title: file.Editor.Title } : undefined,
        ListItemAllFields: file.ListItemAllFields
      }));

    } catch (error: any) {
      if (error.message?.includes('does not exist') || 
          error.message?.includes('not found') ||
          error.status === 404) {
        console.warn(`[FileService] Folder not found or empty: ${folderServerRelativeUrl}`);
        return [];
      }
      
      console.error('[FileService] Error getting files in folder:', error);
      throw new Error(`Failed to get files in folder: ${error.message}`);
    }
  }

  public async getFileItemByUniqueId(listId: string, uniqueId: string): Promise<any> {
    try {
      const cleanGuid = uniqueId.replace(/[{}]/g, '');
      
      const items = await this.sp.web.lists.getById(listId).items
        .select('Id', 'UniqueId')
        .filter(`UniqueId eq guid'${cleanGuid}'`)
        .top(1)();
      
      if (items.length === 0) {
        throw new Error(`No item found with UniqueId: ${uniqueId}`);
      }
      
      return items[0];
    } catch (error) {
      console.error('[FileService] Error finding item by UniqueId:', error);
      throw error;
    }
  }

  public async getFileItemByUrl(listId: string, serverRelativeUrl: string): Promise<any> {
    try {
      const fileItem = await this.sp.web
        .getFileByServerRelativePath(serverRelativeUrl)
        .listItemAllFields.select('Id', 'UniqueId')();
      if (!fileItem?.Id) throw new Error(`No item found for URL: ${serverRelativeUrl}`);
      return fileItem;
    } catch (error) {
      console.error('[FileService] Error finding item by URL:', error);
      throw error;
    }
  }

  public async updateFileMetadataSafe(
    serverRelativeUrl: string,
    metadata: Record<string, any>,
    uniqueId?: string
  ): Promise<void> {
    if (!uniqueId) throw new Error('UniqueId is required for metadata updates');

    try {
      const docs = await this.resolveDocumentLibrary();

      const fields = await this.sp.web.lists.getById(docs.id).fields
        .select('InternalName', 'ReadOnlyField', 'FromBaseType', 'TypeAsString')
        .filter('ReadOnlyField eq false and FromBaseType eq false')();
      
      const writableInternalNames = fields
        .filter(f => 
          !f.ReadOnlyField && 
          !f.FromBaseType &&
          !f.InternalName.startsWith('_') &&
          f.InternalName !== 'ExtendedDescription' &&
          f.InternalName !== 'ContentType' &&
          f.InternalName !== 'ContentTypeId' &&
          !['Created', 'Modified', 'Author', 'Editor', 'ID', 'UniqueId', 'GUID'].includes(f.InternalName)
        )
        .map(f => f.InternalName.toLowerCase());

      const resolvedMetadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(metadata)) {
        try {
          const internalName = await this.resolveFieldName(docs.id, key);
          if (writableInternalNames.includes(internalName.toLowerCase())) {
            resolvedMetadata[internalName] = value;
          } else {
            console.warn(`[FileService] Skipping non-writable field: ${internalName}`);
          }
        } catch (fieldError) {
          console.warn(`[FileService] Could not resolve field: ${key}`, fieldError);
        }
      }

      if (Object.keys(resolvedMetadata).length === 0) {
        console.warn('[FileService] No valid fields to update');
        return;
      }

      const item = await this.getFileItemByUrl(docs.id, serverRelativeUrl);

      await this.sp.web.lists.getById(docs.id)
        .items.getById(item.Id)
        .update(resolvedMetadata);

      console.log('[FileService] File metadata updated successfully');

    } catch (error: any) {
      console.error('[FileService] Error updating file metadata safely:', error);
      throw new Error(`Failed to update file metadata: ${error.message}`);
    }
  }

  public async updateFileMetadata(
    serverRelativeUrl: string, 
    metadata: Record<string, any>, 
    uniqueId?: string
  ): Promise<void> {
    if (!uniqueId) {
      throw new Error('UniqueId is required for metadata updates');
    }

    try {
      const docs = await this.resolveDocumentLibrary();
      
      const resolvedMetadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(metadata)) {
        const internalName = await this.resolveFieldName(docs.id, key);
        resolvedMetadata[internalName] = value;
      }

      const item = await this.getFileItemByUrl(docs.id, serverRelativeUrl);

      await this.sp.web.lists.getById(docs.id)
        .items.getById(item.Id)
        .update(resolvedMetadata);

      console.log('[FileService] File metadata updated successfully');

    } catch (error: any) {
      console.error('[FileService] Error updating file metadata:', error);
      throw new Error(`Failed to update file metadata: ${error.message}`);
    }
  }

  // ==================== ORGANIZATION-WIDE DOCUMENT METHODS (SIMPLIFIED) ====================

  public isOrgWideDocument(serverRelativeUrl: string): boolean {
    return serverRelativeUrl.includes('/Employees/All/') && !serverRelativeUrl.includes('/Signatures/');
  }

  /**
   * Get all active employees (filtered by company domain)
   */
  public async getAllActiveEmployees(): Promise<EmployeeInfo[]> {
    const now = Date.now();
    if (this._employeeCache && this._employeeCacheTime && (now - this._employeeCacheTime < this.CACHE_DURATION)) {
      console.log('[FileService] Returning cached employees');
      return this._employeeCache;
    }

    try {
      console.log('[FileService] Fetching all active company employees...');
      
      const users = await this.sp.web.siteUsers();
      
      const companyDomain = this._companyDomain || (() => {
        const currentUserEmail = this.context.pageContext.user.email || '';
        return currentUserEmail.includes('@') 
          ? currentUserEmail.split('@')[1].toLowerCase() 
          : 'vdacl.ca';
      })();
      
      console.log(`[FileService] Filtering by company domain: @${companyDomain}`);
      
      const employees = users
        .filter(u => {
          if (!u.Email || u.Email.trim() === '') return false;
          if (!u.Email.toLowerCase().endsWith(`@${companyDomain}`)) return false;
          if (u.IsHiddenInUI) return false;
          if (u.Title.includes('System Account')) return false;
          if (u.Title.includes('SharePoint')) return false;
          if (u.Title.includes('app@sharepoint')) return false;
          if (u.LoginName?.startsWith('i:0#.f|membership|app@')) return false;
          
          return true;
        })
        .map(u => ({
          alias: this.getLoginAlias(u.LoginName || u.Email),
          name: u.Title,
          email: u.Email
        }));

      this._employeeCache = employees;
      this._employeeCacheTime = now;

      console.log(`[FileService] ✅ Loaded ${employees.length} active @${companyDomain} employees`);
      return employees;

    } catch (error) {
      console.error('[FileService] Error getting active employees:', error);
      if (this._employeeCache) {
        console.warn('[FileService] Using expired employee cache due to error');
        return this._employeeCache;
      }
      
      const currentUserEmail = this.context.pageContext.user.email || '';
      const companyDomain = this._companyDomain || 
        (currentUserEmail.includes('@') ? currentUserEmail.split('@')[1].toLowerCase() : 'vdacl.ca');
      
      if (currentUserEmail.toLowerCase().endsWith(`@${companyDomain}`)) {
        return [{
          alias: this.getLoginAlias(this.context.pageContext.user.loginName || currentUserEmail),
          name: this.context.pageContext.user.displayName,
          email: currentUserEmail
        }];
      }
      
      throw new Error('Failed to get employee list');
    }
  }

  public clearEmployeeCache(): void {
    this._employeeCache = undefined;
    this._employeeCacheTime = undefined;
    console.log('[FileService] Employee cache cleared');
  }

  public setCompanyDomain(domain: string): void {
    this._companyDomain = domain.toLowerCase().replace('@', '');
    this.clearEmployeeCache();
    console.log(`[FileService] Company domain set to: @${this._companyDomain}`);
  }

  /**
   * SIMPLIFIED: Initialize organization-wide document
   * Just ensures the Signatures folder exists - works for ALL documents!
   */
  public async initializeOrgWideDocument(documentName: string): Promise<InitializationResult> {
    try {
      console.log('[FileService] Initializing org-wide document (simplified):', documentName);
      
      // Simply ensure the Signatures folder exists
      const allFolder = await this.ensureOrgWideFolder();
      const signaturesFolder = `${allFolder}/Signatures`;
      
      console.log(`[FileService] ✅ Signatures folder ready: ${signaturesFolder}`);
      
      return {
        success: true,
        message: 'Document initialized successfully',
        folderPath: signaturesFolder
      };
    } catch (error: any) {
      console.error('[FileService] Initialization error:', error);
      return {
        success: false,
        message: error.message || 'Failed to initialize document'
      };
    }
  }

  /**
   * SIMPLIFIED: Check if org-wide system is initialized
   * Just checks if /Employees/All/Signatures/ exists
   */
  public async isOrgWideDocumentInitialized(documentName: string): Promise<boolean> {
    try {
      const docs = await this.resolveDocumentLibrary();
      const signaturesFolder = `${docs.rootUrl}/Employees/All/Signatures`;
      
      await this.sp.web.getFolderByServerRelativePath(signaturesFolder).select('Exists')();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * SIMPLIFIED: Check if user has signed
   * Looks for file: {userAlias}_{documentName}_signature.png in /Employees/All/Signatures/
   */
  public async hasUserSignedOrgWideDoc(
    documentName: string,
    userAlias: string
  ): Promise<boolean> {
    try {
      const docs = await this.resolveDocumentLibrary();
      const signaturesFolder = `${docs.rootUrl}/Employees/All/Signatures`;
      
      const cleanDocName = documentName.replace(/\.[^/.]+$/, '');
      const expectedFileName = `${userAlias}_${cleanDocName}_signature.png`;
      
      await this.sp.web
        .getFileByServerRelativePath(`${signaturesFolder}/${expectedFileName}`)
        .select('Name')();
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * SIMPLIFIED: Save org-wide signature
   * Saves to /Employees/All/Signatures/{userAlias}_{documentName}_signature.png
   */
  public async saveOrgWideSignature(
    docServerRelativeUrl: string,
    documentName: string,
    pngDataUrl: string,
    userAlias: string,
    userName: string,
    note?: string
  ): Promise<void> {
    try {
      console.log('[FileService] Starting org-wide signature save (simplified)...');
      
      // Check if user already signed
      const alreadySigned = await this.hasUserSignedOrgWideDoc(documentName, userAlias);
      if (alreadySigned) {
        throw new Error('You have already signed this document');
      }

      // Check if system is initialized
      const isInitialized = await this.isOrgWideDocumentInitialized(documentName);
      if (!isInitialized) {
        throw new Error('This document has not been initialized yet. Please contact an administrator.');
      }

      const docs = await this.resolveDocumentLibrary();
      const signaturesFolder = `${docs.rootUrl}/Employees/All/Signatures`;
      
      // Convert Base64 to Blob
      const base64 = pngDataUrl.split(',')[1];
      if (!base64) throw new Error('Invalid signature data');
      
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'image/png' });
      
      // Create filename: userAlias_documentName_signature.png
      const cleanDocName = documentName.replace(/\.[^/.]+$/, '');
      const signatureFileName = `${userAlias}_${cleanDocName}_signature.png`;
      
      console.log(`[FileService] Uploading to: ${signaturesFolder}/${signatureFileName}`);
      
      // Upload signature file
      await this.sp.web
        .getFolderByServerRelativePath(signaturesFolder)
        .files.addUsingPath(signatureFileName, blob, { Overwrite: false });
      
      console.log(`[FileService] ✅ Org-wide signature saved: ${signatureFileName}`);
      
      // Update document progress
      await this.updateOrgWideDocumentProgress(docServerRelativeUrl, documentName);
      
      // Check completion
      const progress = await this.getOrgWideSignatureProgress(docServerRelativeUrl, documentName);
      if (progress.status === 'Completed') {
        console.log('[FileService] 🎉 All employees have signed!');
      } else {
        console.log(`[FileService] Progress: ${progress.signed}/${progress.total} (${progress.percentage}%)`);
      }
      
    } catch (error: any) {
      console.error('[FileService] Error saving org-wide signature:', error);
      throw new Error(`Failed to save signature: ${error.message}`);
    }
  }

  /**
   * SIMPLIFIED: Get signature progress
   * Scans /Employees/All/Signatures/ for files matching pattern
   */
  public async getOrgWideSignatureProgress(
    docServerRelativeUrl: string,
    documentName: string
  ): Promise<SignatureProgress> {
    try {
      console.log('[FileService] Getting org-wide signature progress...');

      const assignmentEntries = await this.getDocumentAssignmentsByUrl(docServerRelativeUrl);
      if (assignmentEntries.length > 0) {
        const totalEmployees = assignmentEntries.length;
        const signedUsers = assignmentEntries
          .filter(entry => String(entry.Status || '').toLowerCase() === 'completed')
          .map(entry => entry.AssignedTo?.Title || 'Unknown');
        const remainingUsers = assignmentEntries
          .filter(entry => String(entry.Status || '').toLowerCase() !== 'completed')
          .map(entry => entry.AssignedTo?.Title || 'Unknown');

        const signedCount = signedUsers.length;
        const percentage = totalEmployees
          ? Math.round((signedCount / totalEmployees) * 100)
          : 0;

        let status: OrgWideStatus = 'Not Started';
        if (percentage === 100) {
          status = 'Completed';
        } else if (percentage > 0) {
          try {
            const docs = await this.resolveDocumentLibrary();
            const docItem = await this.getFileItemByUrl(docs.id, docServerRelativeUrl);
            const dueDate = docItem?.DueDate;
            if (dueDate && new Date(dueDate) < new Date()) {
              status = 'Overdue';
            } else {
              status = 'In Progress';
            }
          } catch {
            status = 'In Progress';
          }
        }

        return {
          total: totalEmployees,
          signed: signedCount,
          percentage,
          status,
          remainingUsers,
          signedUsers
        };
      }

      const allEmployees = await this.getAllActiveEmployees();
      const totalEmployees = allEmployees.length;

      if (totalEmployees === 0) {
        return {
          total: 0,
          signed: 0,
          percentage: 0,
          status: 'Not Started',
          remainingUsers: [],
          signedUsers: []
        };
      }

      const docs = await this.resolveDocumentLibrary();
      const signaturesFolder = `${docs.rootUrl}/Employees/All/Signatures`;
      const cleanDocName = documentName.replace(/\.[^/.]+$/, '');
      
      // Get all signature files
      let signatureFiles: any[] = [];
      try {
        signatureFiles = await this.sp.web
          .getFolderByServerRelativePath(signaturesFolder)
          .files
          .select('Name')();
      } catch (error) {
        console.warn('[FileService] Signatures folder is empty or not accessible');
      }

      // Filter files matching this document
      const matchingSignatures = signatureFiles.filter(f => 
        f.Name.includes(`_${cleanDocName}_signature.png`)
      );

      // Extract user aliases from filenames
      const signedAliases = matchingSignatures.map(f => {
        const match = f.Name.match(/^(.+?)_.*_signature\.png$/);
        return match ? match[1] : null;
      }).filter(Boolean);

      // Match aliases to employee names
      const signedUsers: string[] = [];
      const remainingUsers: string[] = [];

      allEmployees.forEach(employee => {
        if (signedAliases.includes(employee.alias)) {
          signedUsers.push(employee.name);
        } else {
          remainingUsers.push(employee.name);
        }
      });

      const signedCount = signedUsers.length;
      const percentage = Math.round((signedCount / totalEmployees) * 100);

      let status: OrgWideStatus = 'Not Started';
      if (percentage === 100) {
        status = 'Completed';
      } else if (percentage > 0) {
        // Check if overdue
        try {
          const docItem = await this.getFileItemByUrl(docs.id, docServerRelativeUrl);
          const dueDate = docItem?.DueDate;
          if (dueDate && new Date(dueDate) < new Date()) {
            status = 'Overdue';
          } else {
            status = 'In Progress';
          }
        } catch {
          status = 'In Progress';
        }
      }

      console.log(`[FileService] Progress: ${signedCount}/${totalEmployees} (${percentage}%)`);

      return {
        total: totalEmployees,
        signed: signedCount,
        percentage,
        status,
        remainingUsers,
        signedUsers
      };
    } catch (error) {
      console.error('[FileService] Error getting org-wide progress:', error);
      return {
        total: 0,
        signed: 0,
        percentage: 0,
        status: 'Not Started',
        remainingUsers: [],
        signedUsers: []
      };
    }
  }

  private async updateOrgWideDocumentProgress(
    docServerRelativeUrl: string,
    documentName: string
  ): Promise<void> {
    try {
      const docs = await this.resolveDocumentLibrary();
      const progress = await this.getOrgWideSignatureProgress(docServerRelativeUrl, documentName);

      const signedBy = progress.signedUsers.join('; ');
      const notSignedBy = progress.remainingUsers.join('; ');

      const docItem = await this.getFileItemByUrl(docs.id, docServerRelativeUrl);

      await this.updateFileMetadataSafe(
        docServerRelativeUrl,
        {
          Status: progress.status,
          SignatureProgress: progress.percentage,
          CurrentSigners: progress.signed,
          RequiredSigners: progress.total,
          SignedBy: signedBy,
          NotSignedBy: notSignedBy
        },
        docItem.UniqueId
      );

      console.log(`[FileService] Updated document progress: ${progress.percentage}% (${progress.signed}/${progress.total})`);
      
    } catch (error) {
      console.warn('[FileService] Could not update document progress:', error);
    }
  }

  public async getFieldType(
    listId: string,
    friendlyName: string
  ): Promise<{ InternalName: string; TypeAsString: string; AllowMultipleValues?: boolean } | null> {
    const cacheKey = `${listId}_${friendlyName.toLowerCase()}_type`;
    if (this._fieldTypeCache[cacheKey]) {
      return this._fieldTypeCache[cacheKey];
    }

    try {
      const resolvedName = await this.resolveFieldName(listId, friendlyName);
      const field = await this.sp.web.lists
        .getById(listId)
        .fields.getByInternalNameOrTitle(resolvedName)
        .select('InternalName', 'TypeAsString', 'AllowMultipleValues')();

      const info = {
        InternalName: field.InternalName,
        TypeAsString: field.TypeAsString,
        AllowMultipleValues: (field as any).AllowMultipleValues
      };
      this._fieldTypeCache[cacheKey] = info;
      return info;
    } catch (error) {
      console.warn('[FileService] Unable to resolve field type:', friendlyName, error);
      return null;
    }
  }

  public async getLookupIdByValue(
    listId: string,
    fieldInternalOrTitle: string,
    value: string
  ): Promise<number | null> {
    try {
      const field = await this.sp.web.lists
        .getById(listId)
        .fields.getByInternalNameOrTitle(fieldInternalOrTitle)
        .select('LookupList', 'LookupField')();

      const lookupListId = (field as any).LookupList as string | undefined;
      if (!lookupListId || lookupListId === '00000000-0000-0000-0000-000000000000') {
        return null;
      }

      const lookupField = ((field as any).LookupField as string | undefined) || 'Title';
      const safeValue = value.replace(/'/g, "''");
      const items = await this.sp.web.lists
        .getById(lookupListId)
        .items.select('Id', lookupField)
        .filter(`${lookupField} eq '${safeValue}'`)
        .top(1)();

      return items[0]?.Id ?? null;
    } catch (error) {
      console.warn('[FileService] Unable to resolve lookup value:', fieldInternalOrTitle, value, error);
      return null;
    }
  }

  public async resolveDocumentAssignmentsList(): Promise<ResolvedList | null> {
    if (this._docAssignmentsList !== undefined) return this._docAssignmentsList;

    try {
      const list = await this.sp.web.lists.getByTitle('DocumentAssignments')
        .select('Id', 'Title', 'RootFolder/ServerRelativeUrl')
        .expand('RootFolder')();

      this._docAssignmentsList = {
        id: list.Id,
        rootUrl: list.RootFolder.ServerRelativeUrl,
        title: list.Title
      };

      return this._docAssignmentsList;
    } catch (error) {
      console.warn('[FileService] DocumentAssignments list not found:', error);
      this._docAssignmentsList = null;
      return null;
    }
  }

  public async getDocumentAssignmentsByUrl(
    docServerRelativeUrl: string
  ): Promise<Array<{ Id: number; Status?: string; CompletedOn?: string; AssignedTo?: { Id: number; Title: string } }>> {
    const list = await this.resolveDocumentAssignmentsList();
    if (!list) return [];

    const safeUrl = docServerRelativeUrl.replace(/'/g, "''");
    const items = await this.sp.web.lists
      .getByTitle('DocumentAssignments')
      .items
      .select('Id', 'Status', 'CompletedOn', 'AssignedTo/Id', 'AssignedTo/Title')
      .expand('AssignedTo')
      .filter(`DocumentUrl eq '${safeUrl}'`)
      .top(2000)();

    return items.map(item => ({
      Id: item.Id,
      Status: item.Status,
      CompletedOn: item.CompletedOn,
      AssignedTo: item.AssignedTo ? { Id: item.AssignedTo.Id, Title: item.AssignedTo.Title } : undefined
    }));
  }

  // ==================== REGULAR SIGNATURE OPERATIONS ====================

  public async saveSignatureToDocument(
    docServerRelativeUrl: string,
    pngDataUrl: string,
    note?: string
  ): Promise<void> {
    try {
      console.log('[FileService] Starting signature save process...');
      
      const docs = await this.resolveDocumentLibrary();
      const sigs = await this.resolveSignaturesList();
      
      const currentUser = await this.getCurrentUser();
      console.log('[FileService] Current user:', currentUser.title);

      const base64 = pngDataUrl.split(",")[1];
      if (!base64) throw new Error("Invalid signature data");

      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });

      const docItem = await this.sp.web
        .getFileByServerRelativePath(docServerRelativeUrl)
        .listItemAllFields.select("Id", "FileLeafRef")();

      if (!docItem?.Id) throw new Error("Document item not found");

      const timestamp = Date.now();
      const signatureFileName = `Signature_${docItem.FileLeafRef}_${timestamp}.png`;
      console.log('[FileService] Uploading signature:', signatureFileName);

      const uploadResult = await this.sp.web
        .getFolderByServerRelativePath(sigs.rootUrl)
        .files.addUsingPath(signatureFileName, blob, { Overwrite: true });

      console.log("[FileService] ✅ Signature uploaded successfully");

      if (sigs.id) {
        try {
          const signatureFile = await this.sp.web
            .getFileByServerRelativePath(uploadResult.ServerRelativeUrl)
            .listItemAllFields();

          const signedByField = await this.resolveFieldName(sigs.id, "SignedBy");

          const signatureUpdateData: Record<string, any> = {
            Title: `Signature for ${docItem.FileLeafRef}`,
            DocumentServerRelativeUrl: docServerRelativeUrl
          };

          if (note?.trim()) {
            signatureUpdateData.Note = note.trim();
          }

          if (currentUser.title) {
            signatureUpdateData[signedByField] = currentUser.title;
          }

          await this.sp.web.lists.getById(sigs.id)
            .items.getById(signatureFile.Id)
            .update(signatureUpdateData);

          console.log("[FileService] Signature metadata updated");
        } catch (metaError) {
          console.warn("[FileService] Could not update signature metadata:", metaError);
        }
      }

      const signatureField = await this.resolveFieldName(docs.id, "SignatureImage");
      const statusField = await this.resolveFieldName(docs.id, "Status");
      const signedField = await this.resolveFieldName(docs.id, "Signed");
      const noteField = await this.resolveFieldName(docs.id, "Note");

      const documentUpdateData: Record<string, any> = {
        [signatureField]: {
          Url: uploadResult.ServerRelativeUrl,
          Description: `Signature for ${docItem.FileLeafRef}`
        },
        [statusField]: "Signed",
        [signedField]: true
      };

      if (note?.trim()) {
        documentUpdateData[noteField] = note.trim();
      }

      await this.sp.web.lists.getById(docs.id)
        .items.getById(docItem.Id)
        .update(documentUpdateData);

      console.log("[FileService] ✅ Document updated with signature reference");

    } catch (error: any) {
      console.error("[FileService] Error saving signature:", error);
      throw new Error(`Failed to save signature: ${error.message}`);
    }
  }

  public hasDocumentSignature(file: FileRow): boolean {
    const signature = this.getDocumentSignature(file);
    return signature !== null;
  }

  public getDocumentSignature(file: FileRow): { url: string; signedBy: string; signedDate: string; note?: string } | null {
    const fields = file.ListItemAllFields || {};
    
    const signatureData = fields['Signature'] || fields['SignatureImage'] || fields['Signature_x0020_Image'];
    
    if (!signatureData) return null;
    
    if (typeof signatureData === 'string') {
      return {
        url: signatureData,
        signedBy: file.Author?.Title || 'Unknown',
        signedDate: file.TimeLastModified,
        note: fields['Note'] || ''
      };
    } else if (signatureData && signatureData.Url) {
      return {
        url: signatureData.Url,
        signedBy: file.Author?.Title || 'Unknown', 
        signedDate: file.TimeLastModified,
        note: signatureData.Description || fields['Note'] || ''
      };
    }
    
    return null;
  }
}
