import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), '../credentials.json');
const TOKEN_PATH = path.join(process.cwd(), '../token.json');

async function readSheet() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const spreadsheetId = '1-bNwX3XkDiYADdJ1AuoqQM4YhvKSMxnJ_QkMuPGU2u8';

    // Get spreadsheet info to see sheet names
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets.map(s => s.properties.title);
    console.log("Sheet Names:", sheetNames);

    // Read the first few rows of the first sheet (usually Nomenclature)
    const range = `${sheetNames[0]}!A1:E20`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    console.log("Rows:", JSON.stringify(res.data.values, null, 2));
}

readSheet().catch(console.error);
