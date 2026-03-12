import * as React from 'react';
import { useContext } from 'react';
import { 
  useQuery, 
  useMutation, 
  useQueryClient,
  UseQueryResult
} from '@tanstack/react-query';
import { AppContext } from '../App';
import styles from './Documents.module.scss';
import { 
  Search, Filter, Eye, FileText, FileSpreadsheet, FileImage, 
  Download, Calendar, User, Clock, Tag, X, Save, RefreshCw, 
  Edit, FileSignature as Signature, Trash2, ExternalLink, 
  AlertCircle, CheckCircle2, ChevronLeft, ChevronRight as ChevronRightIcon, 
  XCircle, Users, TrendingUp, Upload 
} from 'lucide-react';

import FileService, { FileRow } from '../../../../shared/services/documents/FileService';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { categoryOptions, departmentOptions } from '../../constants';
import { MultiSelectUsers } from '../tasks/MultiSelectUsers';
import { SharePointServiceFactory } from '../../../../shared/services';
import { UserRole } from '../../../../shared/models';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

interface Props {
  libraryUrl?: string;
  signaturesUrl?: string;
  companyDomain?: string;
}

interface ResolvedFields {
  Category: string;
  Description: string;
  Department: string;
  DueDate: string;
  RequiresSignature: string;
  SignatureImage: string;
  Status: string;
  Signed: string;
  SignedBy: string;
  NotSignedBy: string;
  DocumentType: string;
  SignatureProgress: string;
  CurrentSigners: string;
  RequiredSigners: string;
  RelatedDocument: string;
  AssignmentType: string;
  AssignTo: string;
}

interface FilterOption {
  id: string;
  label: string;
  count: number;
  color?: string;
  type?: 'category' | 'status' | 'priority';
}

interface DocumentProperties {
  description: string;
  department: string;
  category: string;
  dueDate: string;
  requiresSignature: boolean;
  signatureImage: string;
  status: string;
}

interface SignatureData {
  url: string;
  signedBy: string;
  signedDate: string;
  note?: string;
}

type AssignmentType = 'Individual' | 'Team' | 'Global';

interface UploadFormState {
  description: string;
  department: string;
  category: string;
  dueDate: string;
  requiresSignature: boolean;
  assignmentType: AssignmentType;
  assignToIds: number[];
}

type PropertiesAction =
  | { type: 'setFile'; payload: FileRow }
  | { type: 'update'; field: keyof DocumentProperties; value: any }
  | { type: 'reset' };

// ============================================================================
// QUERY KEYS FACTORY
// ============================================================================

const queryKeys = {
  all: ['documents'] as const,
  currentUser: () => [...queryKeys.all, 'currentUser'] as const,
  lists: () => [...queryKeys.all, 'lists'] as const,
  documentsList: () => [...queryKeys.lists(), 'documents'] as const,
  signaturesList: () => [...queryKeys.lists(), 'signatures'] as const,
  fields: () => [...queryKeys.all, 'fields'] as const,
  listFields: (listId: string) => [...queryKeys.fields(), listId] as const,
  folders: () => [...queryKeys.all, 'folders'] as const,
  userFolder: (alias: string) => [...queryKeys.folders(), alias] as const,
  files: () => [...queryKeys.all, 'files'] as const,
  folderFiles: (folderUrl: string) => [...queryKeys.files(), folderUrl] as const,
  signatures: () => [...queryKeys.all, 'signatures'] as const,
  docSignatures: (docUrl: string) => [...queryKeys.signatures(), docUrl] as const,
  orgWideProgress: (docUrl: string, docName: string) => [...queryKeys.all, 'orgWideProgress', docUrl, docName] as const,
  employees: () => [...queryKeys.all, 'employees'] as const,
};

// ============================================================================
// CONSTANTS
// ============================================================================

const ITEMS_PER_PAGE = 5;

// ============================================================================
// CUSTOM HOOKS - DATA FETCHING
// ============================================================================

function useCurrentUser(api: FileService) {
  return useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: () => api.getCurrentUser(),
    staleTime: Infinity,
    cacheTime: Infinity,
    retry: 2,
  });
}

function useDocumentLibrary(api: FileService) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.documentsList(),
    queryFn: () => api.resolveDocumentLibrary(),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: 2,
  });

  React.useEffect(() => {
    if (query.data) {
      void queryClient.prefetchQuery({
        queryKey: queryKeys.signaturesList(),
        queryFn: () => api.resolveSignaturesList(),
        staleTime: 10 * 60 * 1000,
      });
    }
  }, [query.data, queryClient, api]);

  return query;
}

function useListFields(api: FileService, listId: string | undefined): UseQueryResult<ResolvedFields> {
  return useQuery({
    queryKey: queryKeys.listFields(listId || ''),
    queryFn: async () => {
      if (!listId) throw new Error('No list ID provided');

      console.log('[useListFields] Loading fields for list:', listId);

      await api.loadAllListFields(listId);

      const [
        Category,
        Description,
        Department,
        DueDate,
        RequiresSignature,
        Status,
        Signed,
        SignatureImage,
        DocumentType,
        SignatureProgress,
        CurrentSigners,
        RequiredSigners,
        SignedBy,
        NotSignedBy,
        RelatedDocument,
        AssignmentType,
        AssignTo,
      ] = await Promise.all([
      api.resolveFieldNameCached(listId, 'Category'),
      api.resolveFieldNameCached(listId, 'Description'),
      api.resolveFieldNameCached(listId, 'Department'),
      api.resolveFieldNameCached(listId, 'DueDate'),
      api.resolveFieldNameCached(listId, 'RequiresSignature'),
      api.resolveFieldNameCached(listId, 'Status'),
      api.resolveFieldNameCached(listId, 'Signed'),
      api.resolveFieldNameCached(listId, 'SignatureImage'),
      api.resolveFieldNameCached(listId, 'DocumentType'),
      api.resolveFieldNameCached(listId, 'SignatureProgress'),
      api.resolveFieldNameCached(listId, 'CurrentSigners'),
      api.resolveFieldNameCached(listId, 'RequiredSigners'),
      api.resolveFieldNameCached(listId, 'SignedBy'),
      api.resolveFieldNameCached(listId, 'NotSignedBy'),
      api.resolveFieldNameCached(listId, 'RelatedDocument'),
      api.resolveFieldNameCached(listId, 'AssignmentType'),
      api.resolveFieldNameCached(listId, 'AssignTo'),
    ]);

      const resolvedFields = {
        Category: Category ?? 'Category',
        Description: Description ?? 'Description',
        Department: Department ?? 'Department',
        DueDate: DueDate ?? 'DueDate',
        RequiresSignature: RequiresSignature ?? 'RequiresSignature',
        SignatureImage: SignatureImage ?? 'SignatureImage',
        Status: Status ?? 'Status',
        Signed: Signed ?? 'Signed',
        SignedBy: SignedBy ?? 'SignedBy',
        NotSignedBy: NotSignedBy ?? 'NotSignedBy',
        DocumentType: DocumentType ?? 'DocumentType',
        SignatureProgress: SignatureProgress ?? 'SignatureProgress',
        CurrentSigners: CurrentSigners ?? 'CurrentSigners',
        RequiredSigners: RequiredSigners ?? 'RequiredSigners',
        RelatedDocument: RelatedDocument ?? 'RelatedDocument',
        AssignmentType: AssignmentType ?? 'AssignmentType',
        AssignTo: AssignTo ?? 'AssignTo',
      };

      console.log('[useListFields] Fields resolved:', resolvedFields);
      return resolvedFields;
    },
    enabled: !!listId,
    staleTime: 15 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    retry: 2,
  });
}

function useUserFolder(api: FileService, userAlias: string | undefined) {
  return useQuery({
    queryKey: queryKeys.userFolder(userAlias || ''),
    queryFn: async () => {
      if (!userAlias) throw new Error('No user alias provided');
      console.log('[useUserFolder] Ensuring folder for:', userAlias);
      return api.ensureUserFolder(userAlias);
    },
    enabled: !!userAlias,
    staleTime: 5 * 60 * 1000,
    cacheTime: 15 * 60 * 1000,
    retry: 2,
  });
}

function useFiles(api: FileService, folderUrl: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.folderFiles(folderUrl || ''),
    queryFn: async () => {
      if (!folderUrl) throw new Error('No folder URL provided');
      console.log('[useFiles] Fetching files from:', folderUrl);
      const files = await api.getFilesInFolder(folderUrl);
      console.log('[useFiles] Files loaded:', files.length);
      return files;
    },
    enabled: !!folderUrl && enabled,
    staleTime: 30 * 1000,
    cacheTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchInterval: 60 * 1000,
    retry: 1,
  });
}

function useOrgWideProgress(
  api: FileService,
  file: FileRow | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.orgWideProgress(
      file?.ServerRelativeUrl || '',
      file?.Name || ''
    ),
    queryFn: async () => {
      if (!file) throw new Error('No file provided');
      return api.getOrgWideSignatureProgress(file.ServerRelativeUrl, file.Name);
    },
    enabled: enabled && !!file,
    staleTime: 30 * 1000,
    cacheTime: 2 * 60 * 1000,
    refetchInterval: 45 * 1000,
  });
}

// ============================================================================
// CUSTOM HOOKS - MUTATIONS
// ============================================================================

function useUpdateMetadata(api: FileService, folderUrl: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      serverRelativeUrl,
      metadata,
      uniqueId,
    }: {
      serverRelativeUrl: string;
      metadata: Record<string, any>;
      uniqueId: string;
    }) => {
      console.log('[useUpdateMetadata] Updating metadata for:', serverRelativeUrl);
      
      try {
        await api.updateFileMetadataSafe?.(serverRelativeUrl, metadata, uniqueId);
      } catch (error) {
        console.warn('[useUpdateMetadata] Safe update failed, trying regular update');
        await api.updateFileMetadata(serverRelativeUrl, metadata, uniqueId);
      }

      return { serverRelativeUrl, metadata, uniqueId };
    },

    onMutate: async ({ uniqueId, metadata }) => {
      if (!folderUrl) return;

      await queryClient.cancelQueries({ queryKey: queryKeys.folderFiles(folderUrl) });

      const previousFiles = queryClient.getQueryData<FileRow[]>(queryKeys.folderFiles(folderUrl));

      if (previousFiles) {
        queryClient.setQueryData<FileRow[]>(
          queryKeys.folderFiles(folderUrl),
          previousFiles.map(file =>
            file.UniqueId === uniqueId
              ? {
                  ...file,
                  ListItemAllFields: {
                    ...file.ListItemAllFields,
                    ...metadata,
                  },
                }
              : file
          )
        );
      }

      return { previousFiles };
    },

    onError: (err, _variables, context) => {
      console.error('[useUpdateMetadata] Error updating metadata:', err);
      
      if (context?.previousFiles && folderUrl) {
        queryClient.setQueryData(queryKeys.folderFiles(folderUrl), context.previousFiles);
      }
    },

    onSettled: () => {
      if (folderUrl) {
        queryClient.invalidateQueries({ queryKey: queryKeys.folderFiles(folderUrl) });
      }
    },

    onSuccess: () => {
      console.log('[useUpdateMetadata] Metadata updated successfully');
    },
  });
}

