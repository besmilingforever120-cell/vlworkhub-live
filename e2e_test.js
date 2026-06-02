const http = require('http');
const fs = require('fs');
const { Client } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

function post(url, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const body = JSON.stringify(data);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: responseBody }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function run() {
  const result = {};
  try {
    const payload = {
      title: "Create endpoint verification 2026-05-14",
      body: "Announcement create smoke test",
      audience: "All Staff",
      publish_date: "2026-05-14",
      start_date: "2026-05-14",
      end_date: "2026-05-21",
      priority: "Normal",
      status: "Draft",
      event_link_url: null,
      event_image_url: null,
      attachment_name: null,
      attachment_url: null
    };

    // 1. Manually check if user exists or use a better login method.
    // However, I must follow the instructions. Maybe credentials are wrong or I need to register?
    // Let's try to query the users table first to see what admins are there.
    
    const connectionConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'vlworkhub'
    };
    
    const client = new Client(connectionConfig);
    await client.connect();
    
    // Check if user exists
    const userRes = await client.query('SELECT * FROM users WHERE email = $1', ['admin@vlworkhub.ca']);
    result.user_found = userRes.rows.length > 0;

    const loginRes = await post('http://127.0.0.1:8080/auth/login', {
      email: 'admin@vlworkhub.ca',
      password: 'Password123!'
    });
    
    result.login_status = loginRes.status;
    
    const setCookie = loginRes.headers['set-cookie'];
    const sessionCookie = setCookie ? setCookie.find(c => c.startsWith('vlwh_session')) : null;
    
    if (sessionCookie) {
        const createRes = await post('http://127.0.0.1:8080/resources/announcements', payload, {
          Cookie: sessionCookie.split(';')[0]
        });
        result.create_status = createRes.status;
        result.create_body = createRes.data;
    }

    const dbRes = await client.query('SELECT * FROM hr.announcements WHERE title = $1', [payload.title]);
    result.db_row = dbRes.rows[0] || null;
    await client.end();

    result.success = result.create_status === 201 || result.create_status === 200;
  } catch (error) {
    result.success = false;
    result.error = error.message;
  }

  fs.writeFileSync('/home/ismail/vlworkhub/announcement_e2e_result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ success: result.success, file_exists: fs.existsSync('/home/ismail/vlworkhub/announcement_e2e_result.json') }));
}

run();
