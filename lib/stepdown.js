var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    trycatch = null,
    NO_RESULT = {},
    DEFAULT_OPTIONS = {
        timeout: 10000
    },
    stepdown = null;

try {
    trycatch = require('trycatch');
} catch(e) {
}

function createResultSet(callback) {
    return ResultSetMixin.call([], callback);
}

function ResultSetMixin(callback) {
    var self = this;

    self.expectedLength = 0;
    self.error = null;
    self.queued = false;
    self.spreads = [];
    self.groups = {};
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
function alloc(type, hookFn) {
    var self = this,
        index = self.push(NO_RESULT) - 1;

    self.expectedLength++;

    // Any time a group is requested, we need to ensure the finalized result is always an Array.
    // Otherwise, it's handled identically to 'first'.
    if (type === 'group') {
        self.groups[index] = true;
        type = 'first';
    }

    return function collect(err /*, ... rest */) {
        if (self.finished) {
            return;
        }

        if (hookFn) {
            hookFn.apply(null, arguments);
        }

        self.spreads.forEach(function (adj) {
            if (adj.index < index) {
                index += adj.amount;
            }
        });

        if (self[index] !== NO_RESULT) {
            throw new Error('Callbacks cannot be reused.');
        }

        if (err && type !== 'event') {
            self.error = err;
            self.callback(err);
        }

        if (self.error) {
            return;
        }

        if (!type || type === 'first') {
            self[index] = arguments[1];
        } else if (type === 'event') {
            self[index] = arguments[0];
            err = null;
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
            this[index] = this.groups[index] ? [] : null;
        }
    }

    this.finished = true;
    return this;
}

function Context(steps, options, callback) {
    var self = this;

    EventEmitter.call(self);

    if (typeof callback === 'function') {
        self.on('error', function errorHandler(err) {
            self.removeListener('error', errorHandler);
            process.nextTick(function () {
                callback(err);
            });
        });

        self.on('complete', function completeHandler() {
            var args = arguments;

            self.removeListener('complete', completeHandler);
            process.nextTick(function () {
                callback.apply(null, [null].concat(Array.prototype.slice.call(args)));
            });
        });
    }

    self.steps = steps;
    self.index = 0;
    self.data = options.data || {};
    self.midStep = false;
    self.finished = false;
    self.timeout = options.timeout;

    // Resettable
    self.sync = null;
    self.results = null;
    self.timeoutId = null;

    self._reset();
    self._defineProps();
}
util.inherits(Context, EventEmitter);

Context.prototype.resume = resume;
function resume() {
    var self = this;
    process.nextTick(function () {
        self._nextStep();
    });
}

Context.prototype._initAsyncProp = _initAsyncProp;
function _initAsyncProp(name, prop) {
    var self = this;

    Object.defineProperty(self, name, {
        get: function () {
            self._outOfSync();
            return prop;
        }
    });
}

Context.prototype._defineProps = _defineProps;
function _defineProps() {
    var self = this;

    self._initAsyncProp('next', next);
    function next(err /*, ... rest */) {
        var args = arguments.length ? arguments : [null];

        self._nextStep.apply(self, args);
    }

    self._initAsyncProp('end', end);
    function end(err /*, ... rest */) {
        var args = arguments.length ? arguments : [null];

        self._finish.apply(self, args);
    }

    Object.defineProperties(self, {
        group: {
            value: self._group
        },
        push: {
            value: function push(type, hookFn) {
                self._outOfSync();
                return self.results.alloc(type, hookFn);
            }
        },
        first: {
            value: function first(hookFn) {
                self._outOfSync();
                return self.results.alloc('first', hookFn);
            }
        },
        collapse: {
            value: function collapse(hookFn) {
                self._outOfSync();
                return self.results.alloc('collapse', hookFn);
            }
        },
        spread: {
            value: function spread(hookFn) {
                self._outOfSync();
                return self.results.alloc('spread', hookFn);
            }
        },
        event: {
            value: function event(hookFn) {
                self._outOfSync();
                return self.results.alloc('event', hookFn);
            }
        },
        bind: {
            value: function bind(ee, event) {
                self._outOfSync();
                return stepdown.bind(ee, event, self);
            }
        },
        bindError: {
            value: function bindError(ee) {
                return stepdown.bindError(ee, self);
            }
        }
    });
}

Context.prototype._outOfSync = _outOfSync;
function _outOfSync() {
    var self = this;

    if (!self.sync) {
        return;
    }

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
    if (this.finished) {
        return;
    }

    this.finished = true;

    if (arguments.length > 0) {
        if (err) {
            this.emit('error', err);
        } else {
            err = 'complete';
            this.emit.apply(this, arguments);
        }
        return;
    }

    if (!this.results) {
        this.emit('complete');
        return;
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
        callback = this.results.alloc('group'),
        groupResults = createResultSet(callback),
        group;

    if (count) {
        self._outOfSync();
        group = [];
        for (;count--;) {
            group.push(groupResults.alloc(type));
        }
        return group;
    }

    process.nextTick(function () {
        if (!self.sync && !groupResults.length) {
            callback(null, []);
        }
    });

    return function generator(hookFn) {
        self._outOfSync();
        return groupResults.alloc(type, hookFn);
    };
}

Context.prototype._nextStep = _nextStep;
function _nextStep(err /*, ... rest */) {
    if (this.finished) {
        return;
    }

    if (arguments.length > 0) {
        this._reset();
        this.results.error = err;
        this.results.push.apply(this.results, Array.prototype.slice.call(arguments, 1));
    }

    if (this.results && this.results.error) {
        this.emit('error', this.results.error);
        return;
    }

    if (this.index === this.steps.length) {
        return this._finish();
    }

    var self = this,
        step = self.steps[self.index++],
        prev = self.results ? self.results.finalize() : [],
        result;

    function run() {
        result = step.apply(null, prev);
    }

    self._reset();
    self.midStep = true;

    if (trycatch) {
        trycatch(run, function (err) {
            self._finish(err);
        });
    } else {
        try {
            run();
        } catch (err) {
            console.log('ERROR:', err);
            self._finish(err);
        }
    }

    self.midStep = false;

    if (self.sync) {
        if (result instanceof Error) {
            return this._finish(result);
        }
        self.results.push(result);
        self._nextStep();
    }
}

Context.prototype.run = stepdown = run;
function run(steps, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = DEFAULT_OPTIONS;
    } else if (typeof options !== 'object') {
        options = DEFAULT_OPTIONS;
    }

    var context;

    if (this instanceof Context) {
        if (typeof callback === 'string') {
            callback = this.push(callback);
        }

        if (!callback) {
            callback = this.first();
        }

        options.data = this.data;
    }

    context = new Context(steps, options, callback);

    context.resume();
    return context;
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
            callback._finish(err);
        };
    }

    ee.once('error', _callback);
}

stepdown.Context = Context;
stepdown.ResultSetMixin = ResultSetMixin;
stepdown.createResultSet = createResultSet;
stepdown.run = stepdown;

module.exports = stepdown;
