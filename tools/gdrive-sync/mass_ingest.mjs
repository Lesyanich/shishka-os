import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), '../credentials.json');
const TOKEN_PATH = path.join(process.cwd(), '../token.json');
const VAULT_ROOT = "/Users/lesianich/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/02_Obsidian_Vault/01_Menu";

async function massIngest() {
    const auth = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    const { client_secret, client_id, redirect_uris } = auth.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const spreadsheetId = '1-bNwX3XkDiYADdJ1AuoqQM4YhvKSMxnJ_QkMuPGU2u8';

    // 1. Get Nomenclature
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Nomenclature!A2:E100' });
    const rows = res.data.values || [];

    for (const row of rows) {
        const [shortCode, syrveId, name, type, orderItemType] = row;
        if (!shortCode) continue;

        let folder = "Ingredients";
        if (orderItemType === "Dish") folder = "Finished_Dishes";
        else if (type === "dish") folder = "Semi_Finished";

        const filePath = path.join(VAULT_ROOT, folder, `${shortCode}.md`);

        // Skip if already exists (avoids overwriting manual work like Pumpkin)
        if (fs.existsSync(filePath)) {
            console.log(`Skipping existing: ${shortCode}`);
            continue;
        }

        let content = `---
syrve_id: ${syrveId}
product_code: ${shortCode}
type: ${type}
status: Live
---
# ${shortCode} (${name})
**Category:** ${orderItemType}  
**Status:** ✅ LIVE

## 📋 Description
Imported from SYRVE Nomenclature.
`;

        // 2. Try to find a GDoc with matching name
        try {
            const driveRes = await drive.files.list({
                q: `name = '${name}' and mimeType = 'application/vnd.google-apps.document'`,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
                fields: 'files(id, name)'
            });

            if (driveRes.data.files.length > 0) {
                content += `\n[Google Doc Found - Ready for Manual Detail Enrichment]\n`;
                console.log(`Found GDoc for: ${name}`);
            }
        } catch (e) { }

        fs.writeFileSync(filePath, content);
        console.log(`Ingested: ${shortCode}`);
    }
}

massIngest().catch(console.error);
