var expect = require('chai').expect
  , stepdown = require('../')

describe('collapse', function () {
  it('should return a Function', function () {
    expect(stepdown.collapse.call()).to.be.a('function')
  })

  it('should collect all secondary arguments into an Array', function () {
    stepdown.collapse.call(function callback(err, arr) {
      expect(err).to.not.exist
      expect(arr).to.be.an.instanceof(Array)
      expect(arr).to.deep.equal([1, 2, 3])
    })(null, 1, 2, 3)
  })

  it('should pass through the Error', function () {
    var error = new Error('test')

    stepdown.collapse.call(function callback(err, arr) {
      expect(arr).to.not.exist
      expect(err).to.be.an.instanceof(Error)
      expect(err).to.equal(error)
    })(error)
  })

  it('should collect zero arguments into an empty Array', function () {
    stepdown.collapse.call(function callback(err, arr) {
      expect(err).to.not.exist
      expect(arr).to.be.an.instanceof(Array)
      expect(arr).to.deep.equal([])
    })()
  })
})

describe('group', function () {
  it('should return an sized Array of Functions', function () {
    var group = stepdown.group.call(null, 2)

    expect(group).to.be.an.instanceof(Array)
    expect(group).to.have.length(2)

    expect(group[0]).to.be.a('function')
    expect(group[1]).to.be.a('function')
  })

  it('should call the original callback once all are called', function (done) {
    var async = false
      , group

    group = stepdown.group.call(function callback() {
      expect(async).to.be.true
      done()
    }, 3)

    group[0]()
    group[1]()
    group[2]()
    async = true
  })

  it('should call the original callback with the secondary arguments', function (done) {
    var group = stepdown.group.call(function callback(err, arr) {
      expect(arr).to.be.an.instanceof(Array)
      expect(arr).to.deep.equal([1, 2, 3])
      done()
    }, 3)

    group[0](null, 1)
    group[1](null, 2)
    group[2](null, 3)
  })

  it('should call the original callback with the first Error', function (done) {
    var first = new Error('first')
      , second = new Error('second')
      , group

    group = stepdown.group.call(function callback(err, arr) {
      expect(arr).to.not.exist
      expect(err).to.be.an.instanceof(Error)
      expect(err).to.equal(first)
      done()
    }, 3)

    group[0](first)
    group[1](second)
    group[2](null)
  })

  it('should call the callback if the size is zero', function (done) {
    var group

    group = stepdown.group.call(function callback(err, arr) {
      expect(err).to.not.exist
      expect(arr).to.be.an.instanceof(Array)
      expect(arr).to.have.length(0)
      done()
    }, 0)

    expect(group).to.have.length(0)
  })

  it('should provide the stepdown extensions for all children', function () {
    var group = stepdown.group.call(function () {}, 1)

    expect(group[0].collapse).to.exist
    expect(group[0].group).to.exist
    expect(group[0].ignore).to.exist
    expect(group[0].error).to.exist
    expect(group[0].event).to.exist
  })
})

describe('ignore', function () {
  it('should return a Function', function () {
    expect(stepdown.ignore.call()).to.be.a('function')
  })

  it('should ignore any Error', function () {
    stepdown.ignore.call(function callback(err, data) {
      expect(err).to.not.exist
      expect(data).to.not.exist
    })(new Error('test'))
  })

  it('should ignore any secondary arguments', function () {
    stepdown.ignore.call(function callback(err, data) {
      expect(err).to.not.exist
      expect(data).to.not.exist
    })(null, 1, 2, 3)
  })
})

describe('error', function () {
  it('should return a Function', function () {
    expect(stepdown.error.call()).to.be.a('function')
  })

  it('should pass through any Error', function () {
    var error = new Error('test')

    stepdown.error.call(function callback(err, data) {
      expect(data).to.not.exist
      expect(err).to.be.an.instanceof(Error)
      expect(err).to.equal(error)
    })(error)
  })

  it('should ignore any secondary arguments', function () {
    stepdown.error.call(function callback(err, data) {
      expect(err).to.not.exist
      expect(data).to.not.exist
    })(null, 1, 2, 3)
  })
})

