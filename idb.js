(function IDB(global) {
    var storageName = 'test',
        curVer = 1,
        verLimit = 100000000;
    db = null;
    var READ_WRITE = 'readwrite';
    var READ_ONLY = 'readonly';

    var isShimMode = false;

    var objectStores = [
        // 1
        [
            {
                name: '_log',
                config: {
                    keyPath: 'time'
                }
            }
        ]
    ];

    global.IDB = {
        // apis
        get: get,
        getByIndex: getByIndex,
        getByCursor: getByCursor,
        cursorExecutor: cursorExecutor,
        count: count,
        add: add,
        put: put,
        delete: doDelete,
        deleteByCursor: deleteByCursor,
        clear: clear,
        initObjectStores: initObjectStores,
        removeDb: removeDb,
        currentVersion: curVer,
        close: close
    };

    function close(cb) {
        requireDB(function(err, db1) {
            if (err) {
                return cb && cb(err);
            }
            var req = db1.close();
            db = null;
            cb && cb();
        });
    }

    function get(storeName, key, cb) {
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);

                var req = store.get(key);
                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function getByIndex(storeName, indexName, key, cb) {
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }
            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                var index = store.index(indexName);
                var req = index.get(key);
                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    // 新加comPrefix用来处理复合键前缀，以lower的第一个值为前缀
    function getByCursor(storeName, cb, size, indexName, lower, keyOnly, isPrefix, lowerOpen, upper, upperOpen, advanceCount, desc) {
        size = size || 10;

        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            if (((lower && _.isArray(lower)) || (upper && _.isArray(upper))) && isShimMode) {
                if (indexName) {
                    var index0 = indexName.split("_")[0];
                    var index1 = indexName.split("_")[1];
                    var index0Lower = null,
                        index1Lower = null,
                        index0Upper = null,
                        index1Upper = null;

                    if (lower && _.isArray(lower)) {
                        index0Lower = lower[0];
                        index1Lower = lower[1];
                    }

                    if (upper && _.isArray(upper)) {
                        index0Upper = upper[0];
                        index1Upper = upper[1];
                    }

                    getByCursor(storeName, function(err, index0Data) {
                        if (err) {
                            cb && cb(err);
                        }

                        getByCursor(storeName, function(err, index1Data) {
                            if (err) {
                                cb && cb(err);
                            }

                            var rtn = [];

                            _.forEach(index1Data, function(data) {
                                _.some(index0Data, { id: data.id }) && rtn.push(data);
                            });

                            if (advanceCount) {
                                rtn.splice(0, advanceCount);
                            }

                            cb && cb(null, rtn);
                        }, -1, index1, index1Lower, keyOnly, isPrefix, lowerOpen, index1Upper, upperOpen, false, desc);
                    }, -1, index0, index0Lower, keyOnly, isPrefix, lowerOpen, index0Upper, upperOpen, false, desc);
                }

                return;
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                var opener = indexName ? store.index(indexName) : store;
                //var req = opener.openCursor(lower ? (keyOnly?IDBKeyRange.only(lower):IDBKeyRange.lowerBound(lower, lowerOpen)) : null);
                var range = null;
                if (lower && upper) {
                    range = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
                } else if (lower && !upper) {
                    range = keyOnly ? IDBKeyRange.only(lower) : IDBKeyRange.lowerBound(lower, lowerOpen);
                } else if (!lower && upper) {
                    range = IDBKeyRange.upperBound(upper, upperOpen);
                }

                var req = opener.openCursor(range, (desc ? 'prev' : 'next'));

                var rtn = [];
                setReqProcessors(req, function(err, cursor) {
                    if (err) {
                        return cb && cb(err);
                    }

                    if (advanceCount && cursor) {
                        cursor.advance(advanceCount);
                        advanceCount = null;
                        return;
                    }

                    if (isPrefix && cursor && (cursor.key.indexOf(lower) == -1)) {
                        return cb && cb(null, rtn);
                    }

                    if (cursor && cursor.value && (size === -1)) {
                        rtn.push(cursor.value);
                        cursor.continue();
                    } else if (cursor && cursor.value && size) {
                        rtn.push(cursor.value);
                        size--;
                        cursor.continue();
                    } else {
                        cb && cb(null, rtn);
                    }
                });
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    // 只能支持同步方法，作用有限
    function cursorExecutor(storeName, executor, cb, size, indexName, lower, keyOnly, isPrefix, lowerOpen, upper, upperOpen, advanceCount, desc) {
        size = size || 10;

        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                var opener = indexName ? store.index(indexName) : store;
                //var req = opener.openCursor(lower ? (keyOnly?IDBKeyRange.only(lower):IDBKeyRange.lowerBound(lower, lowerOpen)) : null);
                var range = null;
                if (lower && upper) {
                    range = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
                } else if (lower && !upper) {
                    range = keyOnly ? IDBKeyRange.only(lower) : IDBKeyRange.lowerBound(lower, lowerOpen);
                } else if (!lower && upper) {
                    range = IDBKeyRange.upperBound(uppper, upperOpen);
                }

                var req = opener.openCursor(range, (desc ? 'prev' : 'next'));

                setReqProcessors(req, function(err, cursor) {
                    if (err) {
                        return cb && cb(err);
                    }

                    if (advanceCount) {
                        cursor.advance(advanceCount);
                        advanceCount = null;
                        return;
                    }

                    if (isPrefix && cursor && (cursor.key.indexOf(lower) == -1)) {
                        return cb && cb(null);
                    }

                    if (cursor && cursor.value && (size === -1)) {
                        executor(cursor.value, function() {
                            cursor.continue();
                        });
                    } else if (cursor && cursor.value && size) {
                        executor(cursor.value, function() {
                            size--;
                            cursor.continue();
                        });
                    } else {
                        cb && cb(null);
                    }
                });
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function count(storeName, cb, indexName, key) {
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                var counter = indexName ? store.index(indexName) : store;

                var req = null;
                if (key) {
                    if (key.lower && key.upper) {
                        req = counter.count(IDBKeyRange.bound(key.lower, key.upper));
                    } else {
                        req = counter.count(IDBKeyRange.lowerBound(key));
                    }
                } else {
                    req = counter.count();
                }

                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function add(storeName, obj, key, cb) {
        // 如果属性存在，不报错，不覆盖已有值，直接返回
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);

                var req = null;
                if (key) {
                    req = store.add(obj, key);
                } else {
                    req = store.add(obj);
                }

                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function put(storeName, obj, key, cb) {
        // 如果属性不存在，不报错，当做add
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);

                var req = null;
                if (key) {
                    req = store.put(obj, key);
                } else {
                    req = store.put(obj);
                }

                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function doDelete(storeName, key, cb) {
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);

                var req = store.delete(key);
                setReqProcessors(req, cb);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function deleteByCursor(storeName, cb, size, indexName, key, keyOnly, isLowerBound, isPrefix, open) {
        size = size || 10;

        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                var opener = indexName ? store.index(indexName) : store;
                var req = opener.openCursor(key ? (keyOnly ? IDBKeyRange.only(key) : IDBKeyRange[isLowerBound ? 'lowerBound' : 'upperBound'](key, open)) : null);

                setReqProcessors(req, function(err, cursor) {
                    if (err) {
                        return cb && cb(err);
                    }

                    if (isPrefix && cursor && (cursor.key.indexOf(key) == -1)) {
                        return cb && cb(null);
                    }

                    if (cursor && (size === -1)) {
                        setReqProcessors(cursor.delete(), function(err) {
                            cursor.continue();
                        });
                    } else if (cursor && size) {
                        size--;
                        setReqProcessors(cursor.delete(), function(err) {
                            cursor.continue();
                        });
                    } else {
                        cb && cb(null);
                    }
                });
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function clear(storeName, cb) {
        requireDB(function(err, db) {
            if (err) {
                return cb && cb(err);
            }

            try {
                var tx = db.transaction([storeName], READ_WRITE);
                var store = tx.objectStore(storeName);
                store.clear();
                cb && cb(null);
            } catch (e) {
                cb && cb(e);
            }
        });
    }

    function setReqProcessors(req, cb) {
        req.onsuccess = function(e) {
            cb && cb(null, e.target.result);
        };
        req.onerror = function(e) {
            cb && cb(e);
        };
    }

    function requireDB(cb, createCb) {
        if (!db) {
            openIndexDatabase(cb, createCb);
        } else {
            cb && cb(null, db);
        }
    }

    // cb (err)
    function createObjectStores(db, tx, configs, cb) {
        var createError = null;

        _.forEach(configs, function(config) {
            if (config && config.length) {
                var oneStoreName = '';

                _.forEach(config, function(v) {
                    // 添加
                    try {
                        if (!v.name) {
                            console.error('error with indexeddb config: ');
                            console.error(v);
                            return;
                        }

                        var store = null;
                        oneStoreName = v.name;

                        if (db.objectStoreNames.contains(oneStoreName)) {
                            store = tx.objectStore(oneStoreName);
                        } else if (v.config) {
                            store = db.createObjectStore(v.name, v.config);
                        } else {
                            store = db.createObjectStore(v.name);
                        }

                        if (v.index) {
                            _.forEach(v.index, function(vi) {
                                if (vi.config) {
                                    store.createIndex(vi.name, vi.keyPath, vi.config);
                                } else {
                                    store.createIndex(vi.name, vi.keyPath);
                                }
                            });
                        }
                    } catch (e) {
                        createError = e;
                    }
                });

                createError ? (cb && cb(createError)) : validateCreate(db, oneStoreName, cb);
            }
        });
    }

    function validateCreate(db, oneStoreName, cb) {
        cb && cb(oneStoreName ? (db.objectStoreNames.contains(oneStoreName) ? null : '创建本地数据库出错') : null);
    }

    function initObjectStores(cb) {
        requireDB(null, cb);
    }

    function getQuery(name, defaultValue) {
        if (!(window.query)) {
            var urlParams = {};
            (function() {
                var e,
                    a = /\+/g,  // Regex for replacing addition symbol with a space
                    r = new RegExp("([^" + String.fromCharCode(38) + "=]+)=?([^" + String.fromCharCode(38) + "]*)", "g"),
                    d = function(s) {
                        return decodeURIComponent(s.replace(a, " "));
                    },
                    q = window.location.search.substring(1);

                while (e = r.exec(q))
                    urlParams[d(e[1])] = d(e[2]);
            })();
            window.query = urlParams;
        }
        var value = window.query[name];

        if (!value) {
            value = sessionStorage['query_' + name];
            if (!value) value = defaultValue;
        } else {
            sessionStorage['query_' + name] = value;
        }
        return value;
    }

    function getIndexedDB() {
        var actualIndexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB || window.shimIndexedDB;

        if (actualIndexedDB == window.shimIndexedDB) {
            isShimMode = true;
        }

        if (getQuery('websql') == 'true') {
            indexedDB = window.shimIndexedDB;
            isShimMode = true;
        }

        //fixChromeIndexedDB
        if (window.webkitIndexedDB) {
            window.IDBKeyRange = window.webkitIDBKeyRange;
        }

        return actualIndexedDB;
    }

    function removeDb() {
        getIndexedDB().deleteDatabase(storageName);
    }

    //cb (err, db)
    function openIndexDatabase(cb, createCb) {
        var indexedDB = getIndexedDB();
        var request = indexedDB.open(storageName, curVer);
        request.onsuccess = function() {
            db = request.result;

            if (db.version != curVer) {
                var req2 = db.setVersion(curVer);
                req2.onsuccess = function() {
                    cb && cb(null, db);
                    createCb && createCb(null);
                };
            } else {
                cb && cb(null, db);
                createCb && createCb(null);
            }
        };
        request.onerror = function(e) {
            cb && cb(e);
            createCb && createCb(e);
        };

        request.onupgradeneeded = function(event) {
            var oldVersion = event.oldVersion;

            if (oldVersion > verLimit) {
                oldVersion = 0;
            }

            // 创建新的数据库
            createCb && createObjectStores(event.target.result, event.target.transaction, objectStores.slice(oldVersion), createCb);

            // 回调执行过了，防止onsuccess重复执行cb
            createCb = null;
        };
    }
})(window || global);
