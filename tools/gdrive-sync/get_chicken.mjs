import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), '../credentials.json');
const TOKEN_PATH = path.join(process.cwd(), '../token.json');

async function getChicken() {
    const auth = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const { client_secret, client_id, redirect_uris } = auth.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    // Find doc by exact name
    const findRes = await drive.files.list({
        q: "name = 'Sous-vide Chicken' and mimeType = 'application/vnd.google-apps.document'",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });

    if (findRes.data.files.length > 0) {
        const fileId = findRes.data.files[0].id;
        const docRes = await google.docs({ version: 'v1', auth: oAuth2Client }).documents.get({ documentId: fileId });

        const content = docRes.data.body.content.map(el => {
            if (el.paragraph) return el.paragraph.elements.map(e => e.textRun?.content || "").join("");
            if (el.table) return "[Table Included]";
            return "";
        }).join("\n");

        console.log(content);
    }
}

getChicken().catch(console.error);
