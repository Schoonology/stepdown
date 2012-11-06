var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    trycatch = require('trycatch');

var NO_RESULT = {},
    DEFAULT_OPTIONS = {
        timeout: 10000
    };

function createResultSet(callback) {
    return ResultSetMixin.call([], callback);
}

function ResultSetMixin(callback) {
    var self = this;

    self.expectedLength = 0;
    self.error = null;
    self.queued = false;
    self.spreads = [];
    self.finished = false;

    self.callback = function (err, set) {
        self.finished = true;
        if (callback) {
            callback(err, set);
        }
    };

    self.alloc = ResultSetMixin.alloc;
    self.check = ResultSetMixin.check;
    self.finalize = ResultSetMixin.finalize;

    return self;
}

ResultSetMixin.alloc = alloc;
function alloc(type) {
    var self = this,
        index = self.push(NO_RESULT) - 1;

    self.expectedLength++;

    return function collect(err /*, ... rest */) {
        if (self.finished) {
            return;
        }

        self.spreads.forEach(function (adj) {
            if (adj.index < index) {
                index += adj.amount;
            }
        });

        if (self[index] !== NO_RESULT) {
            throw new Error('Callbacks cannot be reused.');
        }

        if (err) {
            self.error = err;
            self.callback(err);
        }

        if (self.error) {
            return;
        }

        if (!type || type === 'first') {
            self[index] = arguments[1];
        } else if (type === 'collapse') {
            self[index] = Array.prototype.slice.call(arguments, 1);
        } else if (type === 'spread') {
            self.splice.apply(self, [index, 1].concat(Array.prototype.slice.call(arguments, 1)));
            self.spreads.forEach(function (adj) {
                if (adj.index > index) {
                    adj.index += arguments.length - 2;
                }
            });
            self.spreads.push({
                index: index,
                amount: arguments.length - 2
            });
        }

        self.expectedLength--;

        if (!self.queued) {
            process.nextTick(function () {
                self.check();
            });
            self.queued = true;
        }
    };
}

ResultSetMixin.check = check;
function check() {
    this.queued = false;
    if (this.expectedLength === 0) {
        this.callback(null, this);
    }
    return this;
}

ResultSetMixin.finalize = finalize;
function finalize() {
    if (this.finished) {
        return this;
    }

    var index = this.length;

    for (;index--;) {
        if (this[index] === NO_RESULT) {
            this[index] = null;
        }
    }

    this.finished = true;
    return this;
}

function Context(steps, options, callback) {
    var self = this;

    EventEmitter.call(self);

    if (callback) {
        self.on('error', function (err) {
            self._destroy();
            callback(err);
        });

        self.on('complete', function () {
            self._destroy();
            callback.apply(null, [null].concat(Array.prototype.slice.call(arguments)));
        });
    }

    self.steps = steps;
    self.index = 0;
    self.data = {};
    self.midStep = false;
    self.finished = false;
    self.timeout = options.timeout;

    // Resettable
    self.sync = null;
    self.results = null;
    self.timeoutId = null;

    self._reset();
    self._initAsyncProps();
    self._start();
}
util.inherits(Context, EventEmitter);

Context.prototype._start = _start;
function _start() {
    var self = this;
    process.nextTick(function () {
        self._nextStep();
    });
}

Context.prototype._destroy = _destroy;
function _destroy() {
  this.finished = true;
  this.removeAllListeners('error');
  this.removeAllListeners('complete');
}

Context.prototype._initAsyncProp = _initAsyncProp;
function _initAsyncProp(name, prop) {
    var self = this;
    Object.defineProperty(self, name, {
        get: function () {
            self.sync = false;
            if (self.timeout && !self.timeoutId) {
                self.timeoutId = setTimeout(function () {
                    self.emit('timeout', {
                        step: self.steps[self.index - 1],
                        results: self.results
                    }, function skip() {
                        self._nextStep();
                    });
                }, self.timeout);
            }
            return prop;
        }
    });
}