function useSaveSignature(api: FileService, folderUrl: string | undefined, isOrgWide: boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      docServerRelativeUrl,
      pngDataUrl,
      note,
      uniqueId,
      documentName,
      userAlias,
      userName,
    }: {
      docServerRelativeUrl: string;
      pngDataUrl: string;
      note?: string;
      uniqueId: string;
      documentName?: string;
      userAlias?: string;
      userName?: string;
    }) => {
      console.log('[useSaveSignature] Saving signature for:', docServerRelativeUrl);
      
      if (isOrgWide && documentName && userAlias && userName) {
        await api.saveOrgWideSignature(
          docServerRelativeUrl,
          documentName,
          pngDataUrl,
          userAlias,
          userName,
          note
        );
      } else {
        await api.saveSignatureToDocument(docServerRelativeUrl, pngDataUrl, note);
      }
      
      return { docServerRelativeUrl, uniqueId, documentName };
    },

    onMutate: async ({ uniqueId }) => {
      if (!folderUrl) return;

      await queryClient.cancelQueries({ queryKey: queryKeys.folderFiles(folderUrl) });

      const previousFiles = queryClient.getQueryData<FileRow[]>(queryKeys.folderFiles(folderUrl));

      if (previousFiles && !isOrgWide) {
        queryClient.setQueryData<FileRow[]>(
          queryKeys.folderFiles(folderUrl),
          previousFiles.map(file =>
            file.UniqueId === uniqueId
              ? {
                  ...file,
                  ListItemAllFields: {
                    ...file.ListItemAllFields,
                    Status: 'Signed',
                    Signed: true,
                  },
                }
              : file
          )
        );
      }

      return { previousFiles };
    },

    onError: (err, _variables, context) => {
      console.error('[useSaveSignature] Error saving signature:', err);
      
      if (context?.previousFiles && folderUrl) {
        queryClient.setQueryData(queryKeys.folderFiles(folderUrl), context.previousFiles);
      }
    },

    onSettled: (data) => {
      if (folderUrl) {
        queryClient.invalidateQueries({ queryKey: queryKeys.folderFiles(folderUrl) });
      }
      if (data?.docServerRelativeUrl) {
        queryClient.invalidateQueries({ 
          queryKey: queryKeys.docSignatures(data.docServerRelativeUrl) 
        });
        if (isOrgWide && data.documentName) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.orgWideProgress(data.docServerRelativeUrl, data.documentName)
          });
        }
      }
    },

    onSuccess: () => {
      console.log('[useSaveSignature] Signature saved successfully');
    },
  });
}

// ============================================================================
// UTILITY HOOKS
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

