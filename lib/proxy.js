/* jshint -W097 */// jshint strict:false
/*jslint node: true */
/*jshint -W061 */
'use strict';

/**
 * Proxy class
 *
 * From settings used only secure, auth and crossDomain
 *
 * @class
 * @param {object} server http or https node.js object
 * @param {object} webSettings settings of the web server, like <pre><code>{secure: settings.secure, port: settings.port}</code></pre>
 * @param {object} adapter web adapter object
 * @param {object} instanceSettings instance object with common and native
 * @param {object} app express application
 * @return {object} object instance
 */
function Proxy(server, webSettings, adapter, instanceSettings, app) {
    if (!(this instanceof Proxy)) return new Proxy(server, webSettings, adapter, instanceSettings, app);

    this.app       = app;
    this.adapter   = adapter;
    this.settings  = webSettings;
    this.config    = instanceSettings ? instanceSettings.native : {};
    this.namespace = instanceSettings ? instanceSettings._id.substring('system.adapter.'.length) : 'simple-api';
    var that       = this;
    var proxy;
    var path;
    var fs;

    this.config.route = this.config.route || (that.namespace + '/');
    function oneRule(rule) {
        adapter.log.info('Install extension on /' + that.config.route + rule.regex);

        if (rule.url.match(/^https?:\/\//)) {
            proxy       = proxy || require('http-proxy-middleware');
            var options = {
                target:         rule.url,
                ws:             true,
                secure:         false,
                changeOrigin:   false,
                xfwd:           true,
                onError: function (err) {
                    adapter.log.error('Cannot get "' + rule.url + '": ' + err);
                },
                onProxyReq: function (req, origReq, res, options) {
                    adapter.log.debug(req.method + ': ' + rule.url + req.path);
                },
                onProxyRes: function (req, reqOrig, res) {
                    adapter.log.debug('Response for ' + reqOrig.url + ': ' + req.statusCode + '(' + req.statusMessage + ')');
                },
                /*onProxyReqWs: function () {
                 console.log('onProxyReqWs');
                 },

                 onOpen: function () {
                 console.log('onOpen');
                 },
                 onClose: function () {
                 console.log('onClose');
                 },*/
                pathRewrite: {}
            };
            var m = rule.url.match(/^https?:\/\/(.+)@/);
            if (m && m[1] && m[1].indexOf(':') !== -1) {
                rule.url = rule.url.replace(m[1] + '@', '');
                options.auth = m[1];
            }

            options.pathRewrite['^/' + that.config.route + rule.regex] = '/';

            rule.handler = proxy(options);
            that.app.use('/' + that.config.route + rule.regex, function (req, res, next) {
                rule.handler(req, res, next);
            });
        } else {
            path = path || require('path');
            fs   = fs   || require('fs');
            rule.url = rule.url.replace(/\\/g, '/');
            if (rule.url[0] !== '/' && !rule.url.match(/^[A-Za-z]:/)) {
                rule.url = path.normalize(__dirname + '/../../' + rule.url);
            }
            // file handler
            that.app.use('/' + that.config.route + rule.regex, function (req, res, next) {
                var fileName = rule.url + req.url;
                if (fs.existsSync(fileName)) {
                    var stat = fs.statSync(fileName);
                    if (stat.isDirectory()) {
                        var dirs = fs.readdirSync(fileName);

                        var text = '';
                        dirs.sort();
                        for (var d = 0; d < dirs.length; d++) {
                            text += (text ? '<br>' : '') + '<a href="./' + dirs[d] + '">' + dirs[d] + '</a>';
                        }
                        res.set('Content-Type', 'text/html');
                        res.status(200).send('<html><head><title>' + fileName + '</title></head><body>' + text + '</body>');
                    } else {
                        var data;
                        try {
                            data = fs.readFileSync(fileName);
                        } catch (e) {
                            res.status(500).send('Cannot read file: ' + e);
                            return;
                        }
                        res.contentType(getMimeType(path.extname(fileName)));
                        res.status(200).send(data);
                    }
                } else {
                    res.status(404).send('File "' + fileName +'" not found.');
                }
            });
        }
    }

    function getMimeType(ext) {
        if (ext instanceof Array) ext = ext[0];
        var _mimeType = 'text/javascript';
        var isBinary  = false;

        if (ext === '.css') {
            _mimeType = 'text/css';
        } else if (ext === '.bmp') {
            _mimeType = 'image/bmp';
            isBinary = true;
        } else if (ext === '.png') {
            isBinary = true;
            _mimeType = 'image/png';
        } else if (ext === '.jpg') {
            isBinary = true;
            _mimeType = 'image/jpeg';
        } else if (ext === '.jpeg') {
            isBinary = true;
            _mimeType = 'image/jpeg';
        } else if (ext === '.gif') {
            isBinary = true;
            _mimeType = 'image/gif';
        } else if (ext === '.tif') {
            isBinary = true;
            _mimeType = 'image/tiff';
        } else if (ext === '.js') {
            _mimeType = 'application/javascript';
        } else if (ext === '.html') {
            _mimeType = 'text/html';
        } else if (ext === '.htm') {
            _mimeType = 'text/html';
        } else if (ext === '.json') {
            _mimeType = 'application/json';
        } else if (ext === '.xml') {
            _mimeType = 'text/xml';
        } else if (ext === '.svg') {
            _mimeType = 'image/svg+xml';
        } else if (ext === '.eot') {
            isBinary = true;
            _mimeType = 'application/vnd.ms-fontobject';
        } else if (ext === '.ttf') {
            isBinary = true;
            _mimeType = 'application/font-sfnt';
        } else if (ext === '.cur') {
            isBinary = true;
            _mimeType = 'application/x-win-bitmap';
        } else if (ext === '.woff') {
            isBinary = true;
            _mimeType = 'application/font-woff';
        } else if (ext === '.wav') {
            isBinary = true;
            _mimeType = 'audio/wav';
        } else if (ext === '.mp3') {
            isBinary = true;
            _mimeType = 'audio/mpeg3';
        } else if (ext === '.avi') {
            isBinary = true;
            _mimeType = 'video/avi';
        } else if (ext === '.mp4') {
            isBinary = true;
            _mimeType = 'video/mp4';
        } else if (ext === '.mkv') {
            isBinary = true;
            _mimeType = 'video/mkv';
        } else if (ext === '.zip') {
            isBinary = true;
            _mimeType = 'application/zip';
        } else if (ext === '.ogg') {
            isBinary = true;
            _mimeType = 'audio/ogg';
        } else if (ext === '.manifest') {
            _mimeType = 'text/cache-manifest';
        } else {
            _mimeType = 'text/javascript';
        }

        return _mimeType;
    }

    var __construct = (function () {
        for (var e = 0; e < this.config.rules.length; e++) {
            oneRule(this.config.rules[e]);
        }
    }.bind(this))();
}

module.exports = Proxy;