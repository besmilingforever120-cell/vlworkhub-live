import { useState, useContext, useMemo } from 'react';
import { 
  Send, 
  Users, 
  Mail, 
  Phone, 
  Clock, 
  Shield, 
  DollarSign, 
  Calendar, 
  FileText, 
  HelpCircle,
  CheckCircle,
  AlertCircle,
  User
} from 'lucide-react';
import styles from './HrSupport.module.scss';
import * as React from 'react';
import { AppContext } from '../App';
import { SharePointServiceFactory } from '../../../../shared/services';
import type { LucideIcon } from 'lucide-react';

type Color = 'blue' | 'green' | 'orange' | 'purple' | 'red' | 'gray';

interface RequestTypeItem {
  value: string;
  label: string;
  icon: LucideIcon;
  color: Color;
}

const colorClass: Record<Color, string> = {
  blue: styles.blue,
  green: styles.green,
  orange: styles.orange,
  purple: styles.purple,
  red: styles.red,
  gray: styles.gray,
};

interface ContactInfo {
  name: string;
  role: string;
  email: string;
  phone: string;
  availability: string;
  status: 'available' | 'busy' | 'away';
}

const HrSupport: React.FC = () => {
  const context = useContext(AppContext);
  const services = useMemo(
    () => SharePointServiceFactory.getInstance(context!),
    [context]
  );

  const [requestType, setRequestType] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [priority, setPriority] = useState<string>('Normal');
  const [contactName, setContactName] = useState<string>('');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [departmentConcern, setDepartmentConcern] = useState<string>('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const hrTeam: ContactInfo[] = [
    {
      name: "Melanie Eliason",
      role: "HR Director",
      email: "hr@vdacl.ca",
      phone: "+1 (250) 542-2374 Ext. 122",
      availability: "Mon-Fri, 9:00 AM - 4:00 PM",
      status: 'available'
    },
    {
      name: "Sarah Hickey",
      role: "Payroll",
      email: "payroll@vdacl.ca",
      phone: "+1 (250) 542-2374 Ext. 106",
      availability: "Mon-Fri, 9:00 AM - 4:00 PM",
      status: 'available'
    },
    {
      name: "Ismail Ismaili",
      role: "IT & Accounting Manager",
      email: "it@vdacl.ca",
      phone: "+1 (250) 542-2374 Ext.108",
      availability: "Mon-Thu, 9:00 AM - 4:00 PM",
      status: 'available'
    }
  ];

  const requestTypes: RequestTypeItem[] = [
  { value: 'benefits', label: 'Benefits & Insurance', icon: Shield, color: 'blue' },
  { value: 'payroll', label: 'Payroll & Compensation', icon: DollarSign, color: 'green' },
  { value: 'leave', label: 'Time Off & Leave', icon: Calendar, color: 'orange' },
  { value: 'policy', label: 'Policy Questions', icon: FileText, color: 'purple' },
  { value: 'workplace', label: 'Workplace Issues', icon: Users, color: 'red' },
  { value: 'general', label: 'General Inquiry', icon: HelpCircle, color: 'gray' }
];


  const handleSubmit = async (): Promise<void> => {
    // Validation
    if (!requestType || !subject || !description || !contactName || !contactEmail) {
      setErrorMessage('Please fill in all required fields.');
      setSubmissionStatus('error');
      setTimeout(() => setSubmissionStatus('idle'), 3000);
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
      setErrorMessage('Please enter a valid email address.');
      setSubmissionStatus('error');
      setTimeout(() => setSubmissionStatus('idle'), 3000);
      return;
    }

    setSubmissionStatus('submitting');
    setErrorMessage('');

    try {
      console.log('[HrSupport] Preparing to submit request...');

      // Format email body
      const emailBody = services.email.formatHRSupportEmail({
        requestType,
        subject,
        description,
        priority,
        department: departmentConcern,
        contactName,
        contactEmail,
      });

      // Determine recipient based on request type
      const recipientMap: Record<string, string> = {
        payroll: 'payroll@vdacl.ca',
        benefits: 'hr@vdacl.ca',
        leave: 'hr@vdacl.ca',
        policy: 'hr@vdacl.ca',
        workplace: 'hr@vdacl.ca',
        general: 'hr@vdacl.ca',
      };

      const recipient = recipientMap[requestType] || 'hr@vdacl.ca';

      console.log('[HrSupport] Sending email to:', recipient);

      // Send email
      await services.email.sendEmail({
        to: [recipient],
        cc: [contactEmail], // CC the submitter for confirmation
        subject: `[HR Support] ${subject}`,
        body: emailBody,
      });

      console.log('[HrSupport] Email sent successfully');

      setSubmissionStatus('success');
      
      // Reset form after 2 seconds
      setTimeout(() => {
        setRequestType('');
        setSubject('');
        setDescription('');
        setContactName('');
        setContactEmail('');
        setDepartmentConcern('');
        setPriority('Normal');
      }, 2000);
      
      // Reset status after 5 seconds
      setTimeout(() => setSubmissionStatus('idle'), 5000);
      
    } catch (error: any) {
      console.error('[HrSupport] Submission error:', error);
      setSubmissionStatus('error');
      setErrorMessage(
        error.message || 
        'Failed to submit request. Please try contacting HR directly via email or phone.'
      );
      setTimeout(() => {
        setSubmissionStatus('idle');
        setErrorMessage('');
      }, 5000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>
              <User />
            </div>
            <div className={styles.headerText}>
              <h1>HR Support Center</h1>
              <p>Get help with HR-related questions and submit requests</p>
            </div>
          </div>
        </div>

        {/* Status Messages */}
        {submissionStatus === 'success' && (
          <div className={`${styles.statusMessage} ${styles.success}`}>
            <CheckCircle />
            <div>
              <p className={styles.statusTitle}>Request submitted successfully! ✅</p>
              <p className={styles.statusText}>
                {"Your request has been sent to the HR team. You'll receive a confirmation email and we will respond within 1-2 business days."}
              </p>
            </div>
          </div>
        )}

        {submissionStatus === 'error' && (
          <div className={`${styles.statusMessage} ${styles.error}`}>
            <AlertCircle />
            <div>
              <p className={styles.statusTitle}>Submission failed</p>
              <p className={styles.statusText}>
                {errorMessage || 'Please try again or contact HR directly via email or phone.'}
              </p>
            </div>
          </div>
        )}

        <div className={styles.content}>
          {/* Request Form */}
          <div className={styles.formSection}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Submit a Request</h2>
                <p>{"Fill out the form below and we will respond within 1-2 business days"}</p>
              </div>

              <div className={styles.formContent}>
                {/* Request Type Selection */}
                <div className={styles.formGroup}>
                  <h3>Request Type <span className={styles.required}>*</span></h3>
                  <div className={styles.requestTypeGrid}>
                    {requestTypes.map(type => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.value}
                          type="button"
                          onClick={() => setRequestType(type.value)}
                          className={`${styles.requestTypeCard} ${colorClass[type.color]}${
                            requestType === type.value ? styles.selected : ''
                          }`}
                          disabled={submissionStatus === 'submitting'}
                        >
                          <div className={styles.requestTypeIcon}>
                            <Icon />
                          </div>
                          <p>{type.label}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Form Fields */}
                <div className={styles.formRow}>
                  <div className={styles.formField}>
                    <label>Subject <span className={styles.required}>*</span></label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Brief description of your request"
                      disabled={submissionStatus === 'submitting'}
                      maxLength={100}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label>Priority</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      disabled={submissionStatus === 'submitting'}
                    >
                      <option value="Low">Low</option>
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div className={styles.formField}>
                  <label>Department/Team</label>
                  <input
                    type="text"
                    value={departmentConcern}
                    onChange={(e) => setDepartmentConcern(e.target.value)}
                    placeholder="Enter your department (optional)"
                    disabled={submissionStatus === 'submitting'}
                    maxLength={50}
                  />
                </div>

                <div className={styles.formField}>
                  <label>Detailed Description <span className={styles.required}>*</span></label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Please provide as much detail as possible about your request or concern..."
                    rows={5}
                    disabled={submissionStatus === 'submitting'}
                    maxLength={2000}
                  />
                  <small className={styles.charCount}>
                    {description.length}/2000 characters
                  </small>
                </div>

                <div className={styles.formDivider}>
                  <h3>Contact Information</h3>
                  <div className={styles.formRow}>
                    <div className={styles.formField}>
                      <label>Your Name <span className={styles.required}>*</span></label>
                      <input
                        type="text"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Full name"
                        disabled={submissionStatus === 'submitting'}
                        maxLength={100}
                      />
                    </div>
                    <div className={styles.formField}>
                      <label>Email Address <span className={styles.required}>*</span></label>
                      <input
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="your.email@company.com"
                        disabled={submissionStatus === 'submitting'}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button
                    onClick={handleSubmit}
                    disabled={submissionStatus === 'submitting'}
                    className={styles.submitButton}
                  >
                    <Send />
                    {submissionStatus === 'submitting' ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className={styles.sidebar}>
            {/* HR Team Contacts */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>HR Team Contacts</h3>
                <p>Reach out directly for urgent matters</p>
              </div>
              
              <div className={styles.contactList}>
                {hrTeam.map((contact, index) => (
                  <div key={index} className={styles.contactItem}>
                    <div className={styles.contactHeader}>
                      <div className={styles.contactInfo}>
                        <h4>{contact.name}</h4>
                        <span className={styles.contactRole}>{contact.role}</span>
                      </div>
                      <div className={`${styles.statusIndicator} ${styles[contact.status]}`} />
                    </div>
                    
                    <div className={styles.contactDetails}>
                      <div className={styles.contactDetail}>
                        <Mail size={14} />
                        <a href={`mailto:${contact.email}`}>{contact.email}</a>
                      </div>
                      <div className={styles.contactDetail}>
                        <Phone size={14} />
                        <span>{contact.phone}</span>
                      </div>
                      <div className={styles.contactDetail}>
                        <Clock size={14} />
                        <span>{contact.availability}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default HrSupport;