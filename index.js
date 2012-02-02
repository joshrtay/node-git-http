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
  var ps = spawn('git', [ 'init', '--bare', repo]);
  
  var err = '';
  ps.stderr.on('data', function (buf) { err += buf });
  
  ps.on('exit', function (code) {
    if (!cb) {}
    else if (code) cb(err || true)
    else cb(null)
  });
};

function authAll(repo,user,pass,cb) {
  cb(null);
}

var RES  = {}

RES.noCache = function(res,service) {
  res.header('content-type','application/x-git-' + service + '-advertisement');
  res.header('expires', 'Fri, 01 Jan 1980 00:00:00 GMT');
  res.header('pragma', 'no-cache');
  res.header('cache-control', 'no-cache, max-age=0, must-revalidate');
}

RES.notAllowed = function(res) {
  res.send('Not allowed',405)
}

RES.notFound = function(res) {
  res.send('Not found',404)
}

RES.notAuthorized = function(res) {
  res.send('auth error',403)
}

RES.authRequired = function(res) {
  res.header('WWW-Authenticate','Basic realm=Login');
  res.send('Authorization required',401);
}

RES.paramRequired = function(res) {
  res.end('service parameter required',400)
}


var services = [ 'upload-pack', 'receive-pack' ];

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

module.exports = function (app,options) {
  var create = options.create == undefined
      ? create
      : options.create
    , auth = options.auth || authAll;

  function repo_exists(res,repo,next) {
  	exists(repo,function(exists) {
      if (!exists && create) create(repo, next);
      else if (!exists) RES.notFound(res);
      else next();
    });
  }

  function authorized (req,res,next) {
    if (req.headers['authorization']) {
      var ups = new Buffer(req.headers['authorization'].split(' ')[1],'base64')
                  .toString()
                  .split(':');
      auth(req.params.rep,ups[0],ups[1], function(err) {
        if (!err) next()
        else RES.notAuthorized(res);
      });
      
    } else {
      RES.authRequired(res);
    }
  }

  app.get('/:repo/info/refs',authorized,function(req,res,next) {
    var repo = req.params.repo;

    if (!req.query.service) return RES.paramRequired(res);

    var service = req.query.service.replace(/^git-/, '');
    if (services.indexOf(service) < 0)  return RES.notAllowed(res);

    var next = function() {
      noCache(res,service);
      serviceRespond(service,repo,res);
    };

    repo_exists(res,repo,next)
    
  });

  app.get('/:repo/HEAD', authorized,function(req,res,next) {
  	var repo = req.params.repo;
  	var next = function() {
  		var file = path.join(repo,'.git','HEAD');
  		path.exists(file,function(ex) {
  			if (ex) fs.createReadStream(file),pipe(res);
  			else RES.notFound(res);
  		});
  	};

  	repo_exists(res,repo,next);
  });
    
   
  app.post(/\/([^\/]+)\/git-(.+)/,authorized,function(req,res,next) {
  	var repo = req.params[0], service = req.params[1];
  	if (services.indexOf(service) < 0) return RES.notAllowed(res);

    RES.noCache(res,service);

    var ps = spawn('git-' + service, [
      '--stateless-rpc',repo]);
    ps.stdout.pipe(res);

    /*ps.on('exit', function (code) {
      if (service === 'receive-pack') {
        self.emit('push', repo);
      }
    });*/
        
    req.pipe(ps.stdin);
    ps.stderr.pipe(process.stderr, { end : false });
  });

  
    
};


