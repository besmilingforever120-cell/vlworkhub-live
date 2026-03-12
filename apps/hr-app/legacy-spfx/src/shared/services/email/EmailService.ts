import { BaseSharePointService } from '../core/BaseSharePointService';

export interface EmailRequest {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
}

export class EmailService extends BaseSharePointService {
  /**
   * Send email using SharePoint utility
   */
  async sendEmail(request: EmailRequest): Promise<void> {
    const emailProps = {
      properties: {
        __metadata: { type: 'SP.Utilities.EmailProperties' },
        To: { results: request.to },
        CC: request.cc ? { results: request.cc } : undefined,
        Subject: request.subject,
        Body: request.body,
      }
    };

    try {
      await this.post(
        `${this.baseUrl}/_api/SP.Utilities.Utility.SendEmail`,
        emailProps
      );

      console.log('[EmailService] Email sent successfully');
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      throw new Error('Failed to send email. Please try again or contact HR directly.');
    }
  }

  /**
   * Escape HTML to prevent XSS attacks
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Format HR support request as HTML email
   */
  formatHRSupportEmail(data: {
    requestType: string;
    subject: string;
    description: string;
    priority: string;
    department: string;
    contactName: string;
    contactEmail: string;
  }): string {
    // Escape all user inputs
    const escapedSubject = this.escapeHtml(data.subject);
    const escapedDescription = this.escapeHtml(data.description);
    const escapedDepartment = this.escapeHtml(data.department);
    const escapedContactName = this.escapeHtml(data.contactName);
    const escapedContactEmail = this.escapeHtml(data.contactEmail);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0;
              padding: 0;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 0;
            }
            .header { 
              background: #283852; 
              color: white; 
              padding: 30px 20px; 
              border-radius: 8px 8px 0 0; 
            }
            .header h1 { 
              margin: 0; 
              font-size: 24px; 
              font-weight: 600;
            }
            .header p {
              margin: 8px 0 0 0;
              opacity: 0.9;
              font-size: 14px;
            }
            .content { 
              background: #ffffff; 
              padding: 30px 20px; 
              border-left: 1px solid #e8eaed;
              border-right: 1px solid #e8eaed;
            }
            .field { 
              margin-bottom: 20px; 
            }
            .field-label { 
              font-weight: 600; 
              color: #5f6368; 
              font-size: 12px; 
              text-transform: uppercase; 
              margin-bottom: 6px;
              letter-spacing: 0.5px;
              display: block;
            }
            .field-value { 
              color: #202124; 
              font-size: 15px; 
              line-height: 1.5;
            }
            .priority { 
              display: inline-block; 
              padding: 6px 14px; 
              border-radius: 6px; 
              font-weight: 600; 
              font-size: 13px; 
            }
            .priority-high { 
              background: #fed7aa; 
              color: #c2410c; 
            }
            .priority-urgent { 
              background: #fecaca; 
              color: #991b1b; 
            }
            .priority-normal { 
              background: #dbeafe; 
              color: #1d4ed8; 
            }
            .priority-low { 
              background: #f3f4f6; 
              color: #6b7280; 
            }
            .footer { 
              background: #f8f9fa; 
              padding: 20px; 
              border: 1px solid #e8eaed; 
              border-top: none; 
              border-radius: 0 0 8px 8px; 
              text-align: center; 
              font-size: 12px; 
              color: #5f6368; 
            }
            .description { 
              background: #f8f9fa; 
              padding: 16px; 
              border-radius: 6px; 
              border-left: 3px solid #1a73e8;
              white-space: pre-wrap; 
              font-size: 14px;
              line-height: 1.6;
              word-wrap: break-word;
            }
            .contact-info {
              background: #e8f0fe;
              padding: 16px;
              border-radius: 6px;
              margin-top: 8px;
            }
            .contact-info strong {
              color: #1a73e8;
            }
            .divider {
              height: 1px;
              background: #e8eaed;
              margin: 24px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎫 New HR Support Request</h1>
              <p>Submitted via HR Portal</p>
            </div>
            <div class="content">
              <div class="field">
                <div class="field-label">📋 Request Type</div>
                <div class="field-value"><strong>${this.getRequestTypeLabel(data.requestType)}</strong></div>
              </div>
              
              <div class="field">
                <div class="field-label">📝 Subject</div>
                <div class="field-value"><strong>${escapedSubject}</strong></div>
              </div>
              
              <div class="field">
                <div class="field-label">⚠️ Priority</div>
                <div class="field-value">
                  <span class="priority priority-${data.priority.toLowerCase()}">${data.priority}</span>
                </div>
              </div>
              
              ${data.department ? `
                <div class="field">
                  <div class="field-label">🏢 Department/Team</div>
                  <div class="field-value">${escapedDepartment}</div>
                </div>
              ` : ''}
              
              <div class="divider"></div>
              
              <div class="field">
                <div class="field-label">💬 Detailed Description</div>
                <div class="description">${escapedDescription}</div>
              </div>
              
              <div class="divider"></div>
              
              <div class="field">
                <div class="field-label">👤 Submitted By</div>
                <div class="contact-info">
                  <strong>${escapedContactName}</strong><br>
                  📧 <a href="mailto:${escapedContactEmail}" style="color: #1a73e8; text-decoration: none;">${escapedContactEmail}</a>
                </div>
              </div>
              
              <div class="field">
                <div class="field-label">🕐 Submitted On</div>
                <div class="field-value">${new Date().toLocaleString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</div>
              </div>
            </div>
            <div class="footer">
              This is an automated message from the HR Portal Support System<br>
              Please respond directly to the submitter's email address
            </div>
          </div>
        </body>
      </html>
    `;
  }

  private getRequestTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      benefits: 'Benefits & Insurance',
      payroll: 'Payroll & Compensation',
      leave: 'Time Off & Leave',
      policy: 'Policy Questions',
      workplace: 'Workplace Issues',
      general: 'General Inquiry',
    };
    return labels[type] || type;
  }
}