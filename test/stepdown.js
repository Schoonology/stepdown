/*global describe:true, it:true */
var expect = require('chai').expect,
    stepdown = require('../');

describe('Stepdown', function () {
    describe('next', function () {
        it('should execute each step in order when this or this.next is called', function (done) {
            var steps = [];

            stepdown([function stepOne() {
                steps.push(1);
                this();
            }, function stepTwo() {
                steps.push(2);
                this();
            }, function stepThree() {
                steps.push(3);
                this.next();
            }, function () {
                expect(steps).to.have.length(3);
                expect(steps[0]).to.equal(1);
                expect(steps[1]).to.equal(2);
                expect(steps[2]).to.equal(3);
                done();
            }]);
        });

        it('should execute the next function with the value from the previous callback', function (done) {
            stepdown([function stepOne(err, value) {
                expect(err).to.not.exist;
                expect(value).to.not.exist;
                this.next(null, 'one');
            }, function stepTwo(err, value) {
                expect(err).to.not.exist;
                expect(value).to.equal('one');
                this.next(null, 'two');
            }, function stepThree(err, value) {
                expect(err).to.not.exist;
                expect(value).to.equal('two');
                this.next(null, 'three');
            }, function finished(err, value) {
                expect(err).to.not.exist;
                expect(value).to.equal('three');
                done();
            }]);
        });

        it('should execute the next function with the error from the previous callback', function (done) {
            stepdown([function stepOne(err, value) {
                expect(err).to.not.exist;
                expect(value).to.not.exist;
                this.next('one', null);
            }, function stepTwo(err, value) {
                expect(err).to.equal('one');
                expect(value).to.not.exist;
                this.next('two', null);
            }, function stepThree(err, value) {
                expect(err).to.equal('two');
                expect(value).to.not.exist;
                this.next('three', null);
            }, function finished(err, value) {
                expect(err).to.equal('three');
                expect(value).to.not.exist;
                done();
            }]);
        });

        it('should execute the provided error handler on throw', function (done) {
            stepdown([function flaky() {
                throw 42;
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });

        it('should execute the provided error handler on error', function (done) {
            stepdown([function flaky() {
                this.next(42);
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });

        it('should pass only one value when an error handler is provided', function (done) {
            stepdown([function stepOne(value) {
                expect(value).to.not.exist;
                this(null, 'one');
            }, function stepTwo(value) {
                expect(value).to.equal('one');
                this(null, 'two');
            }, function stepThree(value) {
                expect(value).to.equal('two');
                this(null, 'three');
            }, function finished(value) {
                expect(value).to.equal('three');
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });
    });

    describe('addResult', function () {
        it('should execute the next step only when all generated callbacks have been fired', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo() {
                expect(arguments).to.have.length(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should preserve the order of the results as separate arguments', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo(a, b, c) {
                expect(arguments).to.have.length(3);
                expect(a).to.equal(2);
                expect(b).to.equal(1);
                expect(c).to.equal(3);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should clear those results between parallel stages', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 3), 30);
            }, function stageTwo() {
                setTimeout(this.addResult().bind(this, null, 4), 20);
                setTimeout(this.addResult().bind(this, null, 5), 10);
            }, function stageThree(a, b) {
                expect(arguments).to.have.length(2);
                expect(a).to.equal(4);
                expect(b).to.equal(5);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should collect each "result" as an Array if more than one argument is given', function (done) {
            stepdown([function stageOne() {
                setTimeout(this.addResult().bind(this, null, 2, 3, 4), 20);
                setTimeout(this.addResult().bind(this, null, 1), 10);
                setTimeout(this.addResult().bind(this, null, 5), 30);
            }, function stageTwo(a, b, c) {
                expect(arguments).to.have.length(3);
                expect(a).to.deep.equal([2, 3, 4]);
                expect(b).to.equal(1);
                expect(c).to.equal(5);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should pass the only error to the error handler as an Error', function (done) {
            stepdown([function stageOne() {
                this.addResult()(42);
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });
        it('should pass an array of Errors to the error handler if there is more than one', function (done) {
            stepdown([function stageOne() {
                this.addResult()(42);
                this.addResult()('answer');
            }], function errorHandler(err) {
                expect(err).to.be.an.instanceof(Array);
                expect(err).to.have.length(2);
                done();
            });
        });
    });

    describe('createGroup', function () {
        it('should execute the next step only when all generated callbacks have been fired', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 3), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);

                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should preserve the order of the results as separate arguments', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 3), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);
                expect(results[0]).to.equal(2);
                expect(results[1]).to.equal(1);
                expect(results[2]).to.equal(3);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should not collude results between groups', function (done) {
            stepdown([function stageOne() {
                var groupA = this.createGroup(),
                    groupB = this.createGroup();

                setTimeout(groupA().bind(this, null, 2), 20);
                setTimeout(groupA().bind(this, null, 1), 10);
                setTimeout(groupA().bind(this, null, 3), 30);
                setTimeout(groupB().bind(this, null, 4), 20);
                setTimeout(groupB().bind(this, null, 5), 10);
            }, function stageTwo(a, b) {
                expect(a).to.have.length(3);
                expect(b).to.have.length(2);

                expect(a).to.deep.equal([2, 1, 3]);
                expect(b).to.deep.equal([4, 5]);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should collect each "result" as an Array if more than one argument is given', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                setTimeout(group().bind(this, null, 2, 3, 4), 20);
                setTimeout(group().bind(this, null, 1), 10);
                setTimeout(group().bind(this, null, 5), 30);
            }, function stageTwo(results) {
                expect(results).to.have.length(3);
                expect(results[0]).to.deep.equal([2, 3, 4]);
                expect(results[1]).to.equal(1);
                expect(results[2]).to.equal(5);
                
                done();
            }], function errorHandler(err) {
                // We don't expect this to get called this time.
                throw err;
            });
        });

        it('should pass the only error to the error handler as an Error', function (done) {
            stepdown([function stageOne() {
                this.createGroup()()(42);
            }], function errorHandler(err) {
                expect(err).to.equal(42);
                done();
            });
        });
        it('should pass an array of Errors to the error handler if there is more than one', function (done) {
            stepdown([function stageOne() {
                var group = this.createGroup();

                group()(42);
                group()('answer');
            }], function errorHandler(err) {
                expect(err).to.be.an.instanceof(Array);
                expect(err).to.have.length(2);
                done();
            });
        });
    });

    describe('step', function () {
        it('should emulate Step', function (done) {
            stepdown.step(function stepOne(err, value) {
                expect(err).to.not.exist;
                expect(value).to.not.exist;
                this.next(null, 'one');
            }, function stepTwo(err, value) {
                expect(err).to.not.exist;
                expect(value).to.equal('one');
                this.next('two', null);
            }, function stepThree(err, value) {
                expect(err).to.equal('two');
                expect(value).to.not.exist;
                this.parallel()(null, 'three');
            }, function finished(err, value) {
                expect(err).to.not.exist;
                expect(value).to.equal('three');
                done();
            });
        });
    });

    describe('stepup', function () {
        it('should emulate Stepup', function (done) {
            stepdown.stepup(function errorHandler(err, next) {
                expect(err).to.equal('two');
                next();
            }, function stepOne(value) {
                expect(value).to.not.exist;
                this.next(null, 'one');
            }, function stepTwo(value) {
                expect(value).to.equal('one');
                this.next('two', null);
            }, function stepThree(value) {
                expect(value).to.not.exist;
                this.parallel()(null, 'three');
            }, function finished(value) {
                expect(value).to.equal('three');
                done();
            });
        });
    });
});
