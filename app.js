var express = require('express');

var app = express.createServer();

app.configure(function(){
  app.use(express.methodOverride());
  app.use(express.bodyParser());
  app.use(app.router);
});

var git_handle = require('../index');

git_handle(app);

app.listen(3001);
