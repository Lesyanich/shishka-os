import fs from 'fs';
import path from 'path';

const VAULT_ROOT = "/Users/lesianich/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/02_Obsidian_Vault/01_Menu";
const DATA_FILE = "/Users/lesianich/.gemini/antigravity/brain/c70acb7e-6bc9-4ba3-8459-6239f078b4a7/.system_generated/steps/1619/output.txt";

// Folder mapping
const folderMap = {
    'dish': 'Semi_Finished',
    'good': 'Ingredients',
    'modifier': 'Ingredients',
    'modifier_group': 'Ingredients'
};

// Sales items (finished dish) override
const salesPrefix = 'SALE-';

function getFolder(item) {
    if (item.product_code.startsWith(salesPrefix)) return 'Finished_Dishes';
    return folderMap[item.type] || 'Other';
}

async function run() {
    console.log(`Reading data from: ${DATA_FILE}`);
    const rawData = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(rawData);

    // Robust extraction: find JSON array between untrusted-data tags
    const match = parsed.result.match(/<untrusted-data-[^>]+>\n([\s\S]+?)\n<\/untrusted-data-/);
    if (!match) {
        throw new Error("Could not find JSON data between untrusted-data tags.");
    }

    const result = JSON.parse(match[1])[0].result;
    const { nomenclature, bom, flow } = result;

    console.log(`Starting sync for ${nomenclature.length} items...`);

    for (const item of nomenclature) {
        const folder = getFolder(item);
        const folderPath = path.join(VAULT_ROOT, folder);
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        const filePath = path.join(folderPath, `${item.product_code}.md`);

        // Find components (ingredients)
        const components = bom.filter(b => b.parent_code === item.product_code);

        // Find usage (parents)
        const usage = bom.filter(b => b.child_code === item.product_code);

        // Find equipment
        const equipment = flow ? flow.filter(f => f.product_code === item.product_code) : [];

        // Build Frontmatter
        let content = `---\n`;
        content += `syrve_uuid: ${item.syrve_id || 'null'}\n`;
        content += `product_code: ${item.product_code}\n`;
        content += `type: ${item.type}\n`;
        content += `base_unit: ${item.base_unit || 'null'}\n`;
        content += `contains_ingredients: ${JSON.stringify(components.map(c => `[[${c.child_code}]]`))}\n`;
        content += `part_of_recipes: ${JSON.stringify(usage.map(u => `[[${u.parent_code}]]`))}\n`;
        content += `equipment_needed: ${JSON.stringify([...new Set(equipment.map(e => `[[${e.equipment_code}]]`))])}\n`;
        content += `---\n\n`;

        content += `# ${item.product_code} (${item.name})\n`;
        content += `**Category:** ${folder.replace('_', ' ')}  \n`;
        content += `**Type:** \`${item.type}\`  \n\n`;

        content += `## ⚖️ Components\n`;
        if (components.length > 0) {
            content += `| Ingredient | Qty | Unit | Yield % |\n`;
            content += `|---|---|---|---|\n`;
            components.forEach(c => {
                content += `| [[${c.child_code}]] | ${c.quantity_per_unit} | - | ${c.yield_loss_pct || 100} |\n`;
            });
        } else {
            content += `*No ingredients (Base Raw Material)*\n`;
        }
        content += `\n`;

        content += `## 🔄 Used In\n`;
        if (usage.length > 0) {
            usage.forEach(u => {
                content += `- [[${u.parent_code}]]\n`;
            });
        } else {
            content += `*Not used as a component in any recipe.*\n`;
        }
        content += `\n`;

        content += `## 🛠️ Equipment\n`;
        if (equipment.length > 0) {
            const uniqueEquip = [...new Set(equipment.map(e => e.equipment_code))];
            uniqueEquip.forEach(e => {
                content += `- [[${e}]]\n`;
            });
        } else {
            content += `*No specific equipment linked.*\n`;
        }

        fs.writeFileSync(filePath, content);
        console.log(`Generated: ${item.product_code}`);
    }


    console.log("Sync Complete!");
}

run().catch(console.error);