describe('event', function () {
  it('should return a Function', function () {
    expect(stepdown.event.call()).to.be.a('function')
  })

  it('should pass through the first argument', function () {
    stepdown.event.call(function callback(err, data) {
      expect(err).to.not.exist
      expect(data).to.equal(1)
    })(1)
  })

  it('should pass through all arguments', function () {
    stepdown.event.call(function callback(err, a, b, c) {
      expect(err).to.not.exist
      expect(a).to.equal(1)
      expect(b).to.equal(2)
      expect(c).to.equal(3)
    })(1, 2, 3)
  })
})

describe('unevent', function () {})

describe('extendCallback', function () {
  it('should add the appropriate extensions', function () {
    function callback() {}

    expect(callback.collapse).to.not.exist
    expect(callback.group).to.not.exist
    expect(callback.ignore).to.not.exist
    expect(callback.error).to.not.exist
    expect(callback.event).to.not.exist

    stepdown.extendCallback(callback)

    expect(callback.collapse).to.exist
    expect(callback.group).to.exist
    expect(callback.ignore).to.exist
    expect(callback.error).to.exist
    expect(callback.event).to.exist
  })
})

describe('createContext', function () {
  it('should return a function', function () {
    expect(stepdown.createContext()).to.be.a('function')
  })

  describe('context function', function () {
    it('should return a function', function () {
      var context = stepdown.createContext()

      expect(context()).to.be.a('function')
    })

    it('should provide its data object', function () {
      var context = stepdown.createContext()

      expect(context.data).to.be.an('object')
    })
  })

  describe('data function', function () {
    it('should pass any error to the original callback', function (done) {
      var error = new Error('test')
        , context

      context = stepdown.createContext(function (err, data) {
        expect(data).to.not.exist
        expect(err).to.be.an.instanceof(Error)
        expect(err).to.equal(error)
        done()
      })

      context.expand = true
      context()(error)
    })

    it('should pass the second argument to the context', function () {
      var context = stepdown.createContext(function () {})

      context.expand = true
      context('test')(null, 1, 2)

      expect(context.data['test']).to.equal(1)
    })

    it('should provide the stepdown extensions', function () {
      var context = stepdown.createContext(function () {})
        , dataFn

      context.expand = true
      dataFn = context()

      expect(dataFn.collapse).to.exist
      expect(dataFn.group).to.exist
      expect(dataFn.ignore).to.exist
      expect(dataFn.error).to.exist
      expect(dataFn.event).to.exist
    })
  })

  describe('expand', function () {
    it('should default to false', function (){
      var context = stepdown.createContext(function () {})

      expect(context.expand).to.be.false
    })

    describe('if false,', function () {
      it('should prevent data function creation', function () {
        var context = stepdown.createContext(function () {})

        context.expand = false
        context('test')(null, 1)
        expect(context.data['test']).to.not.exist
      })

      it('should allow the next function', function (done) {
        var context
          , dataFn

        context = stepdown.createContext(function () {}, function () {
          done()
        })

        context.expand = true
        dataFn = context('test')

        context.expand = false
        dataFn(null, 1)
      })
    })

    describe('if true,', function () {
      it('should allow data function creation', function () {
        var context = stepdown.createContext(function () {})

        context.expand = true
        context('test')(null, 1)
        expect(context.data['test']).to.equal(1)
      })

      it('should prevent the next function', function (done) {
        var context
          , dataFn

        context = stepdown.createContext(function () {}, function () {
          done(new Error('Called next'))
        })

        context.expand = true
        dataFn = context('test')
        dataFn(null, 1)

        setImmediate(done)
      })
    })
  })
})

describe('stepdown', function () {
})
