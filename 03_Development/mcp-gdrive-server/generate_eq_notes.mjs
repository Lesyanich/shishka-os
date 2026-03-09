import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

// Note: In a real scenario I'd use the Supabase tool result directly, 
// but since I have the list from previous step 1015, I'll use it to generate files.

const equipmentData = [
    { "id": "0cccb69b-3bcb-4f2e-90d6-664c2ce7495d", "equipment_code": "L-1-K-EL-CON-OVEN-83-20", "name": "Convection Oven Unit 20" },
    { "id": "481f5b47-3a9e-4762-adbb-9d5734524f81", "equipment_code": "L-2-S-INDCT-BRN-2-65", "name": "Induction Burner Unit 65" },
    { "id": "8e54e0b0-15a2-4f3e-81b4-f74ada9e3c16", "equipment_code": "FERM-01", "name": "Fermentation Station (5L Press)" },
    { "id": "5519013d-1a2f-46fe-8003-0751ad8f1753", "equipment_code": "L-1-K-GAS-RNG-570-32", "name": "Gas Range (4-Burner)" },
    { "id": "1b007995-1061-412c-9935-7273508a2fb9", "equipment_code": "L-1-K-BL-FRZ-790-66", "name": "Blast Chiller / Shock Freezer" },
    { "id": "d1892f12-a9fd-44ad-8532-5e73d8125d61", "equipment_code": "L-1-K-VAC-500-67", "name": "Chamber Vacuum Sealer" },
    { "id": "8b4391d1-0ba7-4736-ae9e-d0b743d7b2ec", "equipment_code": "L-1-K-KITCH-BLND-CHINA-13", "name": "Blender" }
];

const vaultPath = "/Users/lesianich/Library/CloudStorage/GoogleDrive-lesia@shishka.health/Общие диски/Shishka healthy kitchen/02_Obsidian_Vault/03_Infrastructure/Equipment";

equipmentData.forEach(eq => {
    const filename = `${eq.equipment_code}.md`;
    const content = `---
id: ${eq.id}
code: ${eq.equipment_code}
status: Operational
---
# ⚙️ ${eq.name}
**Code:** ${eq.equipment_code}  
**ID:** ${eq.id}

## 📋 Description
Standard equipment for healthy kitchen production.

## 🔗 Links
- [[Blueprints/Infrastructure_Map|🗺️ Infrastructure Map]]
`;
    fs.writeFileSync(path.join(vaultPath, filename), content);
    console.log(`Generated: ${filename}`);
});
