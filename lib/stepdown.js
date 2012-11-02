var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    trycatch = require('trycatch');

var NO_RESULT = {},
    DEFAULT_OPTIONS = {
        slowTimeout: 10000,
        skipTimeout: 0
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
    if (!(this instanceof Context)) {
        return new Context(steps, options, callback);
    }

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
    self.id = Math.random().toString().slice(2);

    // Resettable
    self.sync = null;
    self.results = null;

    self._reset();
    self._initAsyncProps();
    self._start();
}
util.inherits(Context, EventEmitter);

Context.prototype._start = _start;
function _start() {
    var self = this;
    process.nextTick(function () {
        self._continue();
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
            return prop;
        }
    });
}

Context.prototype._initAsyncProps = _initAsyncProps;
function _initAsyncProps() {
    this._initAsyncProp('continue', this._continue);
    this._initAsyncProp('finish', this._finish);
    this._initAsyncProp('push', this._push);
    this._initAsyncProp('group', this._group);
}

Context.prototype._reset = _reset;
function _reset() {
    var self = this;

    self.results = createResultSet(function () {
        self._continue();
    });
    self.results.push(self);
    self.sync = true;
}

Context.prototype._finish = _finish;
function _finish(err /*, ... rest */) {
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

Context.prototype._push = _push;
function _push(type) {
    if (!this.midStep) {
        throw new Error('Cannot call push asynchronously.');
    }

    return this.results.alloc(type);
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
        callback = this._push('first'),
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

Context.prototype._continue = _continue;
function _continue(err /*, ... rest */) {
    if (this.finished) {
        return;
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
        self._continue();
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

    var emitter = new EventEmitter(),
        index = 0,
        midStep = false,
        results = [null],
        expectedResults = 0,
        slowTimeoutId = null,
        skipTimeoutId = null,
        synchronous = true,
        data = {};

    function next(err/*, ... rest*/) {
        var self = {
                data: data
            },
            rest,
            step,
            result;

        if (slowTimeoutId) {
            clearTimeout(slowTimeoutId);
            slowTimeoutId = null;
        }
        if (skipTimeoutId) {
            clearTimeout(skipTimeoutId);
            skipTimeoutId = null;
        }

        if (err) {
            // TODO: Assert that `err` is actually an Error instance.
            emitter.emit('error', err);
            return;
        }

        // if (expectedResults !== 0) {
        //     throw new Error('Cannot call next after addResult or [createGroup]()');
        // }

        rest = Array.prototype.slice.call(arguments, 1);

        if (index === steps.length) {
            emitter.emit.apply(emitter, ['complete'].concat(rest));
            return;
        }

        // if (results.length) {
        //     results = [null];
        //     expectedResults = 0;
        // }

        Object.defineProperties(self, {
            'addResult': {
                get: function () {
                    synchronous = false;
                    return fbind(addResult, self);
                }
            },
            'addEventResult': {
                get: function () {
                    synchronous = false;
                    return fbind(addEventResult, self);
                }
            },
            'createGroup': {
                get: function () {
                    synchronous = false;
                    return fbind(createGroup, self);
                }
            },
            'createEventGroup': {
                get: function () {
                    synchronous = false;
                    return fbind(createEventGroup, self);
                }
            },
            'next': {
                get: function () {
                    synchronous = false;
                    return tempNext;
                }
            }
        });

        trycatch(function() {
            step = steps[index++];

            if (options.slowTimeout) {
                slowTimeoutId = setTimeout(function slowTimeoutFn() {
                    emitter.emit('slow', step, function skip() {
                        tempNext.apply(null, arguments);
                    });
                }, options.slowTimeout);
            }
            if (options.skipTimeout) {
                skipTimeoutId = setTimeout(function skipTimeoutFn() {
                    var cancelled = false;

                    emitter.emit('skip', step, function cancel() {
                        cancelled = true;
                    });

                    // Events are emitted synchronously. If none have called cancel() synchronously, continue.
                    if (!cancelled) {
                        tempNext();
                    }
                }, options.skipTimeout);
            }

            midStep = true;
            result = step.apply(self, rest);
            midStep = false;

            if (synchronous) {
                tempNext(null, result);
            }
        }, function(err) {
            emitter.emit('error', err);
        });

        function tempNext() {
            var args = arguments;


            if (tempNext.completed === true) {
                throw new Error('This step has already progressed.');
            }

            tempNext.called = true;
            if (midStep) {
                process.nextTick(function() {
                    tempNext.apply(null, args);
                });
                return;
            }

            data = self.data;
            tempNext.completed = true;
            next.apply(null, args);
        }
    }

    function addResult(that) {
        if (!midStep) {
            throw new Error('addResult cannot be called after the step has completed.');
        }

        var index = results.push(NO_RESULT) - 1;

        expectedResults++;

        return function collectResult(err/*, ... rest*/) {
            if (results[index] !== NO_RESULT) {
                // TODO: Emit an error? They've already called this callback.
                return;
            }

            if (err) {
                if (results[0] === null) {
                    results[0] = err;
                } else if (Array.isArray(results[0])) {
                    results[0].push(err);
                } else {
                    results[0] = [results[0], err];
                }
            }

            if (arguments.length === 2) {
                results[index] = arguments[1];
            } else if (arguments.length > 2) {
                results[index] = Array.prototype.slice.call(arguments, 1);
            } else {
                results[index] = null;
            }

            if (midStep) {
                process.nextTick(function() {
                    checkExpectedResults(that)
                });
            } else {
                checkExpectedResults(that);
            }
        };
    }
    function checkExpectedResults(that) {
        expectedResults--;

        if (!expectedResults) {
            that.next.apply(null, results);
        }
    }

    function addEventResult(that) {
        var callback = addResult(that);
        return function handleEvent() {
            var args = Array.prototype.slice.call(arguments);
            args.unshift(null);
            callback.apply(null, args);
        };
    }

    function createGroup(that, count) {
        var callback = addResult(that),
            groupError = null,
            groupResults = [],
            expectedGroupResults = 0,
            completed = false,
            ret;

        function checkExpectedGroupResults() {
            if (expectedGroupResults === 0) {
                completed = true;

                callback.apply(null, [groupError, groupResults]);
            }
        }

        function onComplete() {
            expectedGroupResults--;
            checkExpectedGroupResults();
        }

        function addGroupResult() {
            if (completed) {
                throw new Error('Group has already completed. Did you asynchronously generate?');
            }

            var index = groupResults.push(NO_RESULT) - 1;

            expectedGroupResults++;

            return function collectGroupResult(err/*, ... rest*/) {
                if (groupResults[index] !== NO_RESULT) {
                    // TODO: Emit an error? They've already called this callback.
                    return;
                }
                if (completed) {
                    throw new Error('Group has already completed.');
                }

                if (err) {
                    if (groupError === null) {
                        groupError = err;
                    } else if (Array.isArray(groupError)) {
                        groupError.push(err);
                    } else {
                        groupError = [groupError, err];
                    }
                }

                if (arguments.length === 2) {
                    groupResults[index] = arguments[1];
                } else if (arguments.length > 2) {
                    groupResults[index] = Array.prototype.slice.call(arguments, 1);
                } else {
                    groupResults[index] = null;
                }

                if (midStep) {
                    process.nextTick(onComplete);
                    return;
                }

                onComplete();
            };
        }

        process.nextTick(function() {
            if (!that.next.called) {
                checkExpectedGroupResults()
            }
        });

        if (typeof count === 'number') {
            ret = Array(count)
            for(var i=0; i<count; ++i) {
                ret[i] = addGroupResult();
            }
            return ret;
        }

        return addGroupResult;
    }

    function createEventGroup(that) {
        var generator = createGroup(that);
        return function addEventGroupResult() {
            var callback = generator();
            return function collectEventGroupResult() {
                var args = Array.prototype.slice.call(arguments);
                args.unshift(null);
                callback.apply(null, args);
            }
        }
    }

    function wrappedCallback(fn) {
        return function() {
            emitter.removeAllListeners('error');
            emitter.removeAllListeners('complete');
            fn.apply(this, arguments);
        };
    }

    // Performance optimization
    function fbind(fn, arg1) {
        return function(arg2, arg3, arg4) {
            return fn(arg1, arg2, arg3, arg4)
        };
    }

    if (callback) {
        emitter.on('error', wrappedCallback(callback));
        emitter.on('complete', wrappedCallback(callback.bind(null, null)));
    }

    process.nextTick(next);

    return emitter;
}

stepdown.Context = Context;
stepdown.ResultSetMixin = ResultSetMixin;
stepdown.createResultSet = createResultSet;

module.exports = stepdown;
