var debug = require('debug')('stepdown')
  , slice = Array.prototype.slice
  , PENDING = {}
  , ERROR = {}

/**
 * A stand-in callback function that does (as the name suggests) nothing.
 */
function noop(err, data) {}

/**
 * TL;DR: For _collapsing_ multiple callback arguments into a single Array.
 *
 * Called with `this` as a Node-style callback function, it returns a new
 * callback function. When this new function is called, it collapses all
 * arguments past the first into a single Array, calling the original callback
 * function with that Array as its second argument. If called with an Error,
 * the original callback function is called with only that Error instead.
 *
 * Example:
 *
 * collapse.call(callback)(null, 1, 2, 3)
 *  => callback(null, [1, 2, 3])
 */
function collapse() {
  var callback = this

  return function collapser(err) {
    callback(err, err ? null : slice.call(arguments, 1))
  }
}

/**
 * TL;DR: For creating a fixed-size _group_ of related callback functions.
 *
 * Called with `this` as a Node-style callback function and `size` as the
 * number of child functions to create, it returns an Array of Functions.
 * Each of those functions is a Node-style callback in its own right. If and
 * when all of those functions are called without an Error, the original
 * callback function is called with all of the second arguments from all
 * of the child functions.
 *
 * If any of the child functions is called with an Error, the original
 * callback function is called with only that Error instead.
 *
 * Example:
 *
 * var arr = group.call(callback, 3)
 * arr[0](null, 1)
 * arr[1](null, 2)
 * arr[2](null, 3)
 * => callback(null, [1, 2, 3])
 */
function group(size) {
  var cb = this
    , children = new Array(size || 0)
    , results = new Array(size || 0)
    , pending = size

  for (var i = 0; i < size; i++) {
    // TODO: Make this the same kind of callback as stepdown() returns.
    children[i] = function groupie(err, data) {
      if (!cb) {
        return
      }

      if (err) {
        cb(err)
        cb = null
        return
      }

      results[groupie.i] = data
      pending--
      check()
    }
    extendCallback(children[i])
    children[i].i = i
  }

  check()

  return children

  function check() {
    if (pending === 0) {
      setImmediate(function () {
        cb(null, results)
      })
    }
  }
}

/**
 * TL;DR: For _ignoring_ the result of a callback function.
 *
 * Called with `this` as a Node-style callback function, it returns a new
 * callback function. When this new function is called, the original callback
 * function is called with no arguments. No arguments are passed along, even
 * if the new function is called with an Error.
 *
 * Example:
 *
 * ignore.call(callback)(1, 2, 3)
 *  => callback()
 */
function ignore() {
  var cb = this

  return function ignorer() {
    cb()
  }
}

/**
 * TL;DR: For accepting only the _error_ from a callback function.
 *
 * Called with `this` as a Node-style callback function, it returns a new
 * callback function. If this new function is called without an Error, the
 * original callback function is called with no arguments. If called with an
 * Error, the original callback function is called with that Error instead.
 *
 * Example:
 *
 * error.call(callback)(null, 1, 2, 3)
 *  => callback(null)
 */
function error() {
  var cb = this

  return function errorer(err) {
    cb(err)
  }
}

/**
 * TL;DR: For passing callbacks as _event_ handlers.
 *
 * Called with `this` as a Node-style callback function, it returns a new
 * function that no longer expects the first argument to be an Error. Instead,
 * all arguments passed to the new function will be passed as non-Error
 * (second onward) arguments to the original callback function.
 *
 * Example:
 *
 * event.call(callback)(1, 2, 3)
 *  => callback(null, 1, 2, 3)
 */
function event() {
  var cb = this

  return function eventer(data) {
    var args

    if (arguments.length === 1) {
      cb(null, data)
      return
    }

    args = slice.call(arguments)
    args.unshift(null)
    cb.apply(null, args)
  }
}

/**
 * TL;DR: For passing event handlers as callback functions.
 * (That's all I've got)
 *
 * Called with `this` as a function, it returns a Node-style callback
 * function. When this function is called, it calls the original function,
 * passing its second argument as the first. Due to the nature of the
 * transformation, the first argument (the Error) is ignored.
 *
 * Example:
 *
 * unevent.call(handler)(1, 2, 3)
 *  => handler(2)
 */
