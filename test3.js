var step = require('./lib/step');

step(function(err) {
  console.log('error2', err.stack);
  this('doit');
}, function() {
  console.log('x');
  setTimeout(function() {
    setTimeout(function() {
    	throw new Error('suck...');
      setTimeout(next, 5);
    }, 5);
  }, 5);
}, function() {
  console.log('y', arguments);
  throw new Error('fail');
}, function(data) {
  console.log(data); // "doit"
});
