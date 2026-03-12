import * as React from 'react';
import styles from './Onboarding.module.scss';
import { 
  ChevronUp, 
  Play, 
  BookOpen, 
  Shield, 
  Monitor, 
  FileText, 
  PenTool,
  X,
  Upload,
  File,
  Send,
  AlertCircle,
  Circle,
  CheckCircle2,
  CheckCircle
} from 'lucide-react';
import { spfi } from '@pnp/sp';
import { SPFx } from '@pnp/sp/presets/all';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import { AppContext } from '../App';

type Section = {
  title: string;
  src: string;
  tall?: boolean;
  description?: string;
  icon?: React.ComponentType<any>;
  category?: string;
  external?: boolean;
};

type DocumentType = {
  id: string;
  label: string;
  required: boolean;
  description?: string;
  linkLabel?: string;
  linkHref?: string;
  file?: File;
  uploaded?: boolean;
};

interface OnboardingStatusItem {
  Id?: number;
  Title: string;
  Email: string;
  CompletionDate?: string;
  SectionsCompleted: string;
  Status: string;
  CurrentStep: string;
}

const SECTIONS: Section[] = [
  { title: 'Welcome to Venture Training', src: 'https://www.canva.com/design/DAEhjxekM_c/PArzBee652TRjNIgZSlj-g/view?embed', description: 'Get started with your journey at Venture. Learn about our mission, values, and what makes us unique.', icon: Play, category: 'Getting Started' },
  { title: 'Person-Centered Planning', src: 'https://www.canva.com/design/DAEhwM89Mxw/dD9ulRTeq8oPPR7h-RU9Ag/view?embed', description: 'Understand our approach to person-centered care and how to implement it in your daily work.', icon: BookOpen, category: 'Core Training' },
  { title: 'Working Safely With Us', src: 'https://www.canva.com/design/DAEhwiorlRY/9pR1mvdwjF83eBurAiFYDg/view?embed', description: 'Essential safety protocols and procedures to ensure a safe working environment for everyone.', icon: Shield, category: 'Safety & Compliance' },
  { title: 'IT Systems Tutorial', src: 'https://www.canva.com/design/DAEhrbdeAzw/-ZsDeQUTcsY4vhtKJahe_w/view?embed', description: 'Master the technology tools and systems you\'ll use in your role.', icon: Monitor, category: 'Technical Training' },
  { title: 'Privacy and Information Management', src: 'https://www.communitylivingbc.ca/CLBC-PIM/index.html', tall: true, description: 'Learn about privacy laws, data protection, and proper information handling procedures.', icon: FileText, category: 'Compliance', external: true },
  { title: 'Membership Signing', src: 'https://powerforms.docusign.net/516e5f4f-a2b5-4698-9604-a5755fd91831?env=ca&acct=31e7deb0-8039-4240-8860-f75e4a7adeaf&accountId=31e7deb0-8039-4240-8860-f75e4a7adeaf', tall: true, description: 'Complete your membership documentation and digital signatures.', icon: PenTool, category: 'Documentation', external: true },
];

const REQUIRED_DOCUMENTS: DocumentType[] = [
  {
    id: 'Banking info',
    label: 'Banking info',
    required: true,
    description: 'Copy of banking info for direct deposit/Void Cheque.'
  },
  {
    id: 'Certificates',
    label: 'Certificates',
    required: true,
    description: 'Please upload all your Educational certificates.'
  },
  {
    id: 'Food Safe',
    label: 'Food Safe',
    required: true,
    description: 'Your food safe certificate should be valid, not expired.'
  },
  {
    id: 'WHIMS',
    label: 'WHIMS',
    required: true,
    description: 'Upload your WHIMS.'
  },
  {
    id: 'First Aid',
    label: 'First Aid',
    required: true,
    description: 'Please upload your first aid certificate.'
  },
  {
    id: 'Mandt Certificate',
    label: 'Mandt Certificate',
    required: true,
    description: 'Please upload your Mandt/Non-Violent Crisis Intervention training certificate when you get it.'
  },
  {
    id: 'Other',
    label: 'Other',
    required: true,
    description: 'Please upload any other relevant documents here.'
  },
  {
    id: 'TB Test Results',
    label: 'TB Test Results',
    required: true
  },
  {
    id: "Driver's License (Front and Back)",
    label: "Driver's License (Front and Back)",
    required: true
  },
  {
    id: 'Proof of Vaccinations',
    label: 'Proof of Vaccinations',
    required: true,
    description: "Please if applicable upload your Covid-19 and current season's influenza shots."
  },
  {
    id: "Driver's abstract",
    label: "Driver's abstract",
    required: true,
    description: 'How to submit a Driver’s Abstract: Please click the link and complete the steps for obtaining your online driving record history. When prompted please select Personal Driving Record and you can either download the results emailed to you and send them to meliason@vdacl.ca or include that email address when you submit for results.',
    linkLabel: 'Open ICBC Driver Abstract portal',
    linkHref: 'https://onlinebusiness.icbc.com/clio/'
  }
];

