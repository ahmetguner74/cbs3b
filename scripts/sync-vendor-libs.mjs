import { mkdir, cp, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const vendorRoot = path.join(rootDir, 'app', 'vendor');

const entries = [
    { from: 'node_modules/@emailjs/browser/dist/email.min.js', to: 'emailjs/email.min.js' },
    { from: 'node_modules/proj4/dist/proj4.js', to: 'proj4/proj4.js' },
    { from: 'node_modules/jszip/dist/jszip.min.js', to: 'jszip/jszip.min.js' },
    { from: 'node_modules/xlsx/dist/xlsx.full.min.js', to: 'xlsx/xlsx.full.min.js' },
    { from: 'node_modules/jspdf/dist/jspdf.umd.min.js', to: 'jspdf/jspdf.umd.min.js' },
    { from: 'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js', to: 'jspdf-autotable/jspdf.plugin.autotable.min.js' },
    { from: 'node_modules/@supabase/supabase-js/dist/umd/supabase.js', to: 'supabase/supabase.js' },
    { from: 'node_modules/leaflet/dist/leaflet.css', to: 'leaflet/leaflet.css' },
    { from: 'node_modules/leaflet/dist/leaflet.js', to: 'leaflet/leaflet.js' },
    { from: 'node_modules/leaflet/dist/images/marker-icon.png', to: 'leaflet/images/marker-icon.png' },
    { from: 'node_modules/leaflet/dist/images/marker-icon-2x.png', to: 'leaflet/images/marker-icon-2x.png' },
    { from: 'node_modules/leaflet/dist/images/marker-shadow.png', to: 'leaflet/images/marker-shadow.png' }
];

async function pathExists(filePath) {
    try {
        await access(filePath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function copyEntry(entry) {
    const sourcePath = path.join(rootDir, entry.from);
    const targetPath = path.join(vendorRoot, entry.to);

    if (!(await pathExists(sourcePath))) {
        throw new Error('Kaynak bulunamadi: ' + entry.from);
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { force: true });
    console.log('[vendor:sync] Copied:', entry.to);
}

async function main() {
    await mkdir(vendorRoot, { recursive: true });
    for (const entry of entries) {
        await copyEntry(entry);
    }
    console.log('[vendor:sync] Tamamlandi. Toplam dosya:', entries.length);
}

main().catch((err) => {
    console.error('[vendor:sync] Hata:', err.message);
    process.exit(1);
});
