import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), '../credentials.json');
const TOKEN_PATH = path.join(process.cwd(), '../token.json');

async function findFiles() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));

    const { client_secret, client_id, redirect_uris } = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    // Search for Menu&TC and Infrastructure_Map
    const res = await drive.files.list({
        pageSize: 10,
        fields: 'files(id, name, mimeType)',
        q: "name contains 'Menu&TC' or name contains 'Infrastructure_Map'",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });

    console.log(JSON.stringify(res.data.files, null, 2));
}

findFiles().catch(console.error);
