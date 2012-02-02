var fs = require('fs');
var url = require('url');
var qs = require('querystring');
var path = require('path');
var http = require('http');

var spawn = require('child_process').spawn;
var EventEmitter = require('events').EventEmitter;

function exists (repo, cb) {
    path.exists(repo, cb);
};

function create (repo, cb) {
  var cwd = process.cwd();
  var ps = spawn('git', [ 'init', '--bare', repo ,'update-server-info']);
  
  var err = '';
  ps.stderr.on('data', function (buf) { err += buf });
  
  ps.on('exit', function (code) {
    if (!cb) {}
    else if (code) cb(err || true)
    else cb(null)
  });
};

var services = [ 'upload-pack', 'receive-pack' ];

module.exports = function (app) {
    
  function noCache (res) {
    res.header('expires', 'Fri, 01 Jan 1980 00:00:00 GMT');
    res.header('pragma', 'no-cache');
    res.header('cache-control', 'no-cache, max-age=0, must-revalidate');
  }

  function repo_exists(res,repo,next) {
  	exists(repo,function(exists) {
      if (!exists) create(repo, next);
      else if (!exists)
        res.send('repository not found' ,{'Content-Type': 'text/plain'}, 404);
      else next();
    });
  }


  app.post(/.*/,function(req,res,next) {
    console.log('post');
    console.log(req.url);
    console.log(req.body);
    next();
  });

  app.get(/.*/,function(req,res,next) {
    console.log('get');
    console.log(req.url);
    console.log(req.body);
    next();
  });

  app.get('/:repo/info/refs',function(req,res,next) {
    //console.log('get /:repo/info/refs')
    //console.log(req);
    var repo = req.params.repo;
    if (!req.query.service) {
      res.send('service paramater required',400);
      return;
    }
    var service = req.query.service.replace(/^git-/, '');
    if (services.indexOf(service) < 0) {
      res.send('service not available',405);
      return;
    }

    var next = function() {
      res.header('content-type','application/x-git-' + service + '-advertisement');
      noCache(res);
      serviceRespond(service,repo,res);
    };

    repo_exists(res,repo,next)
    
  });

  app.get('/:repo/HEAD',function(req,res,next) {
    //console.log('get /:repo/HEAD')
    //console.log(req);
  	var repo = req.params.repo;
  	var next = function() {
  		var file = path.join(repo,'.git','HEAD');
  		path.exists(file,function(ex) {
  			if (ex) fs.createReadStream(file),pipe(res);
  			else res.send('not found',404);
  		});
  	};

  	repo_exists(res,repo,next);
  });
    
   
  app.post(/\/([^\/]+)\/git-(.+)/,function(req,res,next) {
    //console.log('post');
    //console.log(req);
  	var repo = req.params[0], service = req.params[1];
  	if (services.indexOf(service) < 0) {
      res.send('service not available',405);
      return;
    }

    res.header('content-type','application/x-git-' + service + '-advertisement');
    noCache(res);

    var ps = spawn('git-' + service, [
      '--stateless-rpc',repo]);
    ps.stdout.pipe(res);
    ps.on('exit', function (code) {
      if (service === 'receive-pack') {
        //self.emit('push', repo);
      }
    });
        
    req.pipe(ps.stdin);
    ps.stderr.pipe(process.stderr, { end : false });
  });

  
    
};

function serviceRespond (service, file, res) {
  function pack (s) {
    var n = (4 + s.length).toString(16);
    return Array(4 - n.length + 1).join('0') + n + s;
  }
  res.write(pack('# service=git-' + service + '\n'));
  res.write('0000');
  
  var ps = spawn('git-' + service, [
    '--stateless-rpc',
    '--advertise-refs',
    file
  ]);
  ps.stdout.pipe(res, { end : false });
  ps.stderr.pipe(res, { end : false });
  ps.on('exit', function () { res.end() });
}
