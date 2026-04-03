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

const docs = google.docs({ version: "v1", auth });

async function getDoc(id, name) {
    console.log(`--- Content for ${name} (${id}) ---`);
    const res = await docs.documents.get({ documentId: id });
    const text = res.data.body.content
        .map(el => {
            if (el.paragraph) {
                return el.paragraph.elements.map(e => e.textRun?.content || "").join("");
            }
            if (el.table) {
                return el.table.tableRows.map(row =>
                    row.tableCells.map(cell =>
                        cell.content.map(c =>
                            c.paragraph?.elements.map(e => e.textRun?.content || "").join("") || ""
                        ).join("")
                    ).join(" | ")
                ).join("\n");
            }
            return "";
        })
        .join("\n");
    console.log(text);
}

async function run() {
    await getDoc('1s_zO-nihZdTMoqH8H7LIVDZeSac2IANDo3oz6JLIrHA', 'Pumpkin Coconut Soup');
}

run().catch(console.error);
