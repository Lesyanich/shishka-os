import fs from 'fs';
import path from 'path';

// Load paths
const VAULT_ROOT = "/Users/lesianich/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/02_Obsidian_Vault/01_Menu";

// Supabase config (hardcoded for this specific run as per project ID qcqgtcsjoacuktcewpvo)
const SUPABASE_URL = "https://qcqgtcsjoacuktcewpvo.supabase.co";
// Note: I don't have the ANON key in env, but I can use the MCP execute_sql results 
// OR I can use the credentials if I had them. 
// Since I am an agent with MCP, I will actually write a script that takes JSON data 
// that I fetched via execute_sql to avoid needing the Supabase key inside the script.

async function syncMesh(nomData, bomData, flowData) {
    const nomenclature = nomData;
    const bomEntries = bomData;
    const flowEntries = flowData;

    for (const item of nomenclature) {
        const { id, product_code, name, type, syrve_id } = item;

        // Find folder
        let folder = "Ingredients";
        if (type === "dish") folder = "Semi_Finished";
        // Check if it's a finished dish (sales)
        if (product_code.startsWith("SALE-")) folder = "Finished_Dishes";

        const filePath = path.join(VAULT_ROOT, folder, `${product_code}.md`);

        // Downlinks (Components)
        const components = bomEntries.filter(b => b.parent_code === product_code);
        // Uplinks (Used In)
        const usedIn = bomEntries.filter(b => b.child_code === product_code);
        // Equipment
        const equipment = flowEntries.filter(f => f.product_code === product_code).map(f => f.equipment_code).filter(e => e);

        // Properties
        const yaml = `---
syrve_uuid: ${syrve_id || ""}
product_code: ${product_code}
type: ${type}
status: Live
contains_ingredients: [${components.map(c => `"[[${c.child_code}]]"`).join(", ")}]
part_of_recipes: [${usedIn.map(u => `"[[${u.parent_code}]]"`).join(", ")}]
equipment_needed: [${[...new Set(equipment)].map(e => `"[[${e}]]"`).join(", ")}]
---`;

        // Content
        let existingContent = "";
        if (fs.existsSync(filePath)) {
            existingContent = fs.readFileSync(filePath, 'utf8');
        }

        // Preserve Description (everything between # Header and ## Components or EOF)
        let description = `## 📋 Description\nLive data from Supabase.`;
        const descMatch = existingContent.match(/## 📋 Description([\s\S]*?)(## |$)/);
        if (descMatch) {
            description = `## 📋 Description${descMatch[1]}`;
        }

        let content = `${yaml}\n# ${product_code} (${name})\n**Category:** ${folder.replace("_", " ")}  \n**Status:** ✅ LIVE\n\n${description.trim()}\n\n`;

        if (components.length > 0) {
            content += `## ⚖️ Components\n| Ingredient | Qty | Unit | Yield % |\n|---|---|---|---|\n`;
            components.forEach(c => {
                content += `| [[${c.child_code}]] | ${c.quantity_per_unit} | - | ${c.yield_loss_pct || 100} |\n`;
            });
            content += `\n`;
        }

        if (usedIn.length > 0) {
            content += `## 🔄 Used In\n`;
            usedIn.forEach(u => {
                content += `- [[${u.parent_code}]]\n`;
            });
            content += `\n`;
        }

        // Preserve Notes
        const notesMatch = existingContent.match(/## 💡 Notes([\s\S]*?)(## |$)/);
        if (notesMatch) {
            content += `## 💡 Notes${notesMatch[1]}`;
        }

        fs.writeFileSync(filePath, content);
        console.log(`Synced Mesh: ${product_code}`);
    }
}

// Data injection via fs (temporary file)
const data = JSON.parse(fs.readFileSync('mesh_data.json', 'utf8'));
syncMesh(data.nomenclature, data.bom, data.flow).catch(console.error);
