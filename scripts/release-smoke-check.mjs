import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const requireAdminToken = process.argv.includes('--require-admin-token');
const strictWarnings = process.argv.includes('--strict');

const requiredRuntimePaths = [
    'app/index.html',
    'app/main.js',
    'app/admin-panel.html',
    'app/monitoring-service.js',
    'app/vendor/proj4/proj4.js',
    'app/vendor/supabase/supabase.js',
    'Scene/merinos1.json',
];

const requiredConfigKeys = [
    'appMode',
    'cesiumIonToken',
    'supabaseUrl',
    'supabaseAnonKey',
    'adminPasswordSha256',
    'adminCommandToken',
    'preserveDrawingBufferMode',
];

const report = [];

function pushResult(level, title, detail) {
    report.push({ level, title, detail: detail || '' });
}

function printReport() {
    console.log('[release:smoke] Sonuc raporu');
    console.log('[release:smoke] Bayraklar:',
        'strict=' + (strictWarnings ? 'on' : 'off') + ',',
        'require-admin-token=' + (requireAdminToken ? 'on' : 'off'));
    console.log('');

    report.forEach(function (item) {
        const symbol = item.level === 'PASS' ? 'OK' : (item.level === 'WARN' ? 'WARN' : 'FAIL');
        console.log('[' + symbol + '] ' + item.title + (item.detail ? ' -> ' + item.detail : ''));
    });

    const failCount = report.filter(function (r) { return r.level === 'FAIL'; }).length;
    const warnCount = report.filter(function (r) { return r.level === 'WARN'; }).length;

    console.log('');
    console.log('[release:smoke] Ozet:',
        'PASS=' + report.filter(function (r) { return r.level === 'PASS'; }).length,
        'WARN=' + warnCount,
        'FAIL=' + failCount);

    if (failCount > 0) {
        throw new Error('Smoke gate basarisiz: kritik kontrollerde hata var.');
    }
    if (strictWarnings && warnCount > 0) {
        throw new Error('Smoke gate strict modda basarisiz: warning bulundu.');
    }
}

