// Email notification utility
// Uses nodemailer with Office 365 SMTP
import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { getConnectionPool } from '../db/connection';

export interface EmailData {
  to: string;
  subject: string;
  html: string;
}

async function getSmtpSettings() {
  try {
    const pool = await getConnectionPool();
    const result = await pool.request().query('SELECT TOP 1 * FROM Settings');
    if (result.recordset.length > 0) {
      const row = result.recordset[0];
      return {
        host: row.SmtpHost ?? row.smtpHost ?? 'smtp.office365.com',
        port: row.SmtpPort ?? row.smtpPort ?? 587,
        email: row.SmtpEmail ?? row.smtpEmail ?? '',
        password: row.SmtpPassword ?? row.smtpPassword ?? '',
      };
    }
  } catch (error) {
    console.warn('Unable to read SMTP settings from SQL, falling back to JSON.', error);
  }

  try {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    const data = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(data);
    return {
      host: settings.smtpHost || 'smtp.office365.com',
      port: settings.smtpPort || 587,
      email: settings.smtpEmail || '',
      password: settings.smtpPassword || '',
    };
  } catch (error) {
    console.error('Error reading SMTP settings:', error);
    return {
      host: 'smtp.office365.com',
      port: 587,
      email: '',
      password: '',
    };
  }
}

export async function sendEmail(data: EmailData): Promise<boolean> {
  try {
    const smtpConfig = await getSmtpSettings();
    const smtpEmail = typeof smtpConfig.email === 'string' ? smtpConfig.email.trim() : '';
    const smtpPassword = smtpConfig.password ?? '';

    // Check if SMTP is configured
    if (!smtpEmail || !smtpPassword) {
      console.log('===== EMAIL NOTIFICATION (SMTP NOT CONFIGURED) =====');
      console.log('To:', data.to);
      console.log('Subject:', data.subject);
      console.log('Body:', data.html);
      console.log('====================================================');
      console.log('WARNING: Configure SMTP settings in the Settings page to send actual emails');
      return true; // Simulate success for development
    }

    // Create nodemailer transporter for Office 365
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpEmail,
        pass: smtpPassword,
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: `"URSafe App" <${smtpEmail}>`,
      to: data.to,
      subject: data.subject,
      html: data.html,
    });

    console.log('Email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    // Log the email details for debugging
    console.log('===== EMAIL NOTIFICATION (FAILED) =====');
    console.log('To:', data.to);
    console.log('Subject:', data.subject);
    console.log('=======================================');
    return false;
  }
}

export function generateWelcomeEmail(
  firstName: string,
  email: string,
  password: string,
  role: string,
  requiresPasswordChange = true
): string {
  const displayRole = role === 'super_admin' ? 'SUPER ADMIN' : role.toUpperCase();
  const passwordLabel = requiresPasswordChange ? 'Temporary Password' : 'Password';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .credentials { background-color: white; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
        .role-badge { display: inline-block; padding: 5px 15px; background-color: #dbeafe; color: #1e40af; border-radius: 20px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to URSafe App</h1>
        </div>
        <div class="content">
          <h2>Hello ${firstName}!</h2>
          <p>Your account has been created on the URSafe App application.</p>
          
          <p><strong>Your Role:</strong> <span class="role-badge">${displayRole}</span></p>
          
          <div class="credentials">
            <h3>Login Credentials:</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>${passwordLabel}:</strong> ${password}</p>
          </div>
          
          <p><strong>Access Instructions:</strong></p>
          <ul>
            ${role === 'employee' ? 
              '<li>Download the URSafe App mobile app from the App Store or Google Play</li>' :
              '<li>Visit the web dashboard at: <a href="http://localhost:3000">http://localhost:3000</a></li>'
            }
            <li>Log in with the credentials above</li>
            ${requiresPasswordChange ? '<li>Please change your password after first login</li>' : ''}
          </ul>
          
          ${role === 'manager' ? 
            '<p><strong>Manager Permissions:</strong> You can view, approve, and reject trips from employees in your department.</p>' :
            role === 'admin' ?
            '<p><strong>Admin Permissions:</strong> You can review users, trips, and safety activity across the organization.</p>' :
            role === 'super_admin' ?
            '<p><strong>Super Admin Permissions:</strong> You have full access to all system features, user management, and system settings.</p>' :
            '<p><strong>Employee Access:</strong> Use the mobile app to track your trips and view approval status.</p>'
          }
          
          <p>If you have any questions, please contact your system administrator.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from URSafe App</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generatePasswordUpdatedEmail(firstName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Password Updated</h1>
        </div>
        <div class="content">
          <h2>Hello ${firstName}!</h2>
          <p>Your URSafe App password has been updated successfully.</p>
          <p>If you did not make this change, please contact your system administrator right away.</p>
        </div>
        <div class="footer">
          <p>This is an automated message from URSafe App</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
