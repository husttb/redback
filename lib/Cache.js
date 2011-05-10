/*!
 * Redback
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Cache backend using Redis' string commands.
 *
 * Reference:
 *    http://redis.io/commands#string
 */

var Cache = exports.Cache = function (client, namespace) {
    this.client = client;
    this.namespace = namespace;
}

/**
 * Add the namespace on to cache keys.
 *
 * @param {string} key
 * @return namespaced_key;
 * @api private
 */

Cache.prototype.getKey = function (key) {
    return this.namespace + ':' + key;
}

/**
 * Cache one or more values.
 *
 * To cache a single value by key:
 *     cache.set('foo', 'bar', callback);
 *
 * To set multiple cached values by key:
 *     cache.set({foo:'bar', key2:'value2'}, callback);
 *
 * @param {string} key
 * @param {string} value
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.set = function (key, value, callback) {
    if (typeof value === 'function') {
        callback = value;
        var i, set = [];
        for (i in key) {
            set.push(this.getKey(i));
            set.push(key[i]);
        }
        set.push(callback);
        this.client.mset.apply(this.client, set);
    } else {
        this.client.set(this.getKey(key), value, callback);
    }
    return this;
}

/**
 * Add one or more values to the cache, but only if the cache
 * key(s) do not already exist.
 *
 * @param {string|Object} key
 * @param {string} value (optional)
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.add = function (key, value, callback) {
    if (typeof value === 'function') {
        callback = value;
        var i, set = [];
        for (i in key) {
            set.push(this.getKey(i));
            set.push(key[i]);
        }
        set.push(callback);
        this.client.msetnx.apply(this.client, set);
    } else {
        this.client.setnx(this.getKey(key), value, callback);
    }
    return this;
}

/**
 * Get one or more values from the cache.
 *
 * To get a single cached value by key:
 *     cache.get('foo', callback);
 *
 * To get multiple cached values by key:
 *     cache.get(['foo','bar'], callback);
 *
 * To get all cached values:
 *     cache.get(callback);
 *
 * @param {string} key
 * @param {string} value
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.get = function (key, callback) {
    var namespace_len = this.namespace.length + 1,
        self = this;

    var multi_get = function (keys) {
        var get_args = [];
        keys.forEach(function (key) {
            get_args.push(key);
        })
        get_args.push(function (err, values) {
            if (err) return callback(err, null);
            var i, l, ret = {};
            for (i = 0, l = keys.length; i < l; i++) {
                ret[keys[i].substr(namespace_len)] = values[i];
            }
            callback(null, ret);
        });
        self.client.mget.apply(self.client, get_args);
    }

    if (typeof key === 'function') {
        callback = key;
        this.keys('*', true, function (err, keys) {
            if (err) callback(err, null);
            multi_get(keys);
        });
    } else if (Array.isArray(key)) {
        if (!key.length) callback(null, null);
        for (var get = [], i = 0, l = key.length; i < l; i++) {
            key[i] = this.getKey(key[i]);
        }
        multi_get(key);
    } else {
        this.client.get(this.getKey(key), callback);
    }
    return this;
}

/**
 * Set a cache key and return the current value.
 *
 * @param {string} key
 * @param {string} value
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.getSet = function (key, value, callback) {
    this.client.getset(this.getKey(key), value, callback);
    return this;
}

/**
 * Check whether a cache key exists.
 *
 * @param {string} key
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.exists = function (key, callback) {
    this.client.exists(this.getKey(key), callback);
    return this;
}

/**
 * Increment the specified cache value.
 *
 * @param {string} key
 * @param {int} amount (optional - default is 1)
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.increment = Cache.prototype.incrBy = function (key, amount, callback) {
    if (typeof amount === 'function') {
        callback = amount;
        amount = 1;
    }
    this.client.incrby(this.getKey(key), amount, callback);
    return this;
}

/**
 * Decrement the specified cache value.
 *
 * @param {string} key
 * @param {int} amount (optional - default is 1)
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.decrement = Cache.prototype.decrBy = function (key, amount, callback) {
    if (typeof amount === 'function') {
        callback = amount;
        amount = 1;
    }
    this.client.decrby(this.getKey(key), amount, callback);
    return this;
}

/**
 * Get all cache keys matching the pattern.
 *
 * @param {string} pattern (optional - default is *)
 * @param {bool} keep_namespace (optional - default is false)
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.keys = function (pattern, keep_namespace, callback) {
    if (typeof pattern === 'function') {
        keep_namespace = false;
        callback = pattern;
        pattern = '*';
    } else if (typeof keep_namespace === 'function') {
        callback = keep_namespace;
        keep_namespace = false;
    }
    var self = this;
    if (keep_namespace) {
        this.client.keys(this.namespace + ':' + pattern, function (err, keys) {
            if (err) return callback(err, null);
            if (!keys) return callback(null, []);
            callback(null, keys);
        });
    } else {
        var namespace_len = this.namespace.length + 1;
        this.client.keys(this.namespace + ':' + pattern, function (err, keys) {
            if (err) return callback(err, null);
            if (!keys) return callback(null, []);
            if (null == keys) return callback(null, []);
            for (var i = 0, l = keys.length; i < l; i++) {
                keys[i] = keys[i].substr(namespace_len);
            }
            callback(null, keys);
        });
    }
}

/**
 * Flush all cache keys matching the pattern.
 *
 * @param {string} pattern (optional - default is *)
 * @param {Function} callback
 * @return this;
 * @api public
 */

Cache.prototype.flush = function (pattern, callback) {
    if (typeof pattern === 'function') {
        callback = pattern;
        pattern = '*';
    }
    var self = this;
    this.keys(pattern, true, function (err, keys) {
        if (err) return callback(err, null);
        if (!keys) return callback(err, []);
        var error = false, remaining = keys.length, del_count = 0;
        keys.forEach(function (key) {
            self.client.del(key, function (err, deleted) {
                if (error) {
                    return;
                } else if (err) {
                    error = true;
                    return callback(err, null);
                }
                del_count++;
                if (!--remaining) callback(err, del_count);
            });
        });
    });
}


/**
 * Expire the cache key after a certain number of seconds.
 *
 * @param {int} ttl
 * @param {Function} callback
 * @return this
 * @api public
 */

Cache.prototype.expire = function (key, ttl, callback) {
    this.client.expire(this.getKey(key), ttl, callback);
    return this;
}

/**
 * Expire the cache key at a certain date.
 *
 * @param {string} key
 * @param {Date} when
 * @param {Function} callback
 * @return this
 * @api public
 */

Cache.prototype.expireAt = function (key, when, callback) {
    if (typeof when.getTime === 'function') {
        when = Math.round(when.getTime() / 1000); //ms => s
    }
    this.client.expireat(this.getKey(key), when, callback);
    return this;
}

/**
 * Get the number of seconds before the cache key expires.
 *
 * @param {string} key
 * @param {Function} callback
 * @return this
 * @api public
 */

Cache.prototype.ttl = function (key, callback) {
    this.client.ttl(this.getKey(key), callback);
    return this;
}

/**
 * Remove the cache keys associated expiry TTL.
 *
 * @param {string} key
 * @param {Function} callback
 * @return this
 * @api public
 */

Cache.prototype.persist = function (key, callback) {
    this.client.persist(this.getKey(key), callback);
    return this;
}