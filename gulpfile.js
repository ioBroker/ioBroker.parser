const gulp = require('gulp');
const fs = require('node:fs');
const cp = require('node:child_process');

function deleteFoldersRecursive(path, exceptions) {
    if (fs.existsSync(path)) {
        const files = fs.readdirSync(path);
        for (const file of files) {
            const curPath = `${path}/${file}`;
            if (exceptions && exceptions.find(e => curPath.endsWith(e))) {
                continue;
            }

            const stat = fs.statSync(curPath);
            if (stat.isDirectory()) {
                deleteFoldersRecursive(curPath);
                fs.rmdirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
    }
}

const srcAdmin = `${__dirname}/src-admin/`;

function npmInstallAdmin() {
    return new Promise((resolve, reject) => {
        // Install node modules
        const cwd = srcAdmin.replace(/\\/g, '/');

        const cmd = `npm install -f`;
        console.log(`"${cmd} in ${cwd}`);

        // System call used for update of js-controller itself,
        // because during an installation the npm packet will be deleted too, but some files must be loaded even during the install process.
        const exec = cp.exec;
        const child = exec(cmd, {cwd});

        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);

        child.on('exit', (code /* , signal */) => {
            // code 1 is a strange error that cannot be explained. Everything is installed but error :(
            if (code && code !== 1) {
                reject(`Cannot install: ${code}`);
            } else {
                console.log(`"${cmd} in ${cwd} finished.`);
                // command succeeded
                resolve();
            }
        });
    });
}

function buildAdmin() {
    const version = JSON.parse(fs.readFileSync(`${__dirname}/package.json`).toString('utf8')).version;
    const data    = JSON.parse(fs.readFileSync(`${srcAdmin}package.json`).toString('utf8'));

    data.version = version;

    fs.writeFileSync(`${srcAdmin}package.json`, JSON.stringify(data, null, 4));

    return new Promise((resolve, reject) => {
        const options = {
            stdio: 'pipe',
            cwd: srcAdmin,
        };

        console.log(options.cwd);

        let script = `${srcAdmin}node_modules/@craco/craco/dist/bin/craco.js`;
        if (!fs.existsSync(script)) {
            script = `${__dirname}/node_modules/@craco/craco/dist/bin/craco.js`;
        }
        if (!fs.existsSync(script)) {
            console.error(`Cannot find execution file: ${script}`);
            reject(`Cannot find execution file: ${script}`);
        } else {
            const child = cp.fork(script, ['build'], options);
            child.stdout.on('data', data => console.log(data.toString()));
            child.stderr.on('data', data => console.log(data.toString()));
            child.on('close', code => {
                console.log(`child process exited with code ${code}`);
                code ? reject(`Exit code: ${code}`) : resolve();
            });
        }
    });
}

gulp.task('admin-0-clean', done => {
    deleteFoldersRecursive(`${__dirname}/admin/custom`);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
    done();
});

gulp.task('admin-1-npm', async () => npmInstallAdmin());

gulp.task('admin-2-compile', async () => buildAdmin());

gulp.task('admin-3-copy', () => Promise.all([
    gulp.src(['src-admin/build/static/js/*.js', '!src-admin/build/static/js/vendors*.js']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/static/js/*.map', '!src-admin/build/static/js/vendors*.map']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/static/js/*jss-plugin-camel-case*.js']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/static/js/*mui_material_styles_styled*.js']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/static/js/*mui_material_Button_Button*.js']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/static/js/*mui_material_styles_getOverlayAlpha*.js']).pipe(gulp.dest('admin/custom/static/js')),
    gulp.src(['src-admin/build/customComponents.js']).pipe(gulp.dest('admin/custom')),
    gulp.src(['src-admin/build/customComponents.js.map']).pipe(gulp.dest('admin/custom')),
    gulp.src(['src-admin/src/i18n/*.json']).pipe(gulp.dest('admin/custom/i18n')),
]));

gulp.task('admin-4-merge-i18n', done => {
    const files = fs.readdirSync(`${__dirname}/src-admin/src/i18n`);
    for (let f = 0; f < files.length; f++) {
        const data1 = JSON.parse(fs.readFileSync(`${__dirname}/src-admin/src/i18n/${files[f]}`).toString('utf8'));
        const time1 = fs.statSync(`${__dirname}/src-admin/src/i18n/${files[f]}`).mtimeMs;
        const data2 = JSON.parse(fs.readFileSync(`${__dirname}/admin/i18n/${files[f]}`).toString('utf8'));
        const time2 = fs.statSync(`${__dirname}/admin/i18n/${files[f]}`).mtimeMs;
        if (JSON.stringify(data1) !== JSON.stringify(data2)) {
            if (time1 > time2) {
                console.log(`Merging ${files[f]}, src-admin is newer`);
                fs.writeFileSync(`${__dirname}/admin/i18n/${files[f]}`, JSON.stringify(data1, null, 4));
            } else {
                console.log(`Merging ${files[f]}, admin is newer`);
                fs.writeFileSync(`${__dirname}/src-admin/src/i18n/${files[f]}`, JSON.stringify(data2, null, 4));
            }
        }
    }
    done();
});


gulp.task('admin-build', gulp.series(['admin-0-clean', 'admin-1-npm', 'admin-2-compile', 'admin-3-copy', 'admin-4-merge-i18n']));

gulp.task('default', gulp.series(['admin-build']));
