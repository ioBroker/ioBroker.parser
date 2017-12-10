
var gulp      = require('gulp');
var fs        = require('fs');
var srcDir    = __dirname + '/';
var pkg       = grunt.file.readJSON('package.json');
var iopackage = grunt.file.readJSON('io-package.json');
var version   = (pkg && pkg.version) ? pkg.version : iopackage.common.version;
/*var appName   = getAppName();

function getAppName() {
    var parts = __dirname.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1].split('.')[0].toLowerCase();
}
*/

gulp.task('updateReadme', function (done) {
    var readme = fs.readFileSync('README.md').toString();
    var pos = readme.indexOf('## Changelog\n');
    if (pos !== -1) {
        var readmeStart = readme.substring(0, pos + '## Changelog\n'.length);
        var readmeEnd   = readme.substring(pos + '## Changelog\n'.length);

        if (readme.indexOf(version) === -1) {
            var timestamp = new Date();
            var date = timestamp.getFullYear() + '-' +
                ('0' + (timestamp.getMonth() + 1).toString(10)).slice(-2) + '-' +
                ('0' + (timestamp.getDate()).toString(10)).slice(-2);

            var news = '';
            if (iopackage.common.news) {
                for (var i = 0; i < iopackage.common.news.length; i++) {
                    if (typeof iopackage.common.news[i] === 'string') {
                        news += '* ' + iopackage.common.news[i] + '\n';
                    } else {
                        news += '* ' + iopackage.common.news[i].en + '\n';
                    }
                }
            }

            fs.writeFileSync('README.md', readmeStart + '### ' + version + ' (' + date + ')\n' + (news ? news + '\n\n' : '\n') + readmeEnd);
        }
    }
    done();
});

gulp.task('default', ['updateReadme']);