async function pathExists(relativePath) {
    try {
        await access(path.join(rootDir, relativePath), constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function readUtf8(relativePath) {
    return readFile(path.join(rootDir, relativePath), 'utf8');
}

function extractConfigBody(sourceText) {
    const match = sourceText.match(/window\.CBS_CONFIG\s*=\s*{([\s\S]*?)}\s*;?/);
    return match ? match[1] : null;
}

function extractObjectKeys(objectBody) {
    const keys = new Set();
    const keyRegex = /^\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*:/gm;
    let match;
    while ((match = keyRegex.exec(objectBody)) !== null) {
        keys.add(match[1]);
    }
    return keys;
}

function extractSingleQuotedValue(sourceText, keyName) {
    const escaped = keyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped + '\\s*:\\s*[\"\\\']([^\"\\\']*)[\"\\\']');
    const match = sourceText.match(regex);
    return match ? match[1].trim() : null;
}

function extractAppVersionFromIndex(indexHtml) {
    const match = indexHtml.match(/var\s+VER\s*=\s*['\"]([^'\"]+)['\"]/);
    return match ? match[1].trim() : null;
}

function extractStaticVQueryValues(indexHtml) {
    const versions = [];
    const vRegex = /(?:src|href)=['\"][^'\"]+\?v=([^'\"]+)['\"]/g;
    let match;
    while ((match = vRegex.exec(indexHtml)) !== null) {
        versions.push(match[1].trim());
    }
    return versions;
}

function normalizeSemver(rawVersion) {
    if (!rawVersion) return null;
    const match = String(rawVersion).match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
}

async function checkRequiredPaths() {
    const missing = [];
    for (const rel of requiredRuntimePaths) {
        if (!(await pathExists(rel))) {
            missing.push(rel);
        }
    }

    if (missing.length > 0) {
        pushResult('FAIL', 'Runtime dosya varligi', 'Eksik: ' + missing.join(', '));
    } else {
        pushResult('PASS', 'Runtime dosya varligi', 'Kritik dosyalar mevcut');
    }
}

async function checkVersionConsistency() {
    const packageJson = JSON.parse(await readUtf8('package.json'));
    const indexHtml = await readUtf8('app/index.html');

    const packageVersion = (packageJson && packageJson.version) ? String(packageJson.version).trim() : null;
    const appVersion = extractAppVersionFromIndex(indexHtml);

    if (!appVersion) {
        pushResult('FAIL', 'Index cache versiyonu', 'var VER bulunamadi');
    } else {
        pushResult('PASS', 'Index cache versiyonu', 'VER=' + appVersion);
    }

    if (packageVersion && appVersion && packageVersion !== appVersion) {
        pushResult('WARN', 'package.json vs app/index.html versiyonu', 'package=' + packageVersion + ', app=' + appVersion);
    } else if (packageVersion && appVersion) {
        pushResult('PASS', 'package.json vs app/index.html versiyonu', 'Senkron');
    }

    const staticVValues = extractStaticVQueryValues(indexHtml);
    if (staticVValues.length === 0) {
        pushResult('WARN', 'Statik ?v= kontrolu', 'Statik v parametresi bulunamadi');
    } else if (appVersion && staticVValues.some(function (v) { return v !== appVersion; })) {
        pushResult('WARN', 'Statik ?v= kontrolu', 'Tum statik query versiyonlari VER ile ayni degil');
    } else {
        pushResult('PASS', 'Statik ?v= kontrolu', 'Tum statik query versiyonlari senkron');
    }

    const rawXlsxVersion = packageJson.dependencies && packageJson.dependencies.xlsx;
    const xlsxDepVersion = normalizeSemver(rawXlsxVersion);
    const fallbackMatch = indexHtml.match(/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/([^/]+)\/xlsx\.full\.min\.js/);
    const fallbackVersion = fallbackMatch ? fallbackMatch[1].trim() : null;

    if (!fallbackVersion || !xlsxDepVersion) {
        pushResult('WARN', 'SheetJS fallback versiyonu', 'Karsilastirma icin surum cikarilamadi');
    } else if (fallbackVersion !== xlsxDepVersion) {
        pushResult('WARN', 'SheetJS fallback versiyonu', 'dep=' + xlsxDepVersion + ', fallback=' + fallbackVersion);
    } else {
        pushResult('PASS', 'SheetJS fallback versiyonu', 'dep ve fallback ayni');
    }
}

async function checkConfigConsistency() {
    const configExampleText = await readUtf8('app/config.example.js');
    const configText = await readUtf8('app/config.js');

    const configExampleBody = extractConfigBody(configExampleText);
    const configBody = extractConfigBody(configText);

    if (!configExampleBody) {
        pushResult('FAIL', 'config.example formati', 'window.CBS_CONFIG objesi bulunamadi');
        return;
    }
    if (!configBody) {
        pushResult('FAIL', 'config.js formati', 'window.CBS_CONFIG objesi bulunamadi');
        return;
    }

    const exampleKeys = extractObjectKeys(configExampleBody);
    const configKeys = extractObjectKeys(configBody);

    const missingFromConfig = [];
    for (const key of exampleKeys) {
        if (!configKeys.has(key)) {
            missingFromConfig.push(key);
        }
    }

    const missingRequired = requiredConfigKeys.filter(function (key) {
        return !configKeys.has(key);
    });

    if (missingFromConfig.length > 0 || missingRequired.length > 0) {
        const parts = [];
        if (missingFromConfig.length > 0) {
            parts.push('example->config eksik: ' + missingFromConfig.join(', '));
        }
        if (missingRequired.length > 0) {
            parts.push('zorunlu anahtar eksik: ' + missingRequired.join(', '));
        }
        pushResult('FAIL', 'Config anahtar senkronu', parts.join(' | '));
    } else {
        pushResult('PASS', 'Config anahtar senkronu', 'config.js ile config.example.js uyumlu');
    }

    const appMode = extractSingleQuotedValue(configText, 'appMode');
    if (appMode && appMode !== 'municipality') {
        pushResult('WARN', 'appMode kontrolu', 'Beklenen municipality, mevcut=' + appMode);
    } else if (appMode === 'municipality') {
        pushResult('PASS', 'appMode kontrolu', 'municipality');
    }

    const supabaseUrl = extractSingleQuotedValue(configText, 'supabaseUrl') || '';
    const supabaseAnonKey = extractSingleQuotedValue(configText, 'supabaseAnonKey') || '';
    if (!supabaseUrl || !supabaseAnonKey) {
        pushResult('WARN', 'Supabase config dolulugu', 'supabaseUrl/supabaseAnonKey alanlarindan biri bos');
    } else {
        pushResult('PASS', 'Supabase config dolulugu', 'Doluluk kontrolu gecti');
    }

    const adminPasswordSha = extractSingleQuotedValue(configText, 'adminPasswordSha256') || '';
    if (!adminPasswordSha) {
        pushResult('WARN', 'Admin panel parola hash dolulugu', 'adminPasswordSha256 bos');
    } else {
        pushResult('PASS', 'Admin panel parola hash dolulugu', 'Doluluk kontrolu gecti');
    }

    const adminCommandToken = extractSingleQuotedValue(configText, 'adminCommandToken') || '';
    if (!adminCommandToken) {
        if (requireAdminToken) {
            pushResult('FAIL', 'Admin command token', 'Bos token strict modda kabul edilmiyor');
        } else {
            pushResult('WARN', 'Admin command token', 'Bos. Uretimde doldurulmasi onerilir');
        }
    } else if (adminCommandToken.length < 24) {
        pushResult('WARN', 'Admin command token', 'Token cok kisa (onerilen >=24 karakter)');
    } else {
        pushResult('PASS', 'Admin command token', 'Doluluk ve uzunluk kontrolu gecti');
    }
}

async function checkCommandSecurityWiring() {
    const adminPanel = await readUtf8('app/admin-panel.html');
    const monitoring = await readUtf8('app/monitoring-service.js');

    const adminHasTokenPayload =
        adminPanel.includes('ADMIN_COMMAND_TOKEN') &&
        adminPanel.includes('buildCommandPayload') &&
        adminPanel.includes('commandToken');

    if (!adminHasTokenPayload) {
        pushResult('FAIL', 'Admin panel komut payload guvenligi', 'commandToken enjekte eden akis tespit edilemedi');
    } else {
        pushResult('PASS', 'Admin panel komut payload guvenligi', 'Token enjekte eden akis bulundu');
    }

    const monitoringHasValidation =
        monitoring.includes('isAuthorizedCommand') &&
        monitoring.includes('ADMIN_COMMAND_TOKEN') &&
        monitoring.includes('commandToken');

    if (!monitoringHasValidation) {
        pushResult('FAIL', 'Monitoring komut dogrulamasi', 'Token tabanli dogrulama akisi eksik');
    } else {
        pushResult('PASS', 'Monitoring komut dogrulamasi', 'Token tabanli dogrulama akisi bulundu');
    }
}

async function main() {
    await checkRequiredPaths();
    await checkVersionConsistency();
    await checkConfigConsistency();
    await checkCommandSecurityWiring();
    printReport();
}

main().catch(function (error) {
    console.error('[release:smoke] Hata:', error && error.message ? error.message : error);
    process.exit(1);
});