function usePrefetchNextPage(
  files: FileRow[],
  currentPage: number,
  itemsPerPage: number
) {
  React.useEffect(() => {
    const nextPageIndex = currentPage + 1;
    const hasNextPage = nextPageIndex * itemsPerPage < files.length;

    if (hasNextPage) {
      const nextPageFiles = files.slice(
        nextPageIndex * itemsPerPage,
        (nextPageIndex + 1) * itemsPerPage
      );
      
      console.log('[usePrefetchNextPage] Next page ready:', nextPageFiles.length);
    }
  }, [files, currentPage, itemsPerPage]);
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const Documents: React.FC<Props> = ({ 
  libraryUrl = 'Documents', 
  signaturesUrl = 'Signatures',
  companyDomain
}) => {
  const context = useContext(AppContext);
  const services = React.useMemo(
    () => (context ? SharePointServiceFactory.getInstance(context) : null),
    [context]
  );

  // ============================================================================
  // MEMOIZED API INSTANCE
  // ============================================================================

  const api = React.useMemo(
    () => {
      if (!context) return null;
      return new FileService(context, libraryUrl, signaturesUrl, companyDomain);
    },
    [context, libraryUrl, signaturesUrl, companyDomain]
  );

  // ============================================================================
  // DATA QUERIES
  // ============================================================================

  const { 
    data: currentUser, 
    isLoading: userLoading,
    error: userError 
  } = useCurrentUser(api!);

  const { 
    data: docsList, 
    isLoading: docsLoading,
    error: docsError 
  } = useDocumentLibrary(api!);

  React.useEffect(() => {
    if (api && docsList?.id) {
      void api.ensureOrgWideMetadataFields(docsList.id);
    }
  }, [api, docsList?.id]);

  React.useEffect(() => {
    if (services) {
      void services.provisioning.ensureDocumentAssignments();
    }
  }, [services]);

  const userAlias = React.useMemo(
    () => {
      if (!currentUser || !api) return undefined;
      return api.getLoginAlias(currentUser.loginName || currentUser.email || '');
    },
    [currentUser, api]
  );

  const { 
    data: folderUrl, 
    isLoading: folderLoading,
    error: folderError 
  } = useUserFolder(api!, userAlias);

  const { 
    data: resolvedCOL, 
    isLoading: fieldsLoading,
    error: fieldsError 
  } = useListFields(api!, docsList?.id);

  const [orgWideFolderReady, setOrgWideFolderReady] = React.useState(false);
  
  React.useEffect(() => {
    if (api && docsList?.rootUrl) {
      api.ensureOrgWideFolder()
        .then(() => {
          setOrgWideFolderReady(true);
          console.log('[Documents] All folder is ready');
        })
        .catch((err: Error) => {
          console.warn('[Documents] Could not ensure All folder:', err);
          setOrgWideFolderReady(true);
        });
    }
  }, [api, docsList?.rootUrl]);

  const { 
    data: personalFiles = [], 
    isLoading: personalFilesLoading,
    isFetching: personalFilesFetching,
    error: personalFilesError,
    refetch: refetchPersonalFiles 
  } = useFiles(api!, folderUrl);

  const orgWideFolderUrl = React.useMemo(() => {
    if (!docsList?.rootUrl) return undefined;
    return `${docsList.rootUrl}/Employees/All`;
  }, [docsList?.rootUrl]);

  const { 
    data: orgWideFiles = [], 
    isLoading: orgWideFilesLoading,
    isFetching: orgWideFilesFetching,
    error: orgWideFilesError,
    refetch: refetchOrgWideFiles 
  } = useFiles(api!, orgWideFolderUrl, orgWideFolderReady);

  const filesLoading = personalFilesLoading || orgWideFilesLoading;
  const filesFetching = personalFilesFetching || orgWideFilesFetching;

  const refetchFiles = React.useCallback(async () => {
    const [personal, orgWide] = await Promise.all([
      refetchPersonalFiles(),
      refetchOrgWideFiles()
    ]);
    return { data: [...(personal.data || []), ...(orgWide.data || [])] };
  }, [refetchPersonalFiles, refetchOrgWideFiles]);

  // ============================================================================
  // LOCAL STATE
  // ============================================================================

  const [selected, setSelected] = React.useState<FileRow | null>(null);
  const [viewerOpen, setViewerOpen] = React.useState(false);
  const [viewerStamp, setViewerStamp] = React.useState<number>(() => Date.now());
  const [searchTerm, setSearchTerm] = React.useState<string>('');
  const [activeFilter, setActiveFilter] = React.useState<string>('all');
  const [showProperties, setShowProperties] = React.useState<boolean>(false);
  const [showSignaturePanel, setShowSignaturePanel] = React.useState<boolean>(false);
  const [sigNote, setSigNote] = React.useState<string>('');
  const [currentPage, setCurrentPage] = React.useState<number>(0);
  const [localError, setLocalError] = React.useState<string>('');
  const [userRole, setUserRole] = React.useState<UserRole>('Employee');
  const [assignableUsers, setAssignableUsers] = React.useState<Array<{ Id: number; Title: string; PrincipalType?: number }>>([]);
  const [sharePointGroups, setSharePointGroups] = React.useState<Array<{ Id: number; Title: string }>>([]);
  const [uploadMessage, setUploadMessage] = React.useState<string>('');
  const [visiblePrincipalIds, setVisiblePrincipalIds] = React.useState<number[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<number | null>(null);
  const [showUploadForm, setShowUploadForm] = React.useState<boolean>(false);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState<boolean>(false);
  const [uploadError, setUploadError] = React.useState<string>('');
  const [uploadForm, setUploadForm] = React.useState<UploadFormState>({
    description: '',
    department: departmentOptions[0].key,
    category: 'Other',
    dueDate: '',
    requiresSignature: true,
    assignmentType: 'Individual',
    assignToIds: []
  });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = React.useState(false);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const assignmentScopeIds = React.useMemo(() => {
    if (userRole === 'Admin') return [];
    if (userRole === 'Manager') return visiblePrincipalIds;
    return currentUserId ? [currentUserId] : [];
  }, [userRole, visiblePrincipalIds, currentUserId]);

  const { data: visibleAssignments = [] } = useQuery({
    queryKey: [...queryKeys.all, 'documentAssignments', userRole, assignmentScopeIds.join(',')],
    queryFn: async () => {
      if (!services) return [];
      if (userRole === 'Admin') return [];
      if (!assignmentScopeIds.length) return [];
      if (userRole === 'Manager') {
        // Fetch all assignments, filter for those assigned to any team member (including via group)
        const allAssignments = await services.documentAssignments.getAll().catch(() => []);
        // Collect all principal IDs from AssignedTo
        const principalIdSet = new Set<number>();
        allAssignments.forEach(a => {
          if (Array.isArray(a.AssignedTo)) {
            a.AssignedTo.forEach((p: any) => { if (p?.Id) principalIdSet.add(Number(p.Id)); });
          } else if (a.AssignedTo?.Id) {
            principalIdSet.add(Number(a.AssignedTo.Id));
          }
          if (Array.isArray(a.AssignedTo)) {
            a.AssignedTo.forEach((p: any) => { if (p?.Id) principalIdSet.add(Number(p.Id)); });
          } else if (a.AssignedTo?.Id) {
            principalIdSet.add(Number(a.AssignedTo.Id));
          }
        });
        const principalIds = Array.from(principalIdSet);
        const principals = principalIds.length ? await services.user.getPrincipalsByIds(principalIds) : [];
        const principalMap = new Map(principals.map(p => [Number(p.Id), p]));
        // Get group members for all group principals
        const groupMembersMap = new Map<number, Array<{ Id: number }>>();
        await Promise.all(principalIds.map(async (id) => {
          const info = principalMap.get(id);
          if (!info) return;
          if (info.PrincipalType !== 1) { // Not a user
            const members = await services.membership.getPrincipalMembers(id, info.PrincipalType).catch(() => []);
            groupMembersMap.set(id, members);
          }
        }));
        // Helper to expand a principal to user IDs (handles groups)
        const expandPrincipal = (principal: any): number[] => {
          if (!principal?.Id) return [];
          const info = principalMap.get(Number(principal.Id));
          if (!info) return [];
          if (info.PrincipalType === 1) {
            return [Number(principal.Id)];
          } else {
            const members = groupMembersMap.get(Number(principal.Id)) || [];
            return members.map(m => m.Id).filter((id): id is number => typeof id === 'number');
          }
        };
        // For each assignment, expand all principals and check if any are in the manager's team
        return allAssignments.filter(a => {
          let allUserIds: number[] = [];
          // Expand AssignedTo
          if (Array.isArray(a.AssignedTo)) {
            a.AssignedTo.forEach((p: any) => { allUserIds.push(...expandPrincipal(p)); });
          } else if (a.AssignedTo) {
            allUserIds.push(...expandPrincipal(a.AssignedTo));
          }
          // Expand AssignedTo
          if (Array.isArray(a.AssignedTo)) {
            a.AssignedTo.forEach((p: any) => { allUserIds.push(...expandPrincipal(p)); });
          } else if (a.AssignedTo) {
            allUserIds.push(...expandPrincipal(a.AssignedTo));
          }
          // If any user is in the manager's team, include this assignment
          return allUserIds.some(id => assignmentScopeIds.includes(id));
        });
      }
      return services.documentAssignments.getByAssignedToIds(assignmentScopeIds);
    },
    enabled: !!services && userRole !== 'Admin' && assignmentScopeIds.length > 0,
    staleTime: 30 * 1000,
    cacheTime: 2 * 60 * 1000
  });

  const assignedDocUrls = React.useMemo(() => {
    if (userRole === 'Admin') return new Set<string>();

    const pendingByUrl = new Map<string, boolean>();
    visibleAssignments.forEach(item => {
      if (!item.DocumentUrl) return;
      const status = String(item.Status || '').toLowerCase();
      const isPending = status !== 'completed';
      if (!pendingByUrl.has(item.DocumentUrl)) {
        pendingByUrl.set(item.DocumentUrl, isPending);
        return;
      }
      if (isPending) {
        pendingByUrl.set(item.DocumentUrl, true);
      }
    });

    return new Set(
      Array.from(pendingByUrl.entries())
        .filter(([, isPending]) => isPending)
        .map(([url]) => url)
    );
  }, [visibleAssignments, userRole]);

  const visibleOrgWideFiles = React.useMemo(() => {
    if (userRole === 'Admin') return orgWideFiles;
    if (!assignedDocUrls.size) return [];
    return orgWideFiles.filter(file => assignedDocUrls.has(file.ServerRelativeUrl));
  }, [orgWideFiles, assignedDocUrls, userRole]);

  const files = React.useMemo(() => {
    const merged = [...personalFiles, ...visibleOrgWideFiles];
    console.log(`[Documents] Merged files: ${personalFiles.length} personal + ${visibleOrgWideFiles.length} org-wide = ${merged.length} total`);
    return merged;
  }, [personalFiles, visibleOrgWideFiles]);

  React.useEffect(() => {
    if (!services) return;

    const loadAssignableUsers = async () => {
      try {
        const role = await services.roles.getCurrentUserRole();
        const currentUserId = await services.user.getCurrentUserId();
        setUserRole(role);
        setCurrentUserId(currentUserId);

        let visiblePrincipalIds: number[] = [];
        if (role === 'Manager') {
          const teamUserIds = await services.membership.getDepartmentEmployeePrincipalIds(currentUserId);
          visiblePrincipalIds = [currentUserId, ...teamUserIds];
        } else {
          visiblePrincipalIds = await services.membership.getVisiblePrincipalIds(currentUserId);
        }
        setVisiblePrincipalIds(visiblePrincipalIds);

        const users = await services.user.getAllAssignableUsers(role, visiblePrincipalIds);
        const principals = await services.user.getPrincipalsByIds(users.map(user => user.Id));
        const principalMap = new Map(principals.map(p => [Number(p.Id), p.PrincipalType]));
        setAssignableUsers(
          users.map(user => ({
            ...user,
            PrincipalType: principalMap.get(Number(user.Id))
          }))
        );
        const groups = await services.user.getSharePointGroups().catch(() => []);
        setSharePointGroups(groups);
      } catch (error) {
        console.error('Error fetching assignable users:', error);
      }
    };

    void loadAssignableUsers();
  }, [services]);


  const isSelectedOrgWide = React.useMemo(() => {
    if (!selected || !api) return false;
    return api.isOrgWideDocument(selected.ServerRelativeUrl);
  }, [selected, api]);

  const [isOrgWideInitialized, setIsOrgWideInitialized] = React.useState(false);
  const [checkingInitialization, setCheckingInitialization] = React.useState(false);

  React.useEffect(() => {
    if (isSelectedOrgWide && selected && api) {
      setCheckingInitialization(true);
      api.isOrgWideDocumentInitialized(selected.Name)
        .then(setIsOrgWideInitialized)
        .finally(() => setCheckingInitialization(false));
    } else {
      setIsOrgWideInitialized(false);
    }
  }, [isSelectedOrgWide, selected, api]);

  const [initializing, setInitializing] = React.useState(false);
  
  const initializeOrgWideDoc = React.useCallback(async () => {
    if (!selected || !api) return;

    setInitializing(true);
    try {
      const result = await api.initializeOrgWideDocument(selected.Name);
      
      if (result.success) {
        setIsOrgWideInitialized(true);
        setLocalError('');
        console.log('[Documents] ✅ Document initialized:', result.message);
        alert(`✅ Document initialized successfully!\n\nSignature folder created: ${result.folderPath}\n\nEmployees can now sign this document.`);
      } else {
        setLocalError(result.message);
        console.error('[Documents] ❌ Initialization failed:', result.message);
      }
    } catch (e: any) {
      console.error('[Documents] Error initializing document:', e);
      setLocalError(e.message || 'Failed to initialize document');
    } finally {
      setInitializing(false);
    }
  }, [selected, api]);

  const { 
    data: orgWideProgress
  } = useOrgWideProgress(api!, selected, isSelectedOrgWide && isOrgWideInitialized);

  const [hasUserSigned, setHasUserSigned] = React.useState(false);

  React.useEffect(() => {
    if (isSelectedOrgWide && selected && api && userAlias) {
      api.hasUserSignedOrgWideDoc(selected.Name, userAlias).then(setHasUserSigned);
    } else {
      setHasUserSigned(false);
    }
  }, [isSelectedOrgWide, selected, api, userAlias]);

  // ============================================================================
  // MUTATIONS
  // ============================================================================

  const updateMetadataMutation = useUpdateMetadata(api!, folderUrl);
  const saveSignatureMutation = useSaveSignature(api!, folderUrl, isSelectedOrgWide);

  React.useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchTerm, activeFilter]);

  // ============================================================================
  // PROPERTIES REDUCER
  // ============================================================================

  const initialProperties: DocumentProperties = {
    description: '',
    department: departmentOptions[0].key,
    category: 'Other',
    dueDate: '',
    requiresSignature: false,
    signatureImage: '',
    status: 'Draft'
  };

  const getFieldText = React.useCallback(
    (fields: any, key?: string, fallbackKey?: string): string => {
      if (!fields) return '';
      const raw =
        (key && fields[key] !== undefined ? fields[key] : undefined) ??
        (fallbackKey && fields[fallbackKey] !== undefined ? fields[fallbackKey] : undefined);
      if (raw === undefined || raw === null) return '';
      if (Array.isArray(raw)) {
        const first = raw[0];
        if (!first) return '';
        if (typeof first === 'object') {
          return first.Title || first.Label || first.Value || first.LookupValue || '';
        }
        return String(first);
      }
      if (typeof raw === 'object') {
        return raw.Title || raw.Label || raw.Value || raw.LookupValue || raw.Url || '';
      }
      return String(raw);
    },
    []
  );

  const getFieldBool = React.useCallback(
    (fields: any, key?: string, fallbackKey?: string): boolean => {
      if (!fields) return false;
      const raw =
        (key && fields[key] !== undefined ? fields[key] : undefined) ??
        (fallbackKey && fields[fallbackKey] !== undefined ? fields[fallbackKey] : undefined);
      return Boolean(raw);
    },
    []
  );

  function propertiesReducer(
    state: DocumentProperties,
    action: PropertiesAction
  ): DocumentProperties {
    switch (action.type) {
      case 'setFile':
        return {
          description: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.Description, 'Description'),
          department: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.Department, 'Department') || departmentOptions[0].key,
          category: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.Category, 'Category') || 'Other',
          dueDate: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.DueDate, 'DueDate'),
          requiresSignature: getFieldBool(action.payload.ListItemAllFields, resolvedCOL?.RequiresSignature, 'RequiresSignature'),
          signatureImage: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.SignatureImage, 'SignatureImage'),
          status: getFieldText(action.payload.ListItemAllFields, resolvedCOL?.Status, 'Status') || 'Draft'
        };
      case 'update':
        return { ...state, [action.field]: action.value };
      case 'reset':
        return initialProperties;
      default:
        return state;
    }
  }

  const [properties, dispatch] = React.useReducer(propertiesReducer, initialProperties);

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  const isDocumentSigned = React.useCallback((file: FileRow): boolean => {
    if (!resolvedCOL) return false;
    const fields = file.ListItemAllFields || {};
    
    if (api?.isOrgWideDocument(file.ServerRelativeUrl)) {
      const status = fields[resolvedCOL.Status];
      return status === 'Completed';
    }
    
    const hasSignedStatus = fields[resolvedCOL.Status] === 'Signed';
    const hasSignedFlag = !!fields[resolvedCOL.Signed];
    const hasSignatureData = !!(
      fields[resolvedCOL.SignatureImage] ||
      fields['Signature'] ||
      fields['SignatureImage']
    );
    return hasSignedStatus || hasSignedFlag || hasSignatureData;
  }, [resolvedCOL, api]);

  const isDocumentOverdue = React.useCallback((file: FileRow): boolean => {
    if (!resolvedCOL) return false;
    const fields = file.ListItemAllFields || {};
    const dueDate = fields[resolvedCOL.DueDate];
    const requiresSignature = fields[resolvedCOL.RequiresSignature];
    const isSigned = isDocumentSigned(file);

    if (!dueDate || !requiresSignature || isSigned) return false;

    return new Date(dueDate) < new Date();
  }, [resolvedCOL, isDocumentSigned]);

  const getDocumentPriority = React.useCallback((file: FileRow): number => {
    if (!resolvedCOL) return 5;
    const fields = file.ListItemAllFields || {};
    const requiresSignature = fields[resolvedCOL.RequiresSignature];
    const isSigned = isDocumentSigned(file);
    const isOverdue = isDocumentOverdue(file);
    
    const isOrgWide = api?.isOrgWideDocument(file.ServerRelativeUrl);

    if (requiresSignature && !isSigned) {
      if (isOrgWide) {
        return isOverdue ? 0 : 1;
      }
      return isOverdue ? 1 : 2;
    } else if (isSigned) {
      return 4;
    } else {
      return 3;
    }
  }, [resolvedCOL, isDocumentSigned, isDocumentOverdue, api]);

  // ============================================================================
  // FILTERED & SORTED FILES (MEMOIZED)
  // ============================================================================

  const filteredFiles = React.useMemo(() => {
    if (!resolvedCOL) return [];

    const filtered = files.filter(file => {
      const fileFields = file.ListItemAllFields || {};
      const fileName = (file.Name || '').toLowerCase();
      const fileDescription = getFieldText(fileFields, resolvedCOL.Description, 'Description').toLowerCase();
      const fileCategory = getFieldText(fileFields, resolvedCOL.Category, 'Category');

      const matchesSearch =
        fileName.includes(debouncedSearchTerm.toLowerCase()) ||
        fileDescription.includes(debouncedSearchTerm.toLowerCase());

      let matchesFilter = false;
      if (activeFilter === 'all') {
        matchesFilter = true;
      } else if (activeFilter === 'org-wide') {
        matchesFilter = api?.isOrgWideDocument(file.ServerRelativeUrl) || false;
      } else if (activeFilter === 'overdue') {
        matchesFilter = isDocumentOverdue(file);
      } else if (activeFilter === 'requires-signature') {
        const requiresSignature = fileFields[resolvedCOL.RequiresSignature];
        const isSigned = isDocumentSigned(file);
        matchesFilter = requiresSignature && !isSigned;
      } else if (activeFilter === 'signed') {
        matchesFilter = isDocumentSigned(file);
      } else {
        matchesFilter = fileCategory === activeFilter;
      }

      return matchesSearch && matchesFilter;
    });

    return filtered.sort((a, b) => {
      const priorityA = getDocumentPriority(a);
      const priorityB = getDocumentPriority(b);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const fieldsA = a.ListItemAllFields || {};
      const fieldsB = b.ListItemAllFields || {};
      const dueDateA = fieldsA[resolvedCOL.DueDate];
      const dueDateB = fieldsB[resolvedCOL.DueDate];

      if (dueDateA && dueDateB) {
        return new Date(dueDateA).getTime() - new Date(dueDateB).getTime();
      }

      return new Date(b.TimeLastModified).getTime() - new Date(a.TimeLastModified).getTime();
    });
  }, [files, debouncedSearchTerm, activeFilter, resolvedCOL, isDocumentSigned, isDocumentOverdue, getDocumentPriority, api]);

  const paginatedFiles = React.useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    return filteredFiles.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredFiles, currentPage]);

  const totalPages = Math.ceil(filteredFiles.length / ITEMS_PER_PAGE);

  usePrefetchNextPage(filteredFiles, currentPage, ITEMS_PER_PAGE);

  // ============================================================================
  // FILTERS (MEMOIZED)
  // ============================================================================

  const filters: FilterOption[] = React.useMemo(() => {
    if (!resolvedCOL) return [];

    const allCount = files.length;
    const orgWideCount = files.filter(f => api?.isOrgWideDocument(f.ServerRelativeUrl)).length;
    const overdueCount = files.filter(f => isDocumentOverdue(f)).length;
    const requiresSignatureCount = files.filter(f => {
      const fields = f.ListItemAllFields || {};
      return fields[resolvedCOL.RequiresSignature] && !isDocumentSigned(f);
    }).length;
    const signedCount = files.filter(f => isDocumentSigned(f)).length;

    const categoryFilters = categoryOptions.map(cat => ({
      id: cat.key,
      label: cat.text,
      count: files.filter(f => {
        const fields = f.ListItemAllFields || {};
        return getFieldText(fields, resolvedCOL.Category, 'Category') === cat.key;
      }).length,
      color: cat.color,
      type: 'category' as const
    }));

    return [
      { id: 'all', label: 'All Documents', count: allCount },
      ...(orgWideCount > 0
        ? [{ id: 'org-wide', label: 'Organization-Wide', count: orgWideCount, color: '#7C3AED', type: 'priority' as const }]
        : []),
      ...(overdueCount > 0
        ? [{ id: 'overdue', label: 'Overdue', count: overdueCount, color: '#dc2626', type: 'priority' as const }]
        : []),
      ...(requiresSignatureCount > 0
        ? [{ id: 'requires-signature', label: 'Needs Signature', count: requiresSignatureCount, color: '#d97706', type: 'priority' as const }]
        : []),
      ...(signedCount > 0
        ? [{ id: 'signed', label: 'Signed', count: signedCount, color: '#059669', type: 'priority' as const }]
        : []),
      ...categoryFilters.filter(f => f.count > 0)
    ];
  }, [files, resolvedCOL, isDocumentSigned, isDocumentOverdue, api]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const pickFile = React.useCallback((file: FileRow) => {
    setSelected(file);
    dispatch({ type: 'setFile', payload: file });
    setShowSignaturePanel(false);
    setSigNote('');
    setViewerStamp(Date.now());
    setViewerOpen(true);
  }, []);

  const closeViewer = React.useCallback(() => {
    setViewerOpen(false);
  }, []);

  const refresh = React.useCallback(async () => {
    console.log('[Documents] Manual refresh triggered');
    const result = await refetchFiles();
    
    if (result.data && selected) {
      const match = result.data.find((r: FileRow) => r.UniqueId === selected.UniqueId);
      if (match) {
        pickFile(match);
      }
    }
  }, [refetchFiles, selected, pickFile]);

  const saveProperties = React.useCallback(async () => {
    if (!selected) return;

    const patch: Record<string, any> = {};

    if (properties.description?.trim()) {
      patch.description = properties.description.trim();
    }
    if (properties.department) {
      patch.department = properties.department;
    }
    if (properties.category) {
      patch.category = properties.category;
    }
    if (properties.dueDate) {
      patch.duedate = new Date(properties.dueDate);
    }
    patch.requiressignature = properties.requiresSignature;
    patch.status = properties.status;

    console.log('[Documents] Saving properties:', patch);

    try {
      await updateMetadataMutation.mutateAsync({
        serverRelativeUrl: selected.ServerRelativeUrl,
        metadata: patch,
        uniqueId: selected.UniqueId,
      });

      setLocalError('');
      console.log('[Documents] Properties saved successfully');
    } catch (e: any) {
      console.error('[Documents] Save properties error:', e);
      setLocalError(e.message || 'Unable to save properties.');
    }
  }, [selected, properties, updateMetadataMutation]);

  const principalTypeMap = React.useMemo(() => {
    return new Map(assignableUsers.map(user => [Number(user.Id), user.PrincipalType]));
  }, [assignableUsers]);
  const sharePointGroupIds = React.useMemo(() => {
    return new Set(sharePointGroups.map(group => Number(group.Id)));
  }, [sharePointGroups]);

  const userOptions = React.useMemo(
    () => assignableUsers.filter(user => (user.PrincipalType ?? 1) === 1),
    [assignableUsers]
  );

  const groupOptions = React.useMemo(
    () => sharePointGroups,
    [sharePointGroups]
  );

  const resolveAssignmentTargets = React.useCallback(
    async (assignmentType: AssignmentType, assigneeIds: number[]) => {
      if (!services || !api) {
        return { userIds: [] as number[], groupMeta: undefined as { Id: number; Title: string } | undefined, error: 'Services not ready.' };
      }

      if (assignmentType === 'Global') {
        const employees = await api.getAllActiveEmployees();
        const ensuredIds = await Promise.all(
          employees.map(emp => services.user.ensureUserId(emp.email))
        );
        const userIds = ensuredIds.filter((id): id is number => typeof id === 'number');
        return { userIds, groupMeta: undefined, error: userIds.length ? '' : 'No employees found for Global assignment.' };
      }

      if (!assigneeIds.length) {
        return { userIds: [], groupMeta: undefined, error: 'Select at least one assignee.' };
      }

      if (assignmentType === 'Individual') {
        const invalid = assigneeIds.find(id => sharePointGroupIds.has(Number(id)));
        if (invalid) {
          return { userIds: [], groupMeta: undefined, error: 'Individual assignment must use users only.' };
        }
        return { userIds: assigneeIds, groupMeta: undefined, error: '' };
      }

      if (assignmentType === 'Team') {
        if (assigneeIds.length !== 1) {
          return { userIds: [], groupMeta: undefined, error: 'Team assignment requires exactly one group.' };
        }
        const groupId = assigneeIds[0];
        if (!sharePointGroupIds.has(Number(groupId))) {
          return { userIds: [], groupMeta: undefined, error: 'Team assignment must use a SharePoint group.' };
        }
        const members = await services.membership.getSharePointGroupMembers(groupId);
        const userIds = members.map(member => Number(member.Id));
        const groupMeta = { Id: groupId, Title: groupOptions.find(u => u.Id === groupId)?.Title || 'Group' };
        if (!userIds.length) {
          return { userIds: [], groupMeta, error: 'No users found in the selected group.' };
        }
        return { userIds, groupMeta, error: '' };
      }

      return { userIds: [], groupMeta: undefined, error: 'Unsupported assignment type.' };
    },
    [services, api, principalTypeMap, assignableUsers, groupOptions, sharePointGroupIds]
  );

  const handleUploadDocument = React.useCallback(async () => {
    if (!services || !api || !docsList?.rootUrl || !resolvedCOL) return;
    if (!uploadFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setUploading(true);
    setUploadError('');
    setUploadMessage('');

    try {
      const { userIds, groupMeta, error } = await resolveAssignmentTargets(
        uploadForm.assignmentType,
        uploadForm.assignToIds
      );
      if (error) {
        setUploadError(error);
        return;
      }

      const allFolder = await api.ensureOrgWideFolder();
      const uploadResult = await api.sp.web
        .getFolderByServerRelativePath(allFolder)
        .files.addUsingPath(uploadFile.name, uploadFile, { Overwrite: true });

      const docs = await api.resolveDocumentLibrary();
      const uploadedItem = await api.getFileItemByUrl(docs.id, uploadResult.ServerRelativeUrl);

      const assigneeLabel = uploadForm.assignmentType === 'Global'
        ? 'All Employees'
        : uploadForm.assignmentType === 'Team'
          ? (groupMeta?.Title || '')
          : uploadForm.assignToIds
              .map(id => assignableUsers.find(user => user.Id === id)?.Title)
              .filter(Boolean)
              .join('; ');

      const metadata: Record<string, any> = {
        Description: uploadForm.description,
        DueDate: uploadForm.dueDate ? new Date(uploadForm.dueDate) : null,
        RequiresSignature: uploadForm.requiresSignature,
        Status: 'Not Started',
        Signed: false,
        AssignmentType: uploadForm.assignmentType
      };

      const deptField = await api.getFieldType(docs.id, resolvedCOL.Department);
      if (deptField?.TypeAsString?.startsWith('Lookup')) {
        const deptId = uploadForm.department
          ? await api.getLookupIdByValue(docs.id, deptField.InternalName, uploadForm.department)
          : null;
        if (deptId) {
          metadata[`${deptField.InternalName}Id`] =
            deptField.TypeAsString === 'LookupMulti' ? [deptId] : deptId;
        }
      } else {
        metadata[resolvedCOL.Department] = uploadForm.department;
      }

      const categoryField = await api.getFieldType(docs.id, resolvedCOL.Category);
      if (categoryField?.TypeAsString?.startsWith('Lookup')) {
        const catId = uploadForm.category
          ? await api.getLookupIdByValue(docs.id, categoryField.InternalName, uploadForm.category)
          : null;
        if (catId) {
          metadata[`${categoryField.InternalName}Id`] =
            categoryField.TypeAsString === 'LookupMulti' ? [catId] : catId;
        }
      } else {
        metadata[resolvedCOL.Category] = uploadForm.category;
      }

      const assignToField = await api.getFieldType(docs.id, resolvedCOL.AssignTo);
      if (assignToField) {
        if (assignToField.TypeAsString === 'User' || assignToField.TypeAsString === 'UserMulti') {
          if (uploadForm.assignmentType !== 'Global') {
            if (assignToField.TypeAsString === 'UserMulti') {
              metadata[`${assignToField.InternalName}Id`] = userIds;
            } else if (uploadForm.assignmentType === 'Individual') {
              metadata[`${assignToField.InternalName}Id`] = userIds[0];
            }
          }
        } else if (assignToField.TypeAsString === 'Text' || assignToField.TypeAsString === 'Note') {
          metadata[assignToField.InternalName] = assigneeLabel;
        }
      } else if (assigneeLabel) {
        metadata.AssignTo = assigneeLabel;
      }

      await api.updateFileMetadataSafe(
        uploadResult.ServerRelativeUrl,
        metadata,
        uploadedItem.UniqueId
      );

      for (const userId of userIds) {
        const user = await api.sp.web.siteUsers.getById(userId).select('Title', 'Email')();
        await services.documentAssignments.create({
          Title: `${uploadFile.name} - ${user.Title || user.Email || userId}`,
          DocumentName: uploadFile.name,
          DocumentUrl: uploadResult.ServerRelativeUrl,
          DocumentUniqueId: uploadedItem.UniqueId,
          DueDate: uploadForm.dueDate ? new Date(uploadForm.dueDate).toISOString() : undefined,
          AssignedToId: userId,
          Status: 'Not Started',
          AssignmentGroupId: groupMeta?.Id,
          AssignmentGroupTitle: groupMeta?.Title,
          SourceItemId: uploadedItem.Id
        });
      }

      const progress = await api.getOrgWideSignatureProgress(uploadResult.ServerRelativeUrl, uploadFile.name);
      await api.updateFileMetadataSafe(
        uploadResult.ServerRelativeUrl,
        {
          Status: progress.status,
          SignatureProgress: progress.percentage,
          CurrentSigners: progress.signed,
          RequiredSigners: progress.total,
          SignedBy: progress.signedUsers.join('; '),
          NotSignedBy: progress.remainingUsers.join('; ')
        },
        uploadedItem.UniqueId
      );

      setUploadMessage(`Document uploaded and assigned to ${userIds.length} user${userIds.length === 1 ? '' : 's'}.`);
      setUploadFile(null);
      setUploadForm({
        description: '',
        department: departmentOptions[0].key,
        category: 'Other',
        dueDate: '',
        requiresSignature: true,
        assignmentType: 'Individual',
        assignToIds: []
      });
      setShowUploadForm(false);
      await refetchFiles();
    } catch (error: any) {
      console.error('[Documents] Upload document error:', error);
      setUploadError(error?.message || 'Failed to upload document.');
    } finally {
      setUploading(false);
    }
  }, [
    services,
    api,
    docsList?.rootUrl,
    uploadFile,
    uploadForm,
    assignableUsers,
    resolvedCOL,
    resolveAssignmentTargets,
    refetchFiles
  ]);

  const getFileIcon = React.useCallback((fileName: string) => {
    const ext = fileName.toLowerCase().split('.').pop();
    switch (ext) {
      case 'pdf':
        return <FileText className={styles.fileIcon} style={{ color: '#dc2626' }} />;
      case 'doc':
      case 'docx':
        return <FileText className={styles.fileIcon} style={{ color: '#2563eb' }} />;
      case 'xls':
      case 'xlsx':
        return <FileSpreadsheet className={styles.fileIcon} style={{ color: '#059669' }} />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return <FileImage className={styles.fileIcon} style={{ color: '#7c3aed' }} />;
      default:
        return <FileText className={styles.fileIcon} style={{ color: '#6b7280' }} />;
    }
  }, []);

  const formatDate = React.useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getCategoryColor = React.useCallback((cat: string) => {
    const option = categoryOptions.find(o => o.key === cat);
    return option?.color || '#6b7280';
  }, []);

  const getDocumentSignatureData = React.useCallback((file: FileRow): SignatureData | null => {
    if (!resolvedCOL) return null;
    const fields = file.ListItemAllFields || {};
    const signatureField =
      fields[resolvedCOL.SignatureImage] || fields['Signature'] || fields['SignatureImage'];

    if (!signatureField) return null;

    if (typeof signatureField === 'string') {
      return {
        url: signatureField,
        signedBy: file.Author?.Title || 'Unknown',
        signedDate: file.TimeLastModified,
        note: fields['Note'] || ''
      };
    } else if (signatureField && signatureField.Url) {
      return {
        url: signatureField.Url,
        signedBy: file.Author?.Title || 'Unknown',
        signedDate: file.TimeLastModified,
        note: signatureField.Description || fields['Note'] || ''
      };
    }

    return null;
  }, [resolvedCOL]);

  // ============================================================================
  // CANVAS HANDLERS
  // ============================================================================

  const getCanvasCoordinates = React.useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const startDraw = React.useCallback((e: React.MouseEvent) => {
    setDrawing(true);
    const coords = getCanvasCoordinates(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(coords.x, coords.y);
    }
  }, [getCanvasCoordinates]);

  const draw = React.useCallback((e: React.MouseEvent) => {
    if (!drawing || !canvasRef.current) return;

    const coords = getCanvasCoordinates(e);
    const ctx = canvasRef.current.getContext('2d')!;

    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
  }, [drawing, getCanvasCoordinates]);

  const endDraw = React.useCallback(() => {
    if (!drawing) return;
    setDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
    }
  }, [drawing]);

  const clearCanvas = React.useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }, []);

  // Helper to check if canvas is blank
  const isCanvasBlank = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const pixelBuffer = new Uint32Array(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer
    );
    return !pixelBuffer.some(color => color !== 0);
  };

  // Preview state for signature
  const [signaturePreview, setSignaturePreview] = React.useState<string | null>(null);

  // Show preview before saving
  const handlePreviewSignature = () => {
    if (!canvasRef.current) return;
    if (isCanvasBlank(canvasRef.current)) {
      setLocalError('Signature cannot be blank.');
      return;
    }
    setSignaturePreview(canvasRef.current.toDataURL('image/png'));
  };

  // Save handler with PDF attachment
  const saveSignatureHandler = React.useCallback(async () => {
    if (!selected || !canvasRef.current) return;
    if (!api) {
      setLocalError('Document service is not ready yet.');
      return;
    }

    if (isCanvasBlank(canvasRef.current)) {
      setLocalError('Signature cannot be blank.');
      return;
    }

    try {
      let signedCopyUrl: string | undefined;
      // If PDF, append signature page
      if (selected.Name.toLowerCase().endsWith('.pdf')) {
        // Fetch the original PDF
        const pdfBytes = await fetch(api.absoluteFileUrl(selected.ServerRelativeUrl), {
          credentials: 'same-origin'
        }).then(r => r.arrayBuffer());
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const page = pdfDoc.addPage();
        const { height } = page.getSize();

        // Add signature image
        const pngDataUrl = canvasRef.current.toDataURL('image/png');
        const pngBytes = Uint8Array.from(atob(pngDataUrl.split(',')[1]), c => c.charCodeAt(0));
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const imgDims = pngImage.scale(0.5);
        page.drawImage(pngImage, {
          x: 50,
          y: height - imgDims.height - 100,
          width: imgDims.width,
          height: imgDims.height,
        });

        // Add text: date, user
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const now = new Date();
        const dateStr = now.toLocaleString();
        const userStr = currentUser?.title || 'Unknown';
        page.drawText(`Signed by: ${userStr}`, { x: 50, y: height - imgDims.height - 130, size: 16, font, color: rgb(0,0,0) });
        page.drawText(`Date: ${dateStr}`, { x: 50, y: height - imgDims.height - 150, size: 14, font, color: rgb(0,0,0) });
        if (sigNote) {
          page.drawText(`Note: ${sigNote}`, { x: 50, y: height - imgDims.height - 170, size: 12, font, color: rgb(0,0,0) });
        }

        // Save new PDF
        const newPdfBytes = await pdfDoc.save();
        const newPdfBlob = new Blob([newPdfBytes], { type: 'application/pdf' });

        if (isSelectedOrgWide) {
          if (!userAlias) {
            throw new Error('User alias is required for org-wide signatures.');
          }
          const userFolderUrl = await api.ensureUserFolder(userAlias);
          const cleanName = selected.Name.replace(/\.pdf$/i, '');
          const signedName = `${cleanName}_${userAlias}_signed.pdf`;
          await api.sp.web
            .getFolderByServerRelativePath(userFolderUrl)
            .files.addUsingPath(signedName, newPdfBlob, { Overwrite: true });
          try {
            const signedFileUrl = `${userFolderUrl}/${signedName}`;
            signedCopyUrl = signedFileUrl;
            const docs = await api.resolveDocumentLibrary();
            const signedItem = await api.getFileItemByUrl(docs.id, signedFileUrl);
            const sourceFields = selected.ListItemAllFields || {};
            const copyMetadata: Record<string, any> = resolvedCOL ? {
              Description: sourceFields[resolvedCOL.Description] ?? '',
              Category: sourceFields[resolvedCOL.Category] ?? '',
              Department: sourceFields[resolvedCOL.Department] ?? '',
              DueDate: sourceFields[resolvedCOL.DueDate] ?? null,
              RequiresSignature: sourceFields[resolvedCOL.RequiresSignature] ?? false,
              RelatedDocument: selected.ServerRelativeUrl
            } : {};
            await api.updateFileMetadataSafe(
              signedFileUrl,
              {
                ...copyMetadata,
                Signed: true,
                Status: 'Signed',
                SignedBy: currentUser?.title || 'Unknown',
                SignatureProgress: 100,
                CurrentSigners: 1,
                RequiredSigners: 1
              },
              signedItem.UniqueId
            );
          } catch (metaError) {
            console.warn('[Documents] Unable to update signed copy metadata:', metaError);
          }
        } else {
          // Upload the new PDF (overwrite)
          await api.sp.web.getFileByServerRelativePath(selected.ServerRelativeUrl).setContent(newPdfBlob);
        }
        setViewerStamp(Date.now());
      }

      // Save signature image as before
      const mutationData: any = {
        docServerRelativeUrl: selected.ServerRelativeUrl,
        pngDataUrl: canvasRef.current.toDataURL('image/png'),
        note: sigNote || undefined,
        uniqueId: selected.UniqueId,
      };
      if (isSelectedOrgWide) {
        mutationData.documentName = selected.Name;
        mutationData.userAlias = userAlias;
        mutationData.userName = currentUser?.title || 'Unknown';
      }
      await saveSignatureMutation.mutateAsync(mutationData);

      if (services && currentUser?.id) {
        const sourceUrl = resolvedCOL
          ? (selected.ListItemAllFields || {})[resolvedCOL.RelatedDocument] || selected.ServerRelativeUrl
          : selected.ServerRelativeUrl;
        await services.documentAssignments.markCompleted(sourceUrl, currentUser.id, signedCopyUrl);
      }

      clearCanvas();
      setSigNote('');
      setShowSignaturePanel(false);
      setSignaturePreview(null);
      setLocalError('');
      console.log('[Documents] Signature saved and PDF updated successfully');
    } catch (e: any) {
      console.error('[Documents] Save signature error:', e);
      setLocalError(e.message || 'Could not save signature');
    }
  }, [selected, sigNote, saveSignatureMutation, clearCanvas, isSelectedOrgWide, userAlias, currentUser, api, services, resolvedCOL]);

  // ============================================================================
  // RENDER ORG-WIDE PROGRESS
  // ============================================================================

  const renderOrgWideProgress = React.useCallback(() => {
    if (!isSelectedOrgWide) return null;

    // ...existing code...

    // Show progress panel if initialized and has progress data
    if (!orgWideProgress) return null;

    const getStatusColor = () => {
      switch (orgWideProgress.status) {
        case 'Completed': return '#16A34A';
        case 'In Progress': return '#D97706';
        case 'Overdue': return '#DC2626';
        default: return '#6B7280';
      }
    };

    const getStatusIcon = () => {
      switch (orgWideProgress.status) {
        case 'Completed': return <CheckCircle2 size={16} />;
        case 'Overdue': return <AlertCircle size={16} />;
        default: return <TrendingUp size={16} />;
      }
    };

    return (
      <div className={styles.orgWideProgressPanel}>
        <div className={styles.panelHeader}>
          <h3>Signature Progress</h3>
          <div 
            className={styles.statusBadge}
            style={{ backgroundColor: `${getStatusColor()}20`, color: getStatusColor() }}
          >
            {getStatusIcon()}
            {orgWideProgress.status}
          </div>
        </div>
        {/* ...existing code... */}
        <div className={styles.progressContent}>
          <div className={styles.progressStats}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{orgWideProgress.signed}</span>
              <span className={styles.statLabel}>Signed</span>
            </div>
            <div className={styles.statDivider}>/</div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{orgWideProgress.total}</span>
              <span className={styles.statLabel}>Required</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue} style={{ color: getStatusColor() }}>
                {orgWideProgress.percentage}%
              </span>
              <span className={styles.statLabel}>Complete</span>
            </div>
          </div>

          <div className={styles.progressBarContainer}>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill}
                style={{ 
                  width: `${orgWideProgress.percentage}%`,
                  backgroundColor: getStatusColor()
                }}
              />
            </div>
          </div>

          {orgWideProgress.remainingUsers.length > 0 && (
            <div className={styles.remainingUsers}>
              <h4>Pending Signatures ({orgWideProgress.remainingUsers.length}):</h4>
              <div className={styles.userList}>
                {orgWideProgress.remainingUsers.slice(0, 5).map((user, idx) => (
                  <span key={idx} className={styles.userChip}>{user}</span>
                ))}
                {orgWideProgress.remainingUsers.length > 5 && (
                  <span className={styles.userChip}>
                    +{orgWideProgress.remainingUsers.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, [isSelectedOrgWide, orgWideProgress, isOrgWideInitialized, checkingInitialization, initializing, initializeOrgWideDoc]);

  // ============================================================================
  // RENDER VIEWER
  // ============================================================================

  const renderViewer = React.useCallback(() => {
    if (!selected || !api) {
      return (
        <div className={styles.emptyViewer}>
          <FileText size={48} />
          <h3>Select a document to preview</h3>
          <p>Choose a file from the list to view its contents and manage properties</p>
        </div>
      );
    }

    const name = selected.Name.toLowerCase();
    const isImg = /\.(png|jpe?g|gif|bmp|webp)$/.test(name);
    const isPdf = /\.pdf$/.test(name);
    const isOffice = /\.(docx?|xlsx?|pptx?)$/.test(name);
    const fileUrl = api.absoluteFileUrl(selected.ServerRelativeUrl);
    const stampedUrl = `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}t=${viewerStamp}`;
    const officeEmbedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(stampedUrl)}`;

    return (
      <div className={styles.viewer}>
        {!isPdf && (
          <div className={styles.viewerHeader}>
            <div className={styles.viewerTitle}>
              {getFileIcon(selected.Name)}
              <span title={selected.Name}>{selected.Name}</span>
              {isSelectedOrgWide && (
                <span className={styles.orgWideIndicator}>
                  <Users size={12} />
                  Organization-Wide
                </span>
              )}
            </div>
            <div className={styles.viewerActions}>
              <button
                className={styles.viewerBtn}
                title="Download"
                onClick={() => window.open(api.absoluteFileUrl(selected.ServerRelativeUrl), '_blank')}
              >
                <Download size={16} />
              </button>
              <button
                className={styles.viewerBtn}
                title="Open in new tab"
                onClick={() => window.open(api.absoluteFileUrl(selected.ServerRelativeUrl), '_blank')}
              >
                <ExternalLink size={16} />
              </button>
            </div>
          </div>
        )}

        <div className={styles.viewerContent}>
          {isPdf && (
            <div className={styles.viewerOverlayActions}>
              <button
                className={styles.viewerBtn}
                title="Download"
                onClick={() => window.open(api.absoluteFileUrl(selected.ServerRelativeUrl), '_blank')}
              >
                <Download size={16} />
              </button>
              <button
                className={styles.viewerBtn}
                title="Open in new tab"
                onClick={() => window.open(api.absoluteFileUrl(selected.ServerRelativeUrl), '_blank')}
              >
                <ExternalLink size={16} />
              </button>
            </div>
          )}
          {isImg && (
            <div className={styles.imageViewer}>
              <img
                src={stampedUrl}
                alt={selected.Name}
                style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px' }}
              />
            </div>
          )}

          {isPdf && (
            <div className={styles.pdfViewer}>
              <embed
                src={stampedUrl}
                type="application/pdf"
                style={{ width: '100%', height: '85vh', border: 0, borderRadius: 10 }}
              />
            </div>
          )}

          {isOffice && (
            <div className={styles.officeViewer}>
              <iframe
                title="office-viewer"
                src={officeEmbedUrl}
                style={{
                  width: '100%',
                  flex: 1,
                  border: 0,
                  borderRadius: 10,
                  minHeight: '500px'
                }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            </div>
          )}

          {!isPdf && !isOffice && !isImg && (
            <div className={styles.genericViewer}>
              <div className={styles.genericPlaceholder}>
                <FileText size={64} />
                <h4>Document Preview</h4>
                <p>Preview not available for this file type</p>
                <button
                  className={styles.openBtn}
                  onClick={() =>
                    window.open(api.absoluteFileUrl(selected.ServerRelativeUrl), '_blank')
                  }
                >
                  <Download size={16} />
                  Download File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, [selected, api, getFileIcon, isSelectedOrgWide, viewerStamp]);

  // ============================================================================
  // COMBINED LOADING & ERROR STATES
  // ============================================================================

  const isInitialLoading = userLoading || docsLoading || folderLoading || fieldsLoading || filesLoading;
  const isMutating = updateMetadataMutation.isPending || saveSignatureMutation.isPending;
  const isRefreshing = filesFetching && !filesLoading;

  const combinedError = 
    localError ||
    (userError instanceof Error ? userError.message : '') ||
    (docsError instanceof Error ? docsError.message : '') ||
    (folderError instanceof Error ? folderError.message : '') ||
    (fieldsError instanceof Error ? fieldsError.message : '') ||
    (personalFilesError instanceof Error ? `Personal files: ${personalFilesError.message}` : '') ||
    (orgWideFilesError instanceof Error ? `Org-wide files: ${orgWideFilesError.message}` : '');

  // ============================================================================
  // EARLY RETURNS
  // ============================================================================

  if (!context || !api) {
    return (
      <div className={styles.loadingContainer}>
        <AlertCircle size={48} style={{ color: '#dc2626', marginBottom: '16px' }} />
        <h3>Context Error</h3>
        <p>Unable to load application context. Please refresh the page.</p>
      </div>
    );
  }

  if (isInitialLoading && files.length === 0) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Loading documents...</p>
      </div>
    );
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className={styles.documents}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            Document Management
            {isRefreshing && <span className={styles.refreshIndicator}> ↻</span>}
          </h1>
          <p className={styles.subtitle}>Manage, view, and track document signatures</p>
        </div>

      </div>

      {combinedError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <span>{combinedError}</span>
          <button onClick={() => setLocalError('')} className={styles.closeError}>
            <X size={16} />
          </button>
        </div>
      )}

      {updateMetadataMutation.isSuccess && (
        <div className={styles.successBanner}>
          <CheckCircle2 size={20} />
          <span>Properties updated successfully</span>
          <button onClick={() => updateMetadataMutation.reset()} className={styles.closeError}>
            <X size={16} />
          </button>
        </div>
      )}

      {saveSignatureMutation.isSuccess && (
        <div className={styles.successBanner}>
          <CheckCircle2 size={20} />
          <span>Signature saved successfully</span>
          <button onClick={() => saveSignatureMutation.reset()} className={styles.closeError}>
            <X size={16} />
          </button>
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBar}>
          <Search size={20} />
          <input
            type="text"
            placeholder="Search documents..."
            className={styles.searchInput}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />

        {userRole === 'Admin' && (
          <div className={styles.toolbarActions}>
            <button
              className={styles.uploadBtn}
              onClick={() => {
                setShowUploadForm(true);
                setUploadError('');
                setUploadMessage('');
              }}
            >
              <Upload size={16} />
              Upload Document
            </button>
          </div>
        )}

        </div>

        <div className={styles.filterSection}>
          <Filter size={20} />
          <span>Filter:</span>
          <div className={styles.filterButtons}>
            {filters.map(filter => (
              <button
                key={filter.id}
                className={`${styles.filterBtn} ${activeFilter === filter.id ? styles.active : ''}`}
                onClick={() => setActiveFilter(filter.id)}
                style={
                  filter.color
                    ? ({ '--filter-color': filter.color } as React.CSSProperties)
                    : {}
                }
              >
                {filter.label}
                <span className={styles.count}>{filter.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>



      {showUploadForm && userRole === 'Admin' && (
        <div className={styles.uploadModalOverlay}>
          <div className={styles.uploadModal}>
            <div className={styles.uploadModalHeader}>
              <h3>Upload Document</h3>
              <button
                className={styles.modalCloseBtn}
                onClick={() => {
                  setShowUploadForm(false)
                  setUploadError('')
                  setUploadMessage('')
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className={styles.uploadModalBody}>
              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Document File</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className={styles.input}
                    onChange={e => {
                      const file = e.currentTarget.files && e.currentTarget.files[0]
                      setUploadFile(file || null)
                    }}
                  />
                </label>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>
                  <span>Description</span>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={uploadForm.description}
                    onChange={e => setUploadForm({ ...uploadForm, description: e.target.value })}
                  />
                </label>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Department</span>
                    <select
                      value={uploadForm.department}
                      onChange={e => setUploadForm({ ...uploadForm, department: e.target.value })}
                      className={styles.select}
                    >
                      {departmentOptions.map(opt => (
                        <option key={opt.key} value={opt.key}>
                          {opt.text}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Category</span>
                    <select
                      value={uploadForm.category}
                      onChange={e => setUploadForm({ ...uploadForm, category: e.target.value })}
                      className={styles.select}
                    >
                      {categoryOptions.map(opt => (
                        <option key={opt.key} value={opt.key}>
                          {opt.text}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Due Date</span>
                    <input
                      type="datetime-local"
                      value={uploadForm.dueDate}
                      onChange={e => setUploadForm({ ...uploadForm, dueDate: e.target.value })}
                      className={styles.input}
                    />
                  </label>
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={uploadForm.requiresSignature}
                      onChange={e => setUploadForm({ ...uploadForm, requiresSignature: e.target.checked })}
                      className={styles.checkbox}
                    />
                    <span>Requires Signature</span>
                  </label>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    <span>Assignment Type</span>
                    <select
                      value={uploadForm.assignmentType}
                      onChange={e =>
                        setUploadForm({
                          ...uploadForm,
                          assignmentType: e.target.value as AssignmentType,
                          assignToIds: []
                        })
                      }
                      className={styles.select}
                    >
                      <option value="Individual">Individual</option>
                      <option value="Team">Team</option>
                      <option value="Global">Global</option>
                    </select>
                  </label>
                </div>
              </div>

              {uploadForm.assignmentType !== 'Global' && (
                <div className={styles.formGroup}>
                  <div className={styles.label}>
                    <span>Assign To</span>
                  </div>
                  <MultiSelectUsers
                    options={uploadForm.assignmentType === 'Team' ? groupOptions : userOptions}
                    selectedIds={uploadForm.assignToIds}
                    onChange={ids => {
                      const nextIds =
                        uploadForm.assignmentType === 'Team' ? ids.slice(-1) : ids
                      setUploadForm({ ...uploadForm, assignToIds: nextIds })
                    }}
                    placeholder={
                      uploadForm.assignmentType === 'Team'
                        ? 'Select a SharePoint group...'
                        : 'Select users...'
                    }
                    batchSize={50}
                    maxSelections={uploadForm.assignmentType === 'Team' ? 1 : undefined}
                  />
                </div>
              )}

              {uploadError && <div className={styles.errorText}>{uploadError}</div>}
              {uploadMessage && <div className={styles.successText}>{uploadMessage}</div>}

              <div className={styles.formActions}>
                <button
                  className={styles.saveBtn}
                  onClick={handleUploadDocument}
                  disabled={uploading}
                >
                  <Upload size={16} />
                  {uploading ? 'Uploading...' : 'Upload Document'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={styles.mainContent}>
        <div className={styles.filesList}>
          <div className={styles.filesHeader}>
            <h3>Documents ({filteredFiles.length})</h3>
            <button
              className={styles.refreshBtn}
              title="Refresh"
              onClick={refresh}
              disabled={isInitialLoading || isMutating}
            >
              <RefreshCw size={16} className={isRefreshing ? styles.spinning : ''} />
            </button>
          </div>

          <div className={styles.filesGrid}>
            {paginatedFiles.map(file => {
              const fields = file.ListItemAllFields || {};
              const isSigned = isDocumentSigned(file);
              const isOverdue = isDocumentOverdue(file);
              const requiresSignature = resolvedCOL ? fields[resolvedCOL.RequiresSignature] : false;
              const dueDate = resolvedCOL ? fields[resolvedCOL.DueDate] : undefined;
              const isOrgWide = api.isOrgWideDocument(file.ServerRelativeUrl);

              return (
                <div
                  key={file.UniqueId}
                  className={`${styles.fileCard} ${
                    selected?.UniqueId === file.UniqueId ? styles.selected : ''
                  } ${isOverdue ? styles.overdue : ''}`}
                  onClick={() => pickFile(file)}
                >
                  <div className={styles.fileMain}>
                  <div className={styles.fileHeader}>
                    {getFileIcon(file.Name)}
                    <div className={styles.fileInfo}>
                      <h4 className={styles.fileName} title={file.Name}>
                        {file.Name}
                      </h4>
                        <div className={styles.fileMeta}>
                          {dueDate && requiresSignature && (
                            <>
                              <span>
                                <Clock size={12} />
                              </span>
                              <span
                                className={`${styles.dueDate} ${isOverdue ? styles.overdueDue : ''}`}
                              >
                                Due: {formatDate(dueDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={styles.fileActions}>
                      {isOverdue && (
                        <div
                          className={styles.overdueIndicator}
                          title="Document is overdue for signature"
                        >
                          <AlertCircle size={14} />
                        </div>
                      )}
                      <button className={styles.actionBtn} title="View">
                        <Eye size={20} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.fileDetails}>
                    {isOrgWide && (
                      <span className={styles.orgWideTag}>
                        <Users size={12} />
                        Organization-Wide
                      </span>
                    )}
                    {isOrgWide && resolvedCOL && (
                      <div className={styles.orgWideSummary}>
                        {fields[resolvedCOL.CurrentSigners] !== undefined &&
                          fields[resolvedCOL.RequiredSigners] !== undefined && (
                            <span className={styles.orgWideProgress}>
                              <TrendingUp size={12} />
                              {fields[resolvedCOL.CurrentSigners]} of {fields[resolvedCOL.RequiredSigners]} signed
                            </span>
                          )}
                        {fields[resolvedCOL.SignedBy] && (
                          <span className={styles.orgWidePeople}>
                            Signed by: {fields[resolvedCOL.SignedBy]}
                          </span>
                        )}
                        {fields[resolvedCOL.NotSignedBy] && (
                          <span className={styles.orgWidePeople}>
                            Remaining: {fields[resolvedCOL.NotSignedBy]}
                          </span>
                        )}
                      </div>
                    )}
                    {resolvedCOL && getFieldText(fields, resolvedCOL.Category, 'Category') && (
                      <span
                        className={styles.categoryTag}
                        style={{
                          backgroundColor: getCategoryColor(getFieldText(fields, resolvedCOL.Category, 'Category')) + '20',
                          color: getCategoryColor(getFieldText(fields, resolvedCOL.Category, 'Category'))
                        }}
                      >
                        <Tag size={12} />
                        {getFieldText(fields, resolvedCOL.Category, 'Category')}
                      </span>
                    )}
                    {requiresSignature && (
                      <span
                        className={`${styles.signatureTag} ${isSigned ? styles.signed : ''} ${
                          isOverdue ? styles.overdue : ''
                        }`}
                      >
                        {isSigned ? (
                          <CheckCircle2 size={12} />
                        ) : isOverdue ? (
                          <AlertCircle size={12} />
                        ) : (
                          <Signature size={12} />
                        )}
                        {isSigned ? 'Signed' : isOverdue ? 'Overdue' : 'Signature Required'}
                      </span>
                    )}
                  </div>

                  <div className={styles.fileThumbLarge}>
                    <img
                      src={`${context.pageContext.web.absoluteUrl}/_layouts/15/getpreview.ashx?path=${encodeURIComponent(
                        api.absoluteFileUrl(file.ServerRelativeUrl)
                      )}`}
                      alt={`${file.Name} thumbnail`}
                      loading="lazy"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                className={styles.paginationBtn}
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <div className={styles.pageInfo}>
                <span>
                  Page {currentPage + 1} of {totalPages}
                </span>
                <small>({filteredFiles.length} documents)</small>
              </div>
              <button
                className={styles.paginationBtn}
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
              >
                Next
                <ChevronRightIcon size={16} />
              </button>
            </div>
          )}

          {filteredFiles.length === 0 && (
            <div className={styles.emptyState}>
              <FileText size={48} />
              <h3>No documents found</h3>
              <p>No documents match your current search or filter criteria.</p>
            </div>
          )}
        </div>

      </div>
      {viewerOpen && selected && (
        <div className={styles.viewerModalOverlay} onClick={closeViewer}>
          <div className={styles.viewerModal} onClick={e => e.stopPropagation()}>
            <div className={styles.viewerModalHeader}>
              <div className={styles.viewerModalTitle}>
                {getFileIcon(selected.Name)}
                <span title={selected.Name}>{selected.Name}</span>
                {isSelectedOrgWide && (
                  <span className={styles.orgWideIndicator}>
                    <Users size={12} />
                    Organization-Wide
                  </span>
                )}
              </div>
              <button className={styles.modalCloseBtn} onClick={closeViewer} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className={styles.viewerModalBody}>
              <div className={styles.viewerModalViewer}>{renderViewer()}</div>
              <div className={styles.viewerModalSide}>
                {renderOrgWideProgress()}

                {selected && !isSelectedOrgWide && (
                  <div className={styles.propertiesPanel}>
                    <div className={styles.panelHeader}>
                      <h3>Document Properties</h3>
                      <button
                        className={styles.toggleBtn}
                        onClick={() => setShowProperties(!showProperties)}
                        disabled={isMutating}
                      >
                        {showProperties ? <XCircle size={16} /> : <Edit size={16} />}
                      </button>
                    </div>

                    <div className={styles.propertiesForm}>
                      <div className={styles.formGroup}>
                        <label className={styles.label}>
                          <span>Description</span>
                          <textarea
                            value={properties.description}
                            onChange={e =>
                              dispatch({
                                type: 'update',
                                field: 'description',
                                value: e.target.value
                              })
                            }
                            className={styles.textarea}
                            rows={3}
                            placeholder="Enter document description..."
                            disabled={!showProperties || isMutating}
                          />
                        </label>
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            <span>Department</span>
                            <select
                              value={properties.department}
                              onChange={e =>
                                dispatch({
                                  type: 'update',
                                  field: 'department',
                                  value: e.target.value
                                })
                              }
                              className={styles.select}
                              disabled={!showProperties || isMutating}
                            >
                              {departmentOptions.map(opt => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.text}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            <span>Category</span>
                            <select
                              value={properties.category}
                              onChange={e =>
                                dispatch({
                                  type: 'update',
                                  field: 'category',
                                  value: e.target.value
                                })
                              }
                              className={styles.select}
                              disabled={!showProperties || isMutating}
                            >
                              {categoryOptions.map(opt => (
                                <option key={opt.key} value={opt.key}>
                                  {opt.text}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>

                      <div className={styles.formRow}>
                        <div className={styles.formGroup}>
                          <label className={styles.label}>
                            <span>Due Date</span>
                            <input
                              type="datetime-local"
                              value={properties.dueDate ? properties.dueDate.slice(0, 16) : ''}
                              onChange={e =>
                                dispatch({
                                  type: 'update',
                                  field: 'dueDate',
                                  value: e.target.value
                                })
                              }
                              className={styles.input}
                              disabled={!showProperties || isMutating}
                            />
                          </label>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={properties.requiresSignature}
                              onChange={e =>
                                dispatch({
                                  type: 'update',
                                  field: 'requiresSignature',
                                  value: e.target.checked
                                })
                              }
                              className={styles.checkbox}
                              disabled={!showProperties || isMutating}
                            />
                            <span>Requires Signature</span>
                          </label>
                        </div>
                      </div>

                      {showProperties && (
                        <div className={styles.formActions}>
                          <button
                            className={styles.saveBtn}
                            onClick={saveProperties}
                            disabled={isMutating || !selected}
                          >
                            <Save size={16} />
                            {updateMetadataMutation.isPending ? 'Saving...' : 'Save Properties'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selected && properties.requiresSignature && (
                  <div className={styles.signaturesPanel}>
                    <div className={styles.panelHeader}>
                      <h3>Digital Signatures</h3>
                      {isSelectedOrgWide && hasUserSigned ? (
                        <div className={styles.signed}>
                          <CheckCircle2 size={16} />
                          You've Signed
                        </div>
                      ) : !isSelectedOrgWide && isDocumentSigned(selected) ? (
                        <div className={styles.signed}>
                          <CheckCircle2 size={16} />
                          Signed
                        </div>
                      ) : (
                        <button
                          className={styles.toggleBtn}
                          onClick={() => setShowSignaturePanel(!showSignaturePanel)}
                          disabled={isMutating}
                        >
                          <Signature size={16} />
                        </button>
                      )}
                    </div>

                    {isSelectedOrgWide && hasUserSigned && (
                      <div className={styles.signatureInfo}>
                        <CheckCircle2 size={24} style={{ color: '#16A34A', marginBottom: '8px' }} />
                        <p>You have already signed this document.</p>
                      </div>
                    )}

                    {!isSelectedOrgWide && isDocumentSigned(selected) && (
                      <div className={styles.existingSignatures}>
                        <h4 style={{marginBottom: 8}}>Signature Details</h4>
                        {(() => {
                          const signatureData = getDocumentSignatureData(selected);
                          return signatureData ? (
                            <div className={styles.signatureCard}>
                              <div className={styles.signatureImage}>
                                <img
                                  src={signatureData.url}
                                  alt="Document Signature"
                                  style={{ width: '100%', height: 'auto', borderRadius: '6px' }}
                                  onError={e => {
                                    console.warn('Failed to load signature image');
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              </div>
                              <div className={styles.signatureInfo}>
                                <div className={styles.signerName}>
                                  <User size={14} />
                                  {signatureData.signedBy}
                                </div>
                                <div className={styles.signatureDate}>
                                  <Calendar size={14} />
                                  {formatDate(signatureData.signedDate)}
                                </div>
                                {signatureData.note && (
                                  <div className={styles.signatureNote}>
                                    <span>{signatureData.note}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className={styles.signatureInfo}>
                              <p>Document is marked as signed but signature data is not available.</p>
                            </div>
                          );
                        })()}
                        <button
                          className={styles.secondaryBtn}
                          onClick={() => setShowSignaturePanel(true)}
                          disabled={isMutating}
                        >
                          <Signature size={16} />
                          Add Another Signature
                        </button>
                      </div>
                    )}

                    {((!isDocumentSigned(selected) && !isSelectedOrgWide) || 
                      (isSelectedOrgWide && !hasUserSigned && isOrgWideInitialized) ||
                      showSignaturePanel) && (
                      <>
                        {((!isDocumentSigned(selected) && !isSelectedOrgWide) || 
                          (isSelectedOrgWide && !hasUserSigned && isOrgWideInitialized)) && !showSignaturePanel && (
                          <div className={styles.errorBanner}>
                            <p>This document requires a digital signature.</p>
                          </div>
                        )}

                        {showSignaturePanel && (
                          <div className={styles.signatureForm}>
                            <h4>
                              {isSelectedOrgWide 
                                ? 'Sign Organization Document' 
                                : isDocumentSigned(selected)
                                ? 'Add Additional Signature'
                                : 'Add Your Signature'}
                            </h4>

                            <div className={styles.formGroup}>
                              <label className={styles.label}>
                                <span>Note (optional)</span>
                                <input
                                  type="text"
                                  value={sigNote}
                                  onChange={e => setSigNote(e.target.value)}
                                  className={styles.input}
                                  placeholder="Add a note with your signature..."
                                  disabled={isMutating}
                                />
                              </label>
                            </div>

                            <div className={styles.signaturePad}>
                              <div className={styles.padHeader}>
                                <span>Draw your signature below:</span>
                                <button 
                                  className={styles.clearBtn} 
                                  onClick={clearCanvas} 
                                  type="button"
                                  disabled={isMutating}
                                >
                                  <Trash2 size={14} />
                                  Clear
                                </button>
                              </div>
                              <canvas
                                ref={canvasRef}
                                width={400}
                                height={150}
                                className={styles.canvas}
                                onMouseDown={startDraw}
                                onMouseUp={endDraw}
                                onMouseLeave={endDraw}
                                onMouseMove={draw}
                                style={{ 
                                  opacity: isMutating ? 0.5 : 1,
                                  pointerEvents: isMutating ? 'none' : 'auto'
                                }}
                              />
                            </div>

                            {signaturePreview && (
                              <div className={styles.signaturePreview}>
                                <h5>Signature Preview</h5>
                                <img
                                  src={signaturePreview}
                                  alt="Signature Preview"
                                  style={{ border: '1px solid #ccc', borderRadius: 4, maxWidth: 400 }}
                                />
                              </div>
                            )}

                            <div className={styles.formActions}>
                              {!signaturePreview ? (
                                <button
                                  className={styles.saveSignatureBtn}
                                  onClick={handlePreviewSignature}
                                  disabled={!selected || isMutating}
                                >
                                  <Signature size={16} />
                                  Preview Signature
                                </button>
                              ) : (
                                <>
                                  <button
                                    className={styles.saveSignatureBtn}
                                    onClick={saveSignatureHandler}
                                    disabled={!selected || isMutating}
                                  >
                                    <Signature size={16} />
                                    {saveSignatureMutation.isPending ? 'Saving...' : 'Save Signature'}
                                  </button>
                                  <button
                                    className={styles.cancelBtn}
                                    onClick={() => setSignaturePreview(null)}
                                    disabled={isMutating}
                                  >
                                    Edit Signature
                                  </button>
                                </>
                              )}
                              <button
                                className={styles.cancelBtn}
                                onClick={() => {
                                  setShowSignaturePanel(false);
                                  clearCanvas();
                                  setSigNote('');
                                  setSignaturePreview(null);
                                }}
                                disabled={isMutating}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {!showSignaturePanel && 
                         ((!isDocumentSigned(selected) && !isSelectedOrgWide) || 
                          (isSelectedOrgWide && !hasUserSigned && isOrgWideInitialized)) && (
                          <button
                            className={styles.saveSignatureBtn}
                            onClick={() => setShowSignaturePanel(true)}
                            disabled={isMutating}
                          >
                            <Signature size={16} />
                            Sign Document
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;

