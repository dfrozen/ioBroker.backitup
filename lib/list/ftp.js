'use strict';
const Client = require('ftp');
const fs = require('fs');

function list(restoreSource, options, types, log, callback) {
    if (options.host && (!restoreSource || restoreSource === 'ftp')) {
        const client = new Client();

        let dir = (options.dir || '').replace(/\\/g, '/');

        if (options.ownDir === true) {
            dir = (options.dirMinimal || '').replace(/\\/g, '/');
        }

        if (!dir || dir[0] !== '/') {
            dir = '/' + (dir || '');
        }

        client.on('ready', () => {
            log.debug('FTP connected.');
            client.list(dir, (err, result) => {
                if (err) {
                    log.error(err);
                }
                client.end();
                if (result && result.length) {
                    try {
                    result = result.map(file => {
                        return {path: file.name, name: file.name.replace(/\\/g, '/').split('/').pop(), size: file.size}
                    }).filter(file => types.indexOf(file.name.split('_')[0]) !== -1 || types.indexOf(file.name.split('.')[0]) !== -1);
                } catch (e) {
                    log.error('error on ftp list: ' + e + ' please check the ftp config!!');
                }

                    const files = {};
                    result.forEach(file => {
                        const type = file.name.split('_')[0];
                        files[type] = files[type] || [];
                        files[type].push(file);
                    });

                    callback(null, files, 'ftp');
                } else {
                    callback && callback()
                }
            });
        });
        client.on('error', err => {
            if (callback) {
                callback(err);
                callback = null;
            }
        });

        const srcFTP = {
            host     : options.host,
            port     : options.port || 21,
            user     : options.user,
            password : options.pass
        };

        client.connect(srcFTP);
    } else {
        setImmediate(callback);
    }
}

function getFile(options, fileName, toStoreName, log, callback) {
    if (options.host) {
        // copy file to options.backupDir
        const client = new Client();
        let dir = (options.dir || '').replace(/\\/g, '/');

        if (options.ownDir === true) {
            dir = (options.dirMinimal || '').replace(/\\/g, '/');
        }

        if (!dir || dir[0] !== '/') {
            dir = '/' + (dir || '');
        }
        client.on('ready', () => {
            log.debug('FTP connected.');
            log.debug('Get file: ' + dir + '/' + fileName);
            client.get(dir + '/' + fileName, (err, stream) => {
                if (err) {
                    try {
                        client.end();
                    } catch (e) {

                    }
                    log.error(err);
                    if (callback) {
                        callback(err);
                        callback = null;
                    }
                } else {
                    try {
                        stream.once('close', () => {
                            log.debug('Download done');
                            client.end();
                            if (callback) {
                                callback();
                                callback = null;
                            }
                        });
                        stream.pipe(fs.createWriteStream(toStoreName));
                    } catch (err) {
                        log.error(err);
                        if (callback) {
                            callback(err);
                            callback = null;
                        }
                    }
                }
            });
        });

        client.on('error', err => {
            if (callback) {
                callback(err);
                callback = null;
            }
        });

        const srcFTP = {
            host     : options.host,
            port     : options.port || 21,
            user     : options.user,
            password : options.pass
        };

        client.connect(srcFTP);
    } else {
        setImmediate(callback, 'Not configured');
    }
}

module.exports = {
    list,
    getFile
};