const appendParam = (url: string, param: string) => {
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
};

const getEmbedSrc = (src: string) => {
  if (!src.includes('canva.com')) {
    return src;
  }
  let next = src;
  if (!next.includes('embed')) {
    next = appendParam(next, 'embed=1');
  }
  next = appendParam(next, 'fullscreen=1');
  return next;
};

export default function Onboarding(): React.ReactElement {
  const context = React.useContext(AppContext);

  if (!context) {
    return (
      <div className={styles.onboarding} style={{ textAlign: 'center', padding: '60px 20px' }}>
        <AlertCircle size={48} style={{ color: '#dc2626', marginBottom: '16px' }} />
        <h3>Context Error</h3>
        <p>Unable to load application context. Please refresh the page.</p>
      </div>
    );
  }
  const [fullScreenIndex, setFullScreenIndex] = React.useState<number | null>(null);
  const [completedSections, setCompletedSections] = React.useState<Record<number, boolean>>({});
  const [documents, setDocuments] = React.useState<DocumentType[]>(REQUIRED_DOCUMENTS);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string>('');
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string>('');
  const [uploadedDocumentUrls, setUploadedDocumentUrls] = React.useState<Record<string, string>>({});
  

  const sp = React.useMemo(() => spfi().using(SPFx(context)), [context]);

  React.useEffect(() => {
    loadOnboardingProgress();
  }, []);

  const loadOnboardingProgress = async () => {
    try {
      setLoading(true);
      setError('');
      const userEmail = context.pageContext.user.email;
      const userLoginName = context.pageContext.user.loginName.split('|').pop() || userEmail;
      setCurrentUserEmail(userEmail);

      // Load onboarding status
      const statusItems = await sp.web.lists.getByTitle('OnboardingStatus').items
        .filter(`Email eq '${userEmail}'`).top(1)();

      if (statusItems.length > 0) {
        const status = statusItems[0] as OnboardingStatusItem;
        let sections: Record<number, boolean> = {};
        try {
          sections = status.SectionsCompleted ? JSON.parse(status.SectionsCompleted) : {};
        } catch {
          sections = {};
        }
        setCompletedSections(sections);
        setOnboardingCompleted(status.Status === 'Completed');
      }

      // Check for uploaded documents in the document library
      try {
        const folderPath = `OnboardingDocuments/${userLoginName}`;
        const folder = await sp.web.getFolderByServerRelativePath(folderPath).files();
        
        if (folder.length > 0) {
          const uploadedDocs = new Set<string>();
          const urls: Record<string, string> = {};
          
          folder.forEach(file => {
            // Extract document type from filename
            const docType = REQUIRED_DOCUMENTS.find(doc => 
              file.Name.includes(doc.id.replace(/\s+/g, '_'))
            );
            if (docType) {
              uploadedDocs.add(docType.id);
              urls[docType.id] = file.ServerRelativeUrl;
            }
          });
          
          setUploadedDocumentUrls(urls);
          setDocuments(prev => prev.map(doc => ({
            ...doc,
            uploaded: uploadedDocs.has(doc.id)
          })));
        }
      } catch (folderError) {
        // Folder doesn't exist yet, which is fine for new users
        console.log('User folder does not exist yet');
      }

    } catch (err) {
      console.error('Error loading onboarding progress:', err);
      setError('Failed to load onboarding progress. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

 const saveProgress = async (sections: Record<number, boolean>) => {
  const userEmail = context.pageContext.user.email;

  try {
    const progressData: Partial<OnboardingStatusItem> = {
      Title: context.pageContext.user.displayName,
      Email: userEmail,
      SectionsCompleted: JSON.stringify(sections),
      Status: Object.values(sections).every(Boolean)
        ? 'Pending Documents'
        : 'In Progress',
      CurrentStep: Object.values(sections).every(Boolean)
        ? 'Document Upload'
        : 'Training Modules'
    };

    const list = sp.web.lists.getByTitle('OnboardingStatus');
    const existingStatus = await list.items
      .filter(`Email eq '${userEmail}'`)
      .top(1)();

    if (existingStatus.length > 0) {
      await list.items.getById(existingStatus[0].Id).update(progressData);
    } else {
      await list.items.add(progressData);
    }
  } catch (err) {
    console.error('Error saving progress:', err);
    throw err;
  }
};



  const setCompletion = async (index: number, isComplete: boolean) => {
    const newSections = { ...completedSections, [index]: isComplete };
    setCompletedSections(newSections);

    try {
      await saveProgress(newSections);
    } catch (err) {
      console.error('Error saving progress:', err);
      setCompletedSections(completedSections);
      setError('Error saving progress. Please try again.');
    }
  };

  const openSection = (index: number) => {
    const section = SECTIONS[index];
    if (section.external) {
      window.open(section.src, '_blank', 'noopener,noreferrer');
      if (!completedSections[index]) {
        setCompletion(index, true);
      }
      return;
    }
    setFullScreenIndex(index);
  };

  const closeSection = () => {
    if (fullScreenIndex !== null && !completedSections[fullScreenIndex as number]) {
      setCompletion(fullScreenIndex as number, true);
    }
    setFullScreenIndex(null);
  };


  const handleDocumentUpload = (documentId: string, file: File) => {
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId ? { ...doc, file, uploaded: false } : doc
    ));
  };

  // Helper: sanitize folder / file name (replace problematic chars)
const sanitizeName = (name: string) => {
  return name.replace(/[^a-zA-Z0-9_\-\.]/g, '_'); // keep ., -, _, alphanumeric
};

/**
 * Ensure the user's folder exists under the library.
 * Returns the server-relative folder path (e.g. "/sites/hr/OnboardingDocuments/john_doe")
 */
const ensureUserFolder = async (libraryName: string, userLoginName: string): Promise<string> => {
  // libraryName: "OnboardingDocuments"
  const webRel = (context.pageContext.web.serverRelativeUrl || '').replace(/\/$/, ''); // "/sites/hr" or ""
  const libraryRoot = `${webRel}/${libraryName}`; // "/sites/hr/OnboardingDocuments"
  const safeUserFolder = sanitizeName(userLoginName);
  const folderPath = `${libraryRoot}/${safeUserFolder}`; // server-relative folder path

  try {
    // Try checking existence (this uses server-relative path)
    const info = await sp.web.getFolderByServerRelativePath(folderPath).select('Exists')();
    if (info && info.Exists) {
      return folderPath;
    }
  } catch (e) {
    // If error, continue to create below
    console.log('Folder does not exist (or could not read) — will try to create:', folderPath);
  }

  // Create the folder under library root
  try {
    // addUsingPath on the library root's folders to create a child folder
    await sp.web.getFolderByServerRelativePath(libraryRoot).folders.addUsingPath(safeUserFolder);
    return folderPath;
  } catch (createErr) {
    console.error('Failed to create user folder:', createErr);
    throw new Error(`Could not create folder ${folderPath}: ${createErr.message || createErr}`);
  }
};

/**
 * Upload file into OnboardingDocuments/<userFolder> using server-relative paths.
 * Returns the server-relative URL of the uploaded file (e.g. "/sites/hr/OnboardingDocuments/john_doe/Resume_123.jpg")
 */
const uploadFileToDocumentLibrary = async (
  file: File,
  documentType: string,
  userLoginName: string,
  libraryName = 'OnboardingDocuments'
): Promise<string> => {
  try {
    // Build safe names
// replaces invalid chars
    const folderPath = await ensureUserFolder(libraryName, userLoginName);

    const timestamp = Date.now();
    const cleanedDocType = sanitizeName(documentType.replace(/\s+/g, '_'));
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
    const fileName = `${cleanedDocType}_${timestamp}${ext}`;

    // Upload file
    const uploadResult = await sp.web
      .getFolderByServerRelativePath(folderPath)
      .files.addUsingPath(fileName, file, { Overwrite: true });

    // ✅ Use the returned serverRelativeUrl directly (don’t rebuild manually)
    const uploadedServerRelativeUrl = uploadResult.ServerRelativeUrl;

    // Get list item for metadata update
    const item = await sp.web
      .getFileByServerRelativePath(uploadedServerRelativeUrl)
      .listItemAllFields.select('Id')();

    if (item && item.Id) {
      await sp.web.lists.getByTitle(libraryName).items
        .getById(item.Id)
        .update({
          Title: `${documentType} - ${context.pageContext.user.displayName}`,
          DocumentType: documentType,
          EmployeeEmail: context.pageContext.user.email,
          SubmissionDate: new Date().toISOString()
        });
    }

    return uploadedServerRelativeUrl;
  } catch (err) {
    console.error('Error uploading file to document library:', err);
    throw new Error((err as Error).message || 'Upload failed');
  }
};

 const handleDocumentSubmission = async () => {
  setIsSubmitting(true);
  setError('');

  try {
    const docsToUpload = documents.filter(d => d.file && !d.uploaded);
    if (docsToUpload.length === 0) {
      setError('No new documents to upload.');
      setIsSubmitting(false);
      return;
    }

    // get login name (strip claims prefix if present)
    const userLoginName = (context.pageContext.user.loginName || context.pageContext.user.email).split('|').pop() || context.pageContext.user.email;

    const uploadedUrls: Record<string, string> = { ...uploadedDocumentUrls };

    for (const doc of docsToUpload) {
      if (!doc.file) continue;
      try {
        const srvUrl = await uploadFileToDocumentLibrary(doc.file, doc.id, userLoginName, 'OnboardingDocuments');
        uploadedUrls[doc.id] = srvUrl;
      } catch (uploadErr) {
        console.error(`Error uploading ${doc.label}:`, uploadErr);
        throw new Error(`Failed to upload ${doc.label}. ${(uploadErr as Error).message || ''}`);
      }
    }

    // update local state (mark uploaded, clear file)
    setUploadedDocumentUrls(uploadedUrls);
    setDocuments(prev => prev.map(d => {
      const wasUploaded = uploadedUrls[d.id] !== undefined;
      return {
        ...d,
        uploaded: wasUploaded ? true : d.uploaded,
        file: undefined
      };
    }));

    alert('Files uploaded successfully!');
  } catch (err) {
    console.error('handleDocumentSubmission error:', err);
    setError((err as Error).message || 'Error submitting documents');
  } finally {
    setIsSubmitting(false);
  }
};


  const completeOnboarding = async () => {
    try {
      setError('');
      const completionData: Partial<OnboardingStatusItem> = {
        Status: 'Completed',
        CompletionDate: new Date().toISOString(),
        CurrentStep: 'Completed'
      };

      const existing = await sp.web.lists.getByTitle('OnboardingStatus').items
        .filter(`Email eq '${currentUserEmail}'`).top(1)();

      if (existing.length > 0) {
        await sp.web.lists.getByTitle('OnboardingStatus').items.getById(existing[0].Id).update(completionData);
      }

      setOnboardingCompleted(true);
      alert('🎉 Congratulations! Your onboarding is complete. Welcome to the team!');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      setError('Error saving completion status. Please contact IT support.');
    }
  };

  if (loading) {
    return (
      <div className={styles.onboarding} style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div>Loading your onboarding progress...</div>
      </div>
    );
  }

  const completedCount = Object.values(completedSections).filter(Boolean).length;
  const progressPercentage = Math.round((completedCount / SECTIONS.length) * 100);
  const allSectionsCompleted = completedCount === SECTIONS.length;
  const requiredDocsUploaded = documents
    .filter(d => d.required)
    .every(d => d.uploaded || d.file);

  return (
    <div className={styles.onboarding}>
      {error && (
        <div style={{ 
          background: '#fef2f2', 
          border: '1px solid #fecaca', 
          borderRadius: '8px', 
          padding: '12px 16px', 
          marginBottom: '24px',
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Employee Onboarding</h1>
          <p className={styles.subtitle}>
            Welcome {context.pageContext.user.displayName}! Complete all sections and upload required documents to get started with confidence.
          </p>
        </div>
        
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressLabel}>Progress</span>
            <span className={styles.progressValue}>{completedCount}/{SECTIONS.length}</span>
          </div>
          <div className={styles.progressBar}>
            <div 
              className={styles.progressFill} 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className={styles.progressText}>
            {progressPercentage}% Complete
          </div>
        </div>
      </div>

      <div className={styles.sectionsGrid}>
        {SECTIONS.map((section, index) => {
          const isCompleted = !!completedSections[index];
          const IconComponent = section.icon || BookOpen;

          return (
            <div 
              key={index} 
              className={`${styles.sectionCard} ${isCompleted ? styles.completed : ''}`}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.iconWrapper}>
                    <IconComponent size={20} />
                  </div>
                  <div className={styles.titleSection}>
                    <div className={styles.category}>{section.category}</div>
                    <h3 className={styles.sectionTitle}>{section.title}</h3>
                    {section.description && (
                      <p className={styles.description}>{section.description}</p>
                    )}
                  </div>
                </div>
                
                <div className={styles.cardActions}>
                  <div className={`${styles.completeIndicator} ${isCompleted ? styles.completed : ''}`}>
                    {isCompleted ? <CheckCircle2/> : <Circle size={14}/>}
                  </div>
                </div>
              </div>

              <div className={styles.cardContent}>
                <button
                  className={styles.previewButton}
                  onClick={() => openSection(index)}
                  title={section.external ? 'Open in new window' : 'Open training'}
                >
                  <div className={styles.previewThumb}>
                    <iframe
                      className={`${styles.previewFrame} ${section.tall ? styles.previewTall : ''}`}
                      loading="lazy"
                      frameBorder="0"
                      src={getEmbedSrc(section.src)}
                      title={`${section.title} preview`}
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                    <div className={styles.previewOverlay}>
                      <Play size={18} />
                      <span>{section.external ? 'Open in New Window' : 'Open'}</span>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {fullScreenIndex !== null && (
        <div className={styles.fullscreenOverlay}>
          <div className={styles.fullscreenContent}>
            <button
              className={styles.fullscreenClose}
              onClick={closeSection}
              title="Close"
              style={{
                position: 'fixed',
                top: '72px',
                right: '22px',
                zIndex: 10001,
                background: '#EF4444',
                color: '#FFFFFF',
                border: 'none',
                width: '38px',
                height: '38px',
                borderRadius: '999px',
                boxShadow: '0 8px 16px rgba(15, 23, 42, 0.2)'
              }}
            >
              <X size={18} />
            </button>
            <div className={styles.expandedHeader}>
              <span className={styles.expandedLabel}>{SECTIONS[fullScreenIndex].title}</span>
              <button
                className={styles.expandBtn}
                onClick={closeSection}
                title="Close preview"
              >
                <ChevronUp size={16} />
                Close
              </button>
            </div>
            <div className={styles.fullscreenFrame}>
              <iframe
                className={`${styles.frame} ${SECTIONS[fullScreenIndex].tall ? styles.tall : ''}`}
                loading="lazy"
                frameBorder="0"
                src={getEmbedSrc(SECTIONS[fullScreenIndex].src)}
                title={SECTIONS[fullScreenIndex].title}
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      )}

      {allSectionsCompleted && (
        <div className={styles.onboardingDone}>
          <CheckCircle size={18} />
          Congrats! Your onboarding trainings are done. Please upload the required documents below.
        </div>
      )}

      {/* Document Upload Section */}
      {allSectionsCompleted && !onboardingCompleted && (
        <div className={styles.documentSection}>
          <h3>
            <Upload size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Required Documents
          </h3>
          <p style={{ color: '#64748b', marginBottom: 20 }}>
            Please upload the following documents to complete your onboarding. Required documents are marked with *.
          </p>
          
          <div className={styles.documentGrid}>
            {documents.map((doc) => (
              <div key={doc.id} className={styles.documentItem}>
                <label className={`${styles.documentLabel} ${doc.uploaded ? styles.uploaded : ''}`}>
                  <div className={styles.documentIcon}>
                    {doc.uploaded ? <CheckCircle size={24} /> : <File size={24} />}
                  </div>
                  <div className={styles.documentText}>
                    <span>{doc.label} {doc.required && '*'}</span>
                    {doc.description && (
                      <small>{doc.description}</small>
                    )}
                    {doc.linkHref && doc.linkLabel && (
                      <small>
                        <a href={doc.linkHref} target="_blank" rel="noreferrer">
                          {doc.linkLabel}
                        </a>
                      </small>
                    )}
                    <small>{doc.uploaded ? 'Uploaded' : 'Not uploaded'}</small>
                  </div>
                  {!doc.uploaded && (
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleDocumentUpload(doc.id, file);
                      }}
                      className={styles.fileInput}
                    />
                  )}
                </label>
                {doc.file && !doc.uploaded && (
                  <div className={styles.fileInfo}>
                    Selected: {doc.file.name}
                  </div>
                )}
                {doc.uploaded && uploadedDocumentUrls[doc.id] && (
                  <div className={styles.fileInfo} style={{ color: '#10b981' }}>
                    ✓ File uploaded successfully
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <button
            className={styles.submitBtn}
            onClick={handleDocumentSubmission}
            disabled={!documents.some(d => d.file && !d.uploaded) || isSubmitting}
          >
            <Send size={16} style={{ marginRight: 8 }} />
            {isSubmitting ? 'Uploading Documents...' : 'Upload Selected Documents'}
          </button>

          {!requiredDocsUploaded && (
            <p style={{ color: '#ef4444', marginTop: '10px' }}>
              Please upload all required documents marked with *
            </p>
          )}
        </div>
      )}

      <div className={styles.completionSummary}>
        <div className={styles.summaryCard}>
          <h3>Onboarding Summary</h3>
          <div className={styles.summaryContent}>
            <p>
              Training Progress: <strong>{completedCount} out of {SECTIONS.length}</strong> sections completed
              {allSectionsCompleted && <span className={styles.statusComplete}> ✓ Training Complete</span>}
            </p>
            
            <p>
              Documents: <strong>{documents.filter(d => d.uploaded).length} out of {documents.filter(d => d.required).length}</strong> required documents uploaded
              {requiredDocsUploaded && documents.filter(d => d.required).every(d => d.uploaded) && 
                <span className={styles.statusComplete}> ✓ Documents Complete</span>}
            </p>
            
            {allSectionsCompleted && documents.filter(d => d.required).every(d => d.uploaded) && !onboardingCompleted && (
              <div className={styles.completionActions}>
                <p className={styles.congratulations}>
                 {" 🎉 All requirements completed! You're ready to finish onboarding."}
                </p>
                <button 
                  className={styles.finishBtn}
                  onClick={completeOnboarding}
                >
                  Complete Onboarding Process
                </button>
              </div>
            )}

            {onboardingCompleted && (
              <div className={styles.completedMessage}>
                ✅ Onboarding completed successfully! Welcome to the team!
              </div>
            )}
          </div>
        </div> 
      </div>
    </div>
  );
}
