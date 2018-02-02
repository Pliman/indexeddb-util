define([
	'angular', 'indexeddbshim'
], function (angular, indexedDBShim) {
	var module = angular.module('IndexeddbDao', []);

	module.factory("IndexeddbDao", [function () {
		return {
			// apis
			get: get,
			getByIndex: getByIndex,
			getByCursor: getByCursor,
			count: count,
			add: add,
			put: put,
			delete: doDelete,
			deleteByCursor: deleteByCursor,
			// 执行indexeddb DDL入口
			createObjectStores: createObjectStores,
			removeDb: removeDb
		};
	}]);

	var storageName = 'localDb',
		curVer = 2,
		db = null;

	var indexPageUrl = root + "/pos/index.html";

	function get(storeName, key, cb) {
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);

				var req = store.get(key);
				setReqProcessors(req, cb);
			} catch (e) {
				cb && cb(e);
			}
		});
	}

	function getByIndex(storeName, indexName, key, cb) {
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);
				var index = store.index(indexName);
				var req = index.get(key);
				setReqProcessors(req, cb);
			} catch (e) {
				cb && cb(e);
			}
		});
	}

	function getByCursor(storeName, cb, size, indexName, key, keyOnly, isPrefix, open, advanceCount) {
		size = size || 10;

		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);
				var opener = indexName ? store.index(indexName) : store;
				var req = opener.openCursor(key ? (keyOnly?IDBKeyRange.only(key):IDBKeyRange.lowerBound(key, open)) : null);

				var rtn = [];
				setReqProcessors(req, function (err, cursor) {
					if (err) {
						return cb && cb(err);
					}

					if (advanceCount) {
						cursor.advance(advanceCount);
						advanceCount = null;
						return;
					}

					if (isPrefix && cursor && (cursor.key.indexOf(key) == -1)) {
						return cb && cb(null, rtn);
					}

					if (cursor && (size === -1)) {
						rtn.push(cursor.value);
						cursor.continue();
					} else if (cursor && size) {
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

	function count(storeName, cb, indexName, key) {
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);
				var counter = indexName ? store.index(indexName) : store;

				var req = null;
				if (key) {
					req = counter.count(IDBKeyRange.lowerBound(key));
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
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
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
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
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
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);

				var req = store.delete(key);
				setReqProcessors(req, cb);
			} catch (e) {
				cb && cb(e);
			}
		});
	}

	function deleteByCursor(storeName, indexName, key, open, size, cb) {
		requireDB(function (err, db) {
			if (err) {
				return cb && cb(err);
			}

			try {
				var tx = db.transaction([storeName], IDBTransaction.READ_WRITE);
				var store = tx.objectStore(storeName);
				var opener = indexName ? store.index(indexName) : store;
				var req = opener.openCursor(key ? IDBKeyRange.lowerBound(key, open) : null);

				setReqProcessors(req, function (err, cursor) {
					if (err) {
						return cb && cb(err);
					}

					if (cursor && (cursor[indexName ? "key" : "primaryKey"]) != key) {
						cb && cb(null);
					} else if (cursor && (size === -1)) {
						setReqProcessors(cursor.delete(), function (err) {
							cursor.continue();
						});
					} else if (cursor && size) {
						size--;
						setReqProcessors(cursor.delete(), function (err) {
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

	function setReqProcessors(req, cb) {
		req.onsuccess = function (e) {
			cb && cb(null, e.target.result);
		};
		req.onerror = function (e) {
			cb && cb(e);
		};
	}

	function requireDB(cb) {
		if (!db) {
			openIndexDatabase(cb);
		} else {
			cb(null, db);
		}
	}

	// cb (err)
	function createObjectStores(config, cb) {
		requireDB(function (err, db, toCreate) {
			if (err) {
				return cb && cb(err);
			} else if (!toCreate) {
				return cb && cb(null);
			}

			angular.forEach(config, function (v) {
				if (!v.name) {
					console.error('error with indexeddb config: ');
					console.error(v);
					return;
				}

				try {
					var store = null;
					if (v.config) {
						store = db.createObjectStore(v.name, v.config);
					} else {
						store = db.createObjectStore(v.name);
					}

					if (v.index) {
						angular.forEach(v.index, function (vi) {
							if (vi.config) {
								store.createIndex(vi.name, vi.keyPath, vi.config);
							} else {
								store.createIndex(vi.name, vi.keyPath);
							}
						});
					}
				} catch (e) {
					return cb && cb(e);
				}
			});

			cb && cb(null);
		});
	}

	function getQuery(name, defaultValue) {
		if (!(window.query)) {
			var urlParams = {};
			(function () {
				var e,
					a = /\+/g,  // Regex for replacing addition symbol with a space
					r = new RegExp("([^" + String.fromCharCode(38) + "=]+)=?([^" + String.fromCharCode(38) + "]*)", "g"),
					d = function (s) {
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

	function removeDb() {
		// This will improve our code to be more readable and shorter
		var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB || indexedDBShim;
		var isSamsung = window.navigator.userAgent.indexOf('Android') >= 0;
		if (getQuery('websql') == 'true' || isSamsung) {
			indexedDB = indexedDBShim;
		}
		//fixChromeIndexedDB
		if (window.webkitIndexedDB) {
			IDBTransaction = {
				READ_WRITE: 'readwrite',
				READ_ONLY: 'readonly'
			};
			window.IDBKeyRange = window.webkitIDBKeyRange;
		}

		indexedDB.deleteDatabase(storageName);
	}

	//cb (err, db)
	function openIndexDatabase(cb) {
		// This will improve our code to be more readable and shorter
		var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB || indexedDBShim;
		var isSamsung = window.navigator.userAgent.indexOf('Android') >= 0;
		if (getQuery('websql') == 'true' || isSamsung) {
			indexedDB = indexedDBShim;
		}
		//fixChromeIndexedDB
		if (window.webkitIndexedDB) {
			IDBTransaction = {
				READ_WRITE: 'readwrite',
				READ_ONLY: 'readonly'
			};
			window.IDBKeyRange = window.webkitIDBKeyRange;
		}

		//  Now we can open our database
		var request = indexedDB.open(storageName, curVer);
		request.onsuccess = function () {
			db = request.result;

			if (db.version != curVer) {
				var req2 = db.setVersion(curVer);
				req2.onsuccess = function () {
					cb && cb(null, db);
				};
			} else if (!db.objectStoreNames.contains('inputIndex')) {
				// TODO Pliman 研究升级策略
				db.close();

				indexedDB.deleteDatabase(storageName);
				cb && cb('数据错误，即将跳到登陆页面，请重新登陆');

				setTimeout(function () {
					window.location = indexPageUrl;
				}, 5000);
			} else {
				cb && cb(null, db);
			}
		};
		request.onerror = function (e) {
			cb && cb(e);
		};

		request.onupgradeneeded = function (event) {
			cb && cb(null, event.target.result, true);
			// 回调执行过了，防止onsuccess重复执行cb
			cb = null;
		};
	}
});