Context.prototype._initAsyncProps = _initAsyncProps;
function _initAsyncProps() {
    var self = this;

    self._initAsyncProp('next', self._nextStep);
    self._initAsyncProp('nextStep', self._nextStep);

    self._initAsyncProp('finish', self._finish);
    self._initAsyncProp('end', self._finish);

    self._initAsyncProp('group', self._group);

    self._initAsyncProp('push', function push(type) {
        return self.results.alloc(type);
    });
    self._initAsyncProp('first', function first() {
        return self.results.alloc('first');
    });
    self._initAsyncProp('collapse', function collapse() {
        return self.results.alloc('collapse');
    });
    self._initAsyncProp('spread', function spread() {
        return self.results.alloc('spread');
    });

    self._initAsyncProp('bind', function bind(ee, event) {
        return stepdown.bind(ee, event, self);
    });
    self._initAsyncProp('bindError', function bindError(ee) {
        return stepdown.bindError(ee, self);
    });
}

Context.prototype._reset = _reset;
function _reset() {
    var self = this;

    self.results = createResultSet(function () {
        self._nextStep();
    });
    self.results.push(self);
    self.sync = true;

    if (self.timeoutId) {
        clearTimeout(self.timeoutId);
        self.timeoutId = null;
    }
}

Context.prototype._finish = _finish;
function _finish(err /*, ... rest */) {
    if (!this.results) {
        this.results = [];
    }

    if (arguments.length > 0) {
        if (err) {
            this.results.error = err;
        } else {
            this.results.push.apply(this.results, Array.prototype.slice.call(arguments, 1));
        }
    }

    if (this.results.error) {
        this.emit('error', this.results.error);
        return;
    }

    this.results.finalize();
    this.results[0] = 'complete';

    this.emit.apply(this, this.results);

    return this;
}

Context.prototype._group = _group;
function _group(count, type) {
    if (!this.midStep) {
        throw new Error('Cannot call group asynchronously.');
    }

    if (typeof count === 'string') {
        type = count;
        count = null;
    }

    var self = this,
        callback = this.results.alloc('first'),
        groupResults = createResultSet(callback),
        group;

    if (count) {
        group = [];
        for (;count--;) {
            group.push(groupResults.alloc(type));
        }
        return group;
    }

    return function generator() {
        return groupResults.alloc(type);
    };
}

Context.prototype._nextStep = _nextStep;
function _nextStep(err /*, ... rest */) {
    if (this.finished) {
        return;
    }

    if (this.results) {
        if (arguments.length > 0) {
            if (err) {
                this.results.error = err;
            } else {
                this.results.push.apply(this.results, Array.prototype.slice.call(arguments, 1));
            }
        }

        if (this.results.error) {
            this.emit('error', this.results.error);
            return;
        }
    }

    if (this.index === this.steps.length) {
        return this._finish();
    }

    var self = this,
        step = self.steps[self.index++],
        prev = self.results.finalize(),
        result;

    self._reset();
    trycatch(function () {
        self.midStep = true;
        result = step.apply(null, prev);
        self.midStep = false;
    }, function (err) {
        self.finished = true;
        process.nextTick(function () {
            self.emit('error', err);
        });
        return;
    });

    if (self.sync) {
        self.results.push(result);
        self._nextStep();
    }
}

function stepdown(steps, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = DEFAULT_OPTIONS;
    } else if (options == null) {
        options = DEFAULT_OPTIONS;
    }

    return new Context(steps, options, callback);
}

stepdown.bindFirst = stepdown.bind = bindFirst;
function bindFirst(ee, event, callback) {
    if (callback instanceof Context) {
        callback = callback.first();
    }

    ee.once(event, function handler(data) {
        callback(null, data);
    });
}

stepdown.bindError = bindError;
function bindError(ee, callback) {
    var _callback = callback;

    if (callback instanceof Context) {
        _callback = function fail(err) {
            callback.finish(err);
        };
    }

    ee.once('error', _callback);
}

stepdown.Context = Context;
stepdown.ResultSetMixin = ResultSetMixin;
stepdown.createResultSet = createResultSet;

module.exports = stepdown;
