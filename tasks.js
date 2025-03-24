const { deleteFoldersRecursive, copyFiles, buildReact, npmInstall } = require('@iobroker/build-tools');
const { readdirSync, readFileSync, statSync, writeFileSync } = require('fs');
const srcAdmin = `${__dirname}/src-admin/`;

function clean() {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}
function adminCopy() {
    copyFiles(['src-admin/build/assets/*.js', '!src-admin/build/static/js/vendors*.js'], 'admin/custom/assets');
    copyFiles(['src-admin/build/assets/*.map', '!src-admin/build/static/js/vendors*.map'], 'admin/custom/assets');
    copyFiles(['src-admin/build/customComponents.js'], 'admin/custom');
    copyFiles(['src-admin/build/customComponents.js.map'], 'admin/custom');
    copyFiles(['src-admin/src/i18n/*.json'], 'admin/custom/i18n');
}
function mergeI18n() {
    const files = readdirSync(`${__dirname}/src-admin/src/i18n`);
    for (let f = 0; f < files.length; f++) {
        const data1 = JSON.parse(readFileSync(`${__dirname}/src-admin/src/i18n/${files[f]}`).toString('utf8'));
        const time1 = statSync(`${__dirname}/src-admin/src/i18n/${files[f]}`).mtimeMs;
        const data2 = JSON.parse(readFileSync(`${__dirname}/admin/i18n/${files[f]}`).toString('utf8'));
        const time2 = statSync(`${__dirname}/admin/i18n/${files[f]}`).mtimeMs;
        if (JSON.stringify(data1) !== JSON.stringify(data2)) {
            if (time1 > time2) {
                console.log(`Merging ${files[f]}, src-admin is newer`);
                writeFileSync(`${__dirname}/admin/i18n/${files[f]}`, JSON.stringify(data1, null, 4));
            } else {
                console.log(`Merging ${files[f]}, admin is newer`);
                writeFileSync(`${__dirname}/src-admin/src/i18n/${files[f]}`, JSON.stringify(data2, null, 4));
            }
        }
    }
}
if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(srcAdmin).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else if (process.argv.includes('--2-build')) {
    buildReact(srcAdmin, { rootDir: srcAdmin, vite: true }).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else if (process.argv.includes('--3-copy')) {
    adminCopy();
    mergeI18n();
} else {
    clean();
    npmInstall(srcAdmin)
        .then(() => buildReact(srcAdmin, { rootDir: srcAdmin, vite: true }))
        .then(() => adminCopy())
        .then(() => mergeI18n())
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
