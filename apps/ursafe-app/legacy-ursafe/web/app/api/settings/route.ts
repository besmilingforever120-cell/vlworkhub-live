import { NextRequest, NextResponse } from 'next/server';
import { getConnectionPool } from '../../../db/connection';

const toSettingsResponse = (row?: Record<string, any>) => ({
  ratePerKm: row?.RatePerKm ?? row?.ratePerKm ?? 0.68,
  smtpEmail: row?.SmtpEmail ?? row?.smtpEmail ?? '',
  smtpPassword: row?.SmtpPassword ?? row?.smtpPassword ?? '',
  smtpHost: row?.SmtpHost ?? row?.smtpHost ?? 'smtp.office365.com',
  smtpPort: row?.SmtpPort ?? row?.smtpPort ?? 587,
  logoData: row?.LogoData ?? row?.logoData ?? '',
});

export async function GET() {
  try {
    const pool = await getConnectionPool();
    const result = await pool.request().query('SELECT TOP 1 * FROM Settings');
    if (result.recordset.length === 0) {
      return Response.json(toSettingsResponse());
    }
    return Response.json(toSettingsResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error reading settings:', error);
    return Response.json(
      { error: 'Failed to read settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ratePerKm, smtpEmail, smtpPassword, logoData } = body;

    if (ratePerKm === undefined || ratePerKm < 0) {
      return Response.json(
        { error: 'Invalid rate per km' },
        { status: 400 }
      );
    }

    const pool = await getConnectionPool();
    // Upsert settings (assume only one row)
    const result = await pool.request()
      .input('RatePerKm', ratePerKm)
      .input('SmtpEmail', smtpEmail || '')
      .input('SmtpPassword', smtpPassword || '')
      .input('SmtpHost', 'smtp.office365.com')
      .input('SmtpPort', 587)
      .input('LogoData', logoData || '')
      .query(`IF EXISTS (SELECT 1 FROM Settings)
        UPDATE Settings SET RatePerKm=@RatePerKm, SmtpEmail=@SmtpEmail, SmtpPassword=@SmtpPassword, SmtpHost=@SmtpHost, SmtpPort=@SmtpPort, LogoData=@LogoData
        ELSE
        INSERT INTO Settings (RatePerKm, SmtpEmail, SmtpPassword, SmtpHost, SmtpPort, LogoData)
        VALUES (@RatePerKm, @SmtpEmail, @SmtpPassword, @SmtpHost, @SmtpPort, @LogoData);
        SELECT TOP 1 * FROM Settings;`);
    return Response.json(toSettingsResponse(result.recordset[0]));
  } catch (error) {
    console.error('Error saving settings:', error);
    return Response.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}