function unevent() {
  var handler = this

  return function uneventer(err, data) {
    handler(data)
  }
}

/**
 * Extends `fn` with the Stepdown extensions, returning the same function.
 *
 * Those extensions are:
 *  - `collapse`
 *  - `group`
 *  - `ignore`
 *  - `error`
 *  - `event`
 */
function extendCallback(fn) {
  fn.collapse = collapse
  fn.group = group
  fn.ignore = ignore
  fn.error = error
  fn.event = event

  return fn
}

/**
 * Given a Node-style `callback` function and a `next` function, it returns
 * a new function called the "context function".
 *
 * The context function accepts one argument: a key, returning a Node-style
 * callback function that represents the eventual value of this key within
 * `context.data`. This function is a "data function".
 *
 * When a data function is called with an error, `context.data[key]` is set
 * to a unique value, and the original callback function is called with that
 * error as its only argument. When a data function is called without an error,
 * the second argument of that data function is assigned to
 * `context.data[key]`. Every time no outstanding data functions are left,
 * the `next` function is called with the context as its only argument.
 *
 * Two additional properties are exposed by the context, to be used
 * _with caution_:
 *
 *  - `context.pending`, the number of pending data functions.
 *  - `context.expand`, a Boolean. If `true`, data functions can be created
 *  and the `next` function will not be called. If `false`, data functions
 *  cannot be created, but the `next` function becomes available to the logic
 *  in the context. This prevents two particularly nasty issues that would
 *  otherwise ruin either our fun, simplicity, or stability, usually by causing
 *  `next` to be called multiple times:
 *     - Next function called inside a step function.
 *     - Data functions _generated_ asynchronously.
 */
function createContext(callback, next) {
  context.pending = 0

  function context(name) {
    if (!context.expand) {
      return noop
    }

    name = String(name)

    context.data[name] = PENDING
    context.pending++

    debug('Context expanded with %j.', name)

    function dataFn(err, value) {
      if (context.data[name] !== PENDING) {
        debug('Callback called for non-pending %j', name)
        return
      }

      if (err) {
        debug('Failed callback for %j with %j', name, err)
        context.data[name] = ERROR
        callback(err)
        return
      }

      debug('Satisfied callback for %j with %j', name, value)
      context.data[name] = value
      context.pending--

      if (context.pending === 0 && next && !context.expand) {
        next(context)
      }
    }

    extendCallback(dataFn)

    return dataFn
  }

  context.data = {}
  context.pending = 0
  context.expand = false

  debug('New context.')

  return context
}

/**
 * Given a set of `steps` and an eventual `callback` functions, it returns
 * a "context function", as decribed in `createContext`.
 *
 * More interestingly, this function has one major side effect: it calls (or
 * indends to call) all of the `steps` in order. This `steps` Array is
 * assumed to be an Array of Functions, referred to here as "step functions".
 *
 * Each of these step functions is passed one argument: the same context.
 * This context can be used to bind together arbitrary asynchronous behaviour
 * within that step function, and the next step function in the Array will
 * not be called until all outstanding data functions (see `createContext`,
 * above) have been accounted for. If any generated data function is called
 * with an error, the rest of the step functions _will not run_. Instead, the
 * original callback function will be called with that error.
 *
 * If no data functions are generated within a step function, the next step
 * function will be called.
 *
 * Once all step functions have been called, the final callback function will
 * be called with the compiled `context.data` object as its second argument.
 */
function stepdown(steps, callback) {
  var index = -1
    , context = createContext(callback, next)

  callback = callback || noop

  next()

  return context

  function next() {
    index++

    debug('Next.')

    if (!steps || index >= steps.length) {
      callback(null, context.data)
      return
    }

    setImmediate(function () {
      context.expand = true
      steps[index](context)
      context.expand = false

      if (context.pending === 0) {
        setImmediate(next)
      }
    })
  }
}

/*!
 * Export `stepdown`.
 */
module.exports = stepdown

/*!
 * Expose the internals for advanced users and testing.
 */
stepdown.collapse = collapse
stepdown.group = group
stepdown.ignore = ignore
stepdown.error = error
stepdown.event = event
stepdown.unevent = unevent
stepdown.extendCallback = extendCallback
stepdown.createContext = createContext
