import { google } from "googleapis";
import fs from "fs";

const credentials = JSON.parse(fs.readFileSync("../credentials.json", "utf-8"));
const token = JSON.parse(fs.readFileSync("../token.json", "utf-8"));

const auth = new google.auth.OAuth2(
    credentials.installed.client_id,
    credentials.installed.client_secret,
    credentials.installed.redirect_uris[0]
);
auth.setCredentials(token);

const drive = google.drive({ version: "v3", auth });

async function check() {
    const res = await drive.files.get({
        fileId: '1SkYq_V41-e1NXGGd_sQF4ALWve2xLWHrBrLJPvlOOaU',
        fields: 'id, name, mimeType',
        supportsAllDrives: true
    });
    console.log(JSON.stringify(res.data, null, 2));

    const listRes = await drive.files.list({
        q: "name contains 'PUMPKIN'",
        pageSize: 10,
        fields: 'files(id, name, mimeType)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
    });
    console.log("List with Shared Drives:");
    console.log(JSON.stringify(listRes.data.files, null, 2));
}

check().catch(console.error);
