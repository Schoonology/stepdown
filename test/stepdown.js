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

describe('stepdown', function () {
})
