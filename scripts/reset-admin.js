#!/usr/bin/env node

import readline from 'readline';
import https from 'https';

const SUPABASE_URL = 'https://zcixnnzxxkylotbjudhk.supabase.co';
const FUNCTION_ENDPOINT = '/functions/v1/reset-admin-password';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function makeRequest(method, url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      method,
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: { error: body } });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function resetAdminPassword() {
  console.log('\n===================================');
  console.log('   Reset Admin Password Tool');
  console.log('===================================\n');

  const password = await question('Ingresa la nueva contraseña del admin: ');

  if (password.length < 6) {
    console.log('\n❌ Error: La contraseña debe tener al menos 6 caracteres\n');
    rl.close();
    return;
  }

  console.log('\n⏳ Reseteando contraseña del admin...\n');

  try {
    const url = `${SUPABASE_URL}${FUNCTION_ENDPOINT}`;
    const response = await makeRequest('POST', url, { newPassword: password });

    if (response.data.success) {
      console.log('✅ Éxito!');
      console.log(`📧 Email del admin: ${response.data.adminEmail}`);
      console.log(`🔐 La nueva contraseña ha sido guardada\n`);
    } else {
      console.log(`❌ Error: ${response.data.error}\n`);
    }
  } catch (error) {
    console.log(`❌ Error de conexión: ${error.message}\n`);
  }

  rl.close();
}

resetAdminPassword();
