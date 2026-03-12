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

async function main() {
    if (!(await pathExists(distDir))) {
        throw new Error('dist klasörü bulunamadı. Önce vite build çalıştırılmalı.');
    }

    var mode = lightMode
        ? 'light'
        : (includeBigData ? 'full-with-big-data' : 'full-no-big-data');
    console.log('[build:deploy] Mode:', dryRun ? ('dry-run/' + mode) : mode);

    await mkdir(distDir, { recursive: true });

    for (const entry of runtimeEntries) {
        await copyRuntimeEntry(entry);
    }

    if (dryRun) {
        console.log('[build:deploy] Dry-run tamamlandı.');
        return;
    }

    console.log('[build:deploy] Deploy paketi dist/ altında hazır.');
}

main().catch((error) => {
    console.error('[build:deploy] Hata:', error.message);
    process.exit(1);
});
