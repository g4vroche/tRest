
"use strict";

var ds      = require('./datastore.js');
var request = require('request');
var utils  = require('./utils.js');
var clc     = require('cli-color');
var _results = {
  endpoints:{},
  endpointscount:0,
  calls:0,
  asserts:0,
  success: true
};
var suite_file = process.argv[2];



exports.run = runTestPlan;
exports.that = exports.if = require('./assertions.js');
exports.getData = ds.getData;
exports.setData = ds.setData;

exports.outputJSON = require('./output').json;
exports.outputCli = require('./output').cli;


function assertions(test, response, body ){

  test.pass = false;

  if ( test.asserts ){
    for(var i=0; i<test.asserts.length; i++){

      test.asserts[i].result = test.asserts[i].test.call(test.asserts[i], response, body);

      if ( test.asserts[i].result === false ){
        return test;
      }
    }
  }

  test.pass = true;

  return test;
}




function save_results( test ){
  if ( !_results.endpoints[test.uri] ){
    _results.endpoints[test.uri] = true;
    _results.endpointscount++;
  }

  _results.calls++;

  var i=0;

  while ( i<test.asserts.length && test.asserts[i].result ){
    _results.asserts++;
    i++;
  }

  if ( i<test.asserts.length && !test.asserts[i].result ){
    _results.success = false;
  }

}

function runTestPlan(plan, output, next){
  var j=0;

  if( plan.prepare ){
    plan.prepare.call(null, plan);
  }

  output.begin( plan );

  runTest(plan, j, output, function(){

    output.end( plan );
    output.stats( _results );

    if( plan.clean ){
      plan.clean.call(null, plan);
    }

    if( next ){
      next(_results);
    }
  });
}




function runTest(plan, pointer, output, finalCallback){

  var test = plan.tests[pointer];

  test.body = utils.getValue(test.body);
  test.uri = utils.getValue(test.uri);
  test.multipart = utils.getValue(test.multipart);
  test.headers = utils.getValue(test.headers);

  test.waitBefore = test.waitBefore || 0;
  test.waitAfter = test.waitAfter ||  0;


  var delayAfter = function(plan, pointer, output, callback, finalCallback){
    if ( test.waitAfter ){
      output.write('Waiting '+ test.waitAfter +'s');
    }
    setTimeout(function(){
      runTest(plan, pointer, output, finalCallback);
    }, test.waitAfter*1000);
  };

  var delayBefore = function(plan, pointer, output, callback, finalCallback){
    if ( test.waitBefore ){
      output.write('Waiting '+ test.waitBefore +'s');
    }
    executeHTTPTest(plan, test, pointer, output, callback, finalCallback);
  };

  setTimeout( function(){
    delayBefore(plan, pointer, output, delayAfter, finalCallback);
  }, test.waitBefore*1000);

}




function store(test, response, body){

  for(var i=0; i<test.store.length; i++){

    if (typeof(test.store[i].src) === 'function') {
      ds.setData( test.store[i].dest, test.store[i].src(response));
    } else {
      var data = JSON.parse(body);

      ds.setData( test.store[i].dest, utils.getPathValue(data, test.store[i].src) );
    }
  }
}

function executeHTTPTest( plan, test, pointer, output, callback, finalCallback ){

  var url = test.uri;

  if (url.indexOf('http') === -1){
    url = plan.base_uri + url;
  }

  var params = {
    url: url,
    method: 'GET',
    jar: false,
    rejectUnauthorized: false
  };

  if ( test.method ){
    params.method = test.method;
  }

  if( test.body ){
    if (typeof(test.body) == "object" ) {
      params.form = test.body;
    } else if (typeof(test.body) === "string"){
      params.body = test.body;
    }
  }

  if( test.auth ){
    params.auth = test.auth;
  }

  if ( test.headers ){

    if ( typeof(test.headers) === 'function'){
      params.headers = test.headers();
    } else {
      params.headers = test.headers;
    }
  }

  if( test.multipart ){
    params.multipart = test.multipart;
  }

  test.pass = true;

  var req = request(params, function(err, response, body){

    if ( err ){
      console.log( clc.red.bold('ERROR') );
      console.log( "Could not complete HTTP request:");
      console.log( clc.bold("Params:"));
      console.log( params );
      console.log( clc.bold("Error:"));
      console.log( err );
      return;
    }

    if ( test.asserts ){
      test = assertions(test, response, body);
    }

    output.show( test );


    if( ! test.pass && ! plan.continueOnError ){
      // output.end( plan );
      if (plan.clean){
        plan.clean.call(null, plan);
      }

      save_results(test);
      finalCallback(_results);
      return false;
    }


    if ( test.store ){
      store(test, response, body);
    }

    save_results(test);

    pointer++;


    output.inter( plan, pointer );

    if( pointer < plan.tests.length ){
      callback(plan, pointer, output, callback, finalCallback);
    } else {
      finalCallback(_results);
    }
  });
}
