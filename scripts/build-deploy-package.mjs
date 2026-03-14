import { access, cp, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const dryRun = process.argv.includes('--dry-run');
const includeBigData = process.argv.includes('--with-big-data');
const lightMode = process.argv.includes('--light');
const runtimeEntries = lightMode
    ? [{ name: 'app' }, { name: 'import' }, { name: 'logo' }]
    : [
        { name: 'app' },
        { name: 'Scene', excludeDirs: includeBigData ? [] : ['Data'] },
        { name: 'import' },
        { name: 'logo' },
        ...(includeBigData ? [{ name: 'pointcloud' }] : []),
    ];

const requiredRuntimePaths = lightMode
    ? [
        { path: 'app/index.html', reason: 'Ana giriş sayfası' },
        { path: 'app/main.js', reason: 'Ana uygulama çalışma dosyası' },
    ]
    : [
        { path: 'app/index.html', reason: 'Ana giriş sayfası' },
        { path: 'app/main.js', reason: 'Ana uygulama çalışma dosyası' },
        { path: 'Scene/merinos1.json', reason: '3D model kök tileset dosyası' },
        { path: 'app/vendor/proj4/proj4.js', reason: 'GeoJSON/DXF dönüşüm bağımlılığı' },
        { path: 'app/vendor/supabase/supabase.js', reason: 'Monitoring/admin bağımlılığı' },
    ];

async function pathExists(targetPath) {
    try {
        await access(targetPath, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

function normalizeAsPosix(inputPath) {
    return inputPath.split(path.sep).join('/');
}

function shouldIncludeRelativePath(relativePath, excludeDirs) {
    if (!excludeDirs || excludeDirs.length === 0) return true;
    var rel = normalizeAsPosix(relativePath);
    return !excludeDirs.some(function (dir) {
        return rel === dir || rel.startsWith(dir + '/');
    });
}

async function copyRuntimeEntry(entry) {
    const entryName = entry.name;
    const excludeDirs = entry.excludeDirs || [];
    const sourcePath = path.join(rootDir, entryName);
    const targetPath = path.join(distDir, entryName);

    if (!(await pathExists(sourcePath))) {
        console.warn('[build:deploy] Skip missing path:', entryName);
        return;
    }

    if (excludeDirs.length > 0) {
        console.log('[build:deploy] Exclude:', excludeDirs.map(function (d) { return entryName + '/' + d; }).join(', '));
    }

    if (dryRun) {
        console.log('[build:deploy] Dry-run ok:', entryName);
        return;
    }

    await cp(sourcePath, targetPath, {
        recursive: true,
        force: true,
        errorOnExist: false,
        filter: function (sourceItemPath) {
            var rel = path.relative(sourcePath, sourceItemPath);
            if (!rel) return true;
            return shouldIncludeRelativePath(rel, excludeDirs);
        },
    });

    console.log('[build:deploy] Copied:', entryName);
}

async function assertRequiredRuntimePaths(baseDir, scopeLabel) {
    const missing = [];
    for (const req of requiredRuntimePaths) {
        const abs = path.join(baseDir, req.path);
        if (!(await pathExists(abs))) {
            missing.push(req);
        }
    }

    if (missing.length === 0) return;

    const message = missing
        .map(function (m) {
            return '- ' + m.path + ' (' + m.reason + ')';
        })
        .join('\n');

    throw new Error(
        '[build:deploy] Kritik runtime dosyalari eksik (' + scopeLabel + '):\n' + message +
        '\nBelediye canli akisi icin paketleme durduruldu.'
    );
}

async function main() {
    if (!(await pathExists(distDir))) {
        throw new Error('dist klasörü bulunamadı. Önce vite build çalıştırılmalı.');
    }

    var mode = lightMode
        ? 'light'
        : (includeBigData ? 'full-with-big-data' : 'full-no-big-data');
    console.log('[build:deploy] Mode:', dryRun ? ('dry-run/' + mode) : mode);

    // Dry-run modunda, kopyalama öncesi kaynakların kritik parçaları doğrulanır.
    await assertRequiredRuntimePaths(rootDir, 'kaynak klasör');

    await mkdir(distDir, { recursive: true });

    for (const entry of runtimeEntries) {
        await copyRuntimeEntry(entry);
    }

    if (dryRun) {
        console.log('[build:deploy] Dry-run tamamlandı.');
        return;
    }

    // Gerçek paket üretiminde dist içeriğinin kritik parçaları doğrulanır.
    await assertRequiredRuntimePaths(distDir, 'dist paketi');

    console.log('[build:deploy] Deploy paketi dist/ altında hazır.');
}

main().catch((error) => {
    console.error('[build:deploy] Hata:', error.message);
    process.exit(1);
});
