'use strict';

const copyFile = require('../tools').copyFile;
const tools = require('../tools');
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const backupDir = path.join(tools.getIobDir(), 'backups').replace(/\\/g, '/');

function list(restoreSource, options, types, log, callback) {
    if (options.enabled && (!restoreSource || restoreSource === 'cifs')) {
        if (options.mountType === 'CIFS' || options.mountType === 'NFS') {
            mount(options, log, error => {
                error && log.error(error);
                nasList(restoreSource, options, types, log, callback);
            });
        } else {
            nasList(restoreSource, options, types, log, callback);
        }
    } else {
        setImmediate(callback);
    }
}

function nasList(restoreSource, options, types, log, callback) {
    if (options.enabled && (!restoreSource || restoreSource === 'cifs')) {
        let dir = backupDir.replace(/\\/g, '/');

        if (options.mountType === 'Copy') {
            if (options.ownDir === true) {
                dir = options.dirMinimal.replace(/\\/g, '/');
            } else
                if (options.ownDir === false) {
                    dir = options.dir.replace(/\\/g, '/');
                }
            if (dir[0] !== '/' && !dir.match(/\w:/)) {
                dir = '/' + (dir || '');
            }
        } else {
            if (dir[0] !== '/' && !dir.match(/\w:/)) {
                dir = '/' + (dir || '');
            }
        }

        const files = {};
        if (fs.existsSync(dir)) {
            try {
                let result = fs.readdirSync(dir).sort().map(file => path.join(dir, file).replace(/\\/g, '/'));

                if (result && result.length) {
                    result = result.map(file => {
                        const stat = fs.statSync(file);
                        return { path: file, name: file.split('/').pop(), size: stat.size };
                    }).filter(file => types.indexOf(file.name.split('_')[0]) !== -1 || types.indexOf(file.name.split('.')[0]) !== -1);

                    result.forEach(file => {
                        const type = file.name.split('_')[0];
                        files[type] = files[type] || [];
                        files[type].push(file);
                    });
                }
            } catch (e) {
                log.warn('Source cannot be reached: ' + e);
            }
        }
        callback && callback(null, files, 'nas / copy');
    } else {
        setImmediate(callback);
    }
}

function copyFileCifs(options, fileName, toStoreName, log, callback) {
    try {
        log.debug('Get file ' + fileName);
        if (options.mountType === 'Copy') {
            copyFile(fileName, toStoreName, err => {
                err && log.error(err);
                callback(null);
            });
        }
        if (options.mountType === 'CIFS' || options.mountType === 'NFS') {
            callback(null);
        }

    } catch (e) {
        log.error(e);

        if (options.mountType === 'CIFS' || options.mountType === 'NFS') {
            umount(options, log, error => callback(error));
        } else {
            callback(e);
        }
    }
}

function getFile(options, fileName, toStoreName, log, callback) {
    if (options.enabled) {
        if (options.mountType === 'CIFS' || options.mountType === 'NFS') {
            callback(null);
        } else {
            copyFileCifs(options, fileName, toStoreName, log, callback);
        }
    } else {
        setImmediate(callback, 'Not configured');
    }
}

function mount(options, log, callback) {

    let dir = options.dir;

    if (options.ownDir === true) {
        dir = options.dirMinimal;
    }

    if (fs.existsSync(options.fileDir + '/.mount')) {
        child_process.exec(`mount | grep -o "${backupDir}"`, (error, stdout, stderr) => {
            if (stdout.indexOf(backupDir) != -1) {
                child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        log.debug('device is busy... wait 2 Minutes!!');
                        setTimeout(function () {
                            child_process.exec(`${options.sudo ? 'sudo umount' : 'umount'} ${backupDir}`, (error, stdout, stderr) => {
                                if (error) {
                                    log.error(stderr);
                                } else {
                                    fs.existsSync(options.fileDir + '/.mount') && fs.unlinkSync(options.fileDir + '/.mount');
                                }
                            });
                        }, 120000);
                    } else {
                        fs.existsSync(options.fileDir + '/.mount') && fs.unlinkSync(options.fileDir + '/.mount');
                    }
                });
            }
        });
    }

    if (options.mountType === 'CIFS') {
        if (!options.mount.startsWith('//')) {
            options.mount = '//' + options.mount;
        }

        if (!dir.startsWith('/')) {
            dir = '/' + dir;
        }
        if (!options.pass.startsWith("'")) {
            options.pass = "'" + options.pass + "'";
        }

        child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? 'username=' + options.user + ',password=' + options.pass : ''}${options.cifsDomain ? ',domain=' + options.cifsDomain : ''},rw,file_mode=0777,dir_mode=0777,${options.smb} ${options.mount}${dir} ${backupDir}`, (error, stdout, stderr) => {
            if (error) {
                let errLog = '' + error;
                errLog = errLog.replace(new RegExp(options.pass, 'g'), "****")
                log.error(`[${options.name} ${errLog}`);
                log.debug('try next mount attempt without smb option');
                child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} -t cifs -o ${options.user ? 'username=' + options.user + ',password=' + options.pass : ''}${options.cifsDomain ? ',domain=' + options.cifsDomain : ''},rw,file_mode=0777,dir_mode=0777 ${options.mount}${dir} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        let errLog = '' + error;
                        errLog = errLog.replace(new RegExp(options.pass, 'g'), "****")
                        callback(errLog);
                    } else {
                        fs.writeFileSync(options.fileDir + '/.mount', options.mountType);
                        callback(null, stdout);
                    }
                });
            } else {
                fs.writeFileSync(options.fileDir + '/.mount', options.mountType);
                callback(null, stdout);
            }
        });
    } else
        if (options.mountType === 'NFS') {
            if (!dir.startsWith('/')) {
                dir = '/' + dir;
            }

            child_process.exec(`${options.sudo ? 'sudo mount' : 'mount'} ${options.mount}:${dir} ${backupDir}`, (error, stdout, stderr) => {
                if (error) {
                    callback(error);
                } else {
                    fs.writeFileSync(options.fileDir + '/.mount', options.mountType);
                    callback(null, stdout);
                }
            });
        }
}

function umount(options, log, callback) {
    if (!options.mount) {
        return callback('NO mount path specified!');
    }
    let rootUmount = 'umount';
    if (options.sudo === 'true' || options.sudo === true) {
        rootUmount = 'sudo umount';
    }
    if (fs.existsSync(options.fileDir + '/.mount')) {
        child_process.exec(`mount | grep -o "${backupDir}"`, (error, stdout, stderr) => {
            if (stdout.indexOf(backupDir) != -1) {
                child_process.exec(`${rootUmount} ${backupDir}`, (error, stdout, stderr) => {
                    if (error) {
                        log.debug('device is busy... wait 2 Minutes!!');
                        setTimeout(function () {
                            child_process.exec(`${rootUmount} ${backupDir}`, (error, stdout, stderr) => {
                                if (error) {
                                    log.error(stderr);
                                    callback(error)
                                } else {
                                    fs.existsSync(options.fileDir + '/.mount') && fs.unlinkSync(options.fileDir + '/.mount');
                                    callback(null, stdout);
                                }
                            });
                        }, 120000);
                    } else {
                        fs.existsSync(options.fileDir + '/.mount') && fs.unlinkSync(options.fileDir + '/.mount');
                        callback(null, stdout);
                    }
                });
            }
        });
    }
}

module.exports = {
    list,
    getFile
};