// web.js
var express = require("express");
var path = require('path');
var app = express();
var http = require('http').Server(app);

var logfmt = require("logfmt");
var url = require('url');
var bodyParser = require('body-parser');
var fs = require('fs');
var multipart = require('multiparty');


//app.set('port', process.env.PORT || 3000);
//app.set('port', process.env.PORT || 8080);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false })); // this tells express to parse the incoming data; if its JSON then create a JSON object with it
app.use(logfmt.requestLogger());

//base64 encoder/decoder
var base64 = require('base-64'); // may not need this if window.atob() works

var apn = require('apn');
var gcm = require('node-gcm'); // these are for push notifications

var mongojs = require("mongojs");
var mongoDbUri = "mongodb://nodejitsu:7099899734d1037edc30bc5b2a90ca84@troup.mongohq.com:10043/nodejitsudb1189483832";
var collections = ["kt_users", "kt_qrcode", "kt_ownership", "kt_message", "kt_group_message","kt_token", "kt_images", "kt_gifs", "kt_videos", "kt_profile_images", "kt_kanditags"];
//var CollectionDriver = require('./collectionDriver').CollectionDriver;
var gridjs = require('gridjs');
var port = Number(3000);

var Grid = require('gridfs-stream');

var db = mongojs.connect(mongoDbUri, collections);

var io = require('socket.io').listen(http);

var gm = require('gm');

var im = require('imagemagick');

var gfs = Grid(db, mongojs);
var gs = gridjs(db);

app.use(express.static(path.join(__dirname, 'public')));


/**

app.get('/', function(req, res) {
  //res.send('<h1>Hello World</h1>');
  res.sendFile(__dirname + '/index.html');
});

**/

var clients = {};
var uploaders = {};
io.on('connection', function (socket) {

  socket.on('sign_in', function (kt_id) {
    clients[kt_id] = socket;
    socket.id = kt_id;
    console.log(kt_id,  " has connected");
    clients[kt_id].emit('sign_in', "you are connected");
  });

  socket.on('disconnect', function () {
    console.log( socket.id + " has has disconnected");
    delete clients[socket.id];
    delete uploaders[socket.id];
  });

  socket.on('upload_image', function (kt_id, img, filename) {

    if (!uploaders[kt_id]) {
      uploaders[kt_id] = socket;
      socket.id = kt_id;
      console.log(kt_id, " is attempting to upload_image");
    }

    //console.log(img);
    var db = mongojs.connect(mongoDbUri, collections);
    var gs = gridjs(db);

    gs.write(filename, new Buffer(img), function(err) {

      if (err) {
        console.log("error writing image");
        return;
      }

      db.collection('fs.files').find({"filename": filename}, function (err, records) {

              if (err) {
                console.log("error finding image in db");
                //socket.disconnect();
                return;
              }

              var record_id = records[0]._id;
              console.log(record_id);

              // got emmmm
              db.collection('fs.files').update({_id: mongojs.ObjectId(record_id)}, {$set: {'metadata': {"kt_id" : kt_id}}}, function (error) {

                if (error) {
                  console.log("error updating image metadata");
                  return;
                }

                console.log("successfully added metadata");

              });

              console.log("found image in db with metadata");
              (uploaders[kt_id]).emit('upload_image', "saved into the db as " + record_id);
              //socket.disconnect();

            });
      
    });

  //socket.disconnect();

  });

});

app.get('/', function (req, res) {
  res.send('<html><body><h1>Hello World</h1></body></html>');
});

// set up routes
app.get('/kt_users', function (req, res) {

  db.kt_users.find({}, function (err, records) {

    if (err) {
      console.log("no users found");
      return;
    }

    var results = [];

    for (var i = 0; i < records.length; i++) {

      results.push({
        kt_id: records[i]._id,  // this returns the user's kt_id and name, and later on the nickname
        name: records[i].username
      });

    }

    //res.json(records);
    res.json(results); // this will display the results

  });

});

app.get('/kt_users/:id', function (req, res) {
  var kt_id = req.params.id;
  db.kt_users.find({_id: mongojs.ObjectId(kt_id)}, function (err, user) {
    if (err) {
      console.log(err);
      return;
    }
    res.json(user);
  });
});

app.get('/friends', function (req, res) {
  var query = req.body;
  var kt_id = query.kt_id;

  console.log(kt_id + " is getting friends");

  var db = mongojs.connect(mongoDbUri, collections);

  // query db for users who is friends with given kt_id

  // TODO this should be called by a service to download kt_ids and info of friends (should only be used by returning user)

});


app.get('/kt_media', function (req, res) {

  console.log("get kt_media called");

  // only returns media files, does not show profile images

  db.collection('fs.files').find({"metadata.kt_id":{$exists: true}}, function (err, records) {

    if (err) {
      console.log(err);
      return;
    }

    var _ids = []; // what is the difference between [] and {} ?
    var results = [];

    // this will create the array in chronological order, with latest first
    // TODO provide a limit to how many items are given in the response, when the user scrolls further down and needs older items, then rerun query but start
    // the query at the last provided item

    for (var i = records.length - 1; i >= 0; i--) {
      //_ids.push(records[i]._id); 

      results.push({
        _id: records[i]._id,
        kt_id: records[i].metadata.kt_id // will need to add caption later
      });

      /**

      res.write(JSON.stringify({
        _id: records[i]._id,
        kt_id: records[i].metadata.kt_id  // this should continously write out each item and when the loop is finished then res.end will be called
      }));  **/

      // this method sends an entire list of entries all at once
      // need to find a way to send individual json items

    }

    //res.json(files);
    //res.json(_ids);  // this returns list of _ids
    res.json(results); // this should return a list of key value pairs

    //res.end(); // this is called if res.write is called

    //res.json(records);

  });

});

// todo will need a get method to get file ids for media items

app.get('/kt_media/:id', function (req, res) {

  var media_id = req.params.id;

  var db = mongojs.connect(mongoDbUri, collections);
  var gs = gridjs(db);

  // TODO need to make sure that the image is not a profile image

  db.collection('fs.files').find({_id: mongojs.ObjectId(media_id), "metadata.kt_id": {$exists: true}}, function (err, file) {
    if (err) {
      console.log(err);
      return;
    }

    var filename = file[0].filename;
    console.log("getting image: ", filename);
    //console.log(__dirname + filename);

    //var img = gs.createReadStream(filename).pipe(process.stdout); // uncomment is gs.read does not work
    //res.writeHead('200', {'Content-Type': 'image/png', 'Content-Length': img.length });
    //res.end(img, 'binary'); 


    gs.read(filename, function (err, buffer) {
      //console.log('file is read', buffer);

      console.log("rendering image: ", filename);

      im.resize({
        srcData: buffer,
        width: 500, // TODO this number will be determined by the screen size of the requesting device
        quality: 1
      }, function (err, stdout, stderr) {
        if (err) {
          console.log("error: ", err);
          return;
        }

        res.writeHead('200', {'Content-Type': 'image/png', 'Content-Length': stdout.length });
        res.end(stdout, 'binary');

      });

    }); 

  });
  
});

// TODO get profile image method is not working

app.get('/profile_image/:id', function (req, res) {

  var kt_id = req.params.id;

  var db = mongojs.connect(mongoDbUri, collections);
  var gs = gridjs(db);

  db.collection('fs.files').find({"filename": kt_id, "metadata.profile_image": kt_id}, function (err, records) {

    if (err) {
      console.log("error finding profile image for ", kt_id);
      //res.send('<html><body><h1>No Profile Image Found</h1></body></html>');
      return;
    }

    gs.read(kt_id, function (err, buffer) {

      console.log("rendering profile image for ", kt_id);

      im.resize({
        srcData: buffer,
        width: 250,
        quality: 1
      }, function (err, stdout, stderr) {
        if (err) {
          console.log("error: ", err);
          return;
        }

        res.writeHead('200', {'Content-Type': 'image/png', 'Content-Length': stdout.length });
        res.end(stdout, 'binary');

      });

    });

  });

});

app.get('/archived_messages', function (req, res) {
  var query = req.body;
  var kt_id = query.kt_id;

  var db = mongojs.connect(mongoDbUri, collections);

  console.log(kt_id, " is attempting to download archived messages");
  res.setHeader('Content-Type', 'application/json');

  db.kt_message.find({$or: [{to_id: kt_id}, {from_id: kt_id}]}, function (err, records) {

    if (err) {
      console.log("error finding entries in db: ", err);
      return;
    }



    // TODO the entries are here, now parse them and send them back individually
    // on the client side a service should be used to request this method

  });

}); 


app.post('/login', function (req, res) {
  var query = req.body;
  var fb_id = query.fb_id;
  var username = query.username;

  console.log("attemping to login: " + fb_id + ", " + username);
  var db = mongojs.connect(mongoDbUri , collections);
  res.setHeader('Content-Type', 'application/json');

  db.kt_users.find({fb_id: fb_id, username: username}, function (err, records) {

    if (err) {
      console.log(err);
      res.end(JSON.stringify({success: false}), null, 3);
      console.log("error in find");
      return;
    }

    if (records.length == 0) {
      console.log("no records found");
      db.kt_users.save({fb_id: fb_id, username: username}, function (err, saved) {
        if (err||!saved) {
          console.log(err);
          return;
        }

        db.kt_users.find({fb_id: fb_id, username: username}, function (err, records) {
          if (err) {
            console.log(err);
            return;
          }

          var kt_id = records[0]._id;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({success: true, kt_id: kt_id, fb_id: fb_id, username: username}), null, 3);
        })

      });
    }

    var kt_id = records[0]._id;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({success: true, kt_id: kt_id, fb_id: fb_id, username: username}), null, 3);

  });
});

app.post('/save_device_token_android', function (req, res) {
  var query = req.body;
  var kt_id = query.kt_id;
  var fb_id = query.fb_id;
  var username = query.username;
  var token = query.token;
  res.setHeader('Content-Type', 'application/json');

  db.kt_users.find({_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username}, function (err, records) {
    if (err) {
      console.log(err);
      res.end(JSON.stringify({success: false}), null, 3);
      return;
    }

    if (records.length == 0) {
      console.log("error, user does not exist");
      res.end(JSON.stringify({success: false}), null, 3);
      return;
    }

    db.kt_users.update({_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username}, {_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username, gcm_id: token}, function (err, saved) {
      if (err) {
        console.log(err);
        res.end(JSON.stringify({success: false}), null, 3);
        return;
      }

      res.end(JSON.stringify({success: true}), null, 3);
    })
  });
});

app.post('/save_device_token_ios', function (req, res) {
  var query = req.body;
  var kt_id = query.kt_id;
  var fb_id = query.fb_id;
  var username = query.username;
  var token = query.token;
  res.setHeader('Content-Type', 'application/json');

  db.kt_users.find({_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username}, function (err, records) {
    if (err) {
      console.log(err);
      res.end(JSON.stringify({success: false}), null, 3);
      return;
    }

    if (records.length == 0) {
      console.log("error, user does not exist");
      res.end(JSON.stringify({success: false}), null, 3);
      return;
    }

    db.kt_users.update({_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username}, {_id: mongojs.ObjectId(kt_id), fb_id: fb_id, username: username, apn_id: token}, function (err, saved) {
      if (err) {
        console.log(err);
        res.end(JSON.stringify({success: false}), null, 3);
        return;
      }

      res.end(JSON.stringify({success: true}), null, 3);
    })
  });
});

app.post('/upload_image', function (req, res) {

  console.log("upload image has been called");

  var db = mongojs.connect(mongoDbUri, collections);
  var gs = gridjs(db);

  var form = new multipart.Form();

  var kt_id;
  var filepath;
  var filename;

  form.parse(req, function (err, fields, files) {

    console.log("parsing uploaded file");
    //console.log(files);

    if (err) {
        res.end("invalid request " + err.message, 400);
        return;
    }

    Object.keys(fields).forEach(function(name) {
        //console.log('Got field named ' + name);
        console.log('The value of the field is ' + fields[name]);

        if (name == 'kt_id') {
          kt_id = fields[name];
          console.log("uploader's kt_id: ", kt_id);
        }

    });

    Object.keys(files).forEach(function (name) {
        //console.log('Got file named ' + name);
        console.log('The file name is ' + files[name][0].originalFilename);
        console.log('The file path is ' + files[name][0].path);

        filename = files[name][0].originalFilename + ".png";
        filepath = files[name][0].path;

        var write = gs.createWriteStream(filename, { 
          metadata: { 'kt_id' : kt_id}
        });

        write.on('error', function (err) {
          console.log("error in write");
        });

        write.on('close', function() {
          console.log("write on close");
        });

        fs.createReadStream(filepath).pipe(write);

        res.send("success");

    });

    var db = mongojs.connect(mongoDbUri, collections);

    db.collection('fs.files').find({'filename': filename}, function (err, records) {

          if (err) {
            console.log("error finding entry in db");
            return;
          }

          console.log("found entry in db");

        });

  });

  form.on('close', function() {

    console.log("upload complete");

    if (filename != null) {
      console.log("on close filename: ", filename);
    }

  });

  console.log("is everything finished?");

  console.log("this should be called at the very end of the upload");

});


app.post('/upload_profile_image', function (req, res) {

  var db = mongojs.connect(mongoDbUri, collections);
  var gs = gridjs(db);

  var form = new multipart.Form();

  var kt_id;
  var filepath;
  var filename;

  var data = '';

  form.parse(req, function (err, fields, files) {

    console.log(files);

    if (err) {
        res.end("invalid request " + err.message, 400);
        return;
    }

    Object.keys(fields).forEach(function(name) {
        console.log('Got field named ' + name);
        console.log('The value of the field is ' + fields[name]);

        if (name == 'kt_id') {
          kt_id = fields[name];
        }

    });

    Object.keys(files).forEach(function (name) {
        console.log('Got file named ' + name);
        console.log('The file name is ' + files[name][0].originalFilename);
        console.log('The file path is ' + files[name][0].path);

        filename = files[name][0].originalFilename + ".png";
        filepath = files[name][0].path;

        var read = fs.createReadStream(filepath);

        read.pipe(gs.createWriteStream(filename)); // works

        read.on('data', function (data) {
          data += data;
        });

        read.on('end', function() {
          console.log(data);
          console.log("finished writing");
        });

    });

  });

});


app.post('/addmeta', function (req, res) {
  var body = query.body;
  var kt_id = query.kt_id;
  var filename = query.filename + '.png';
  var metadata = query.metadata;

  var db = mongojs.connect(mongoDbUri, collections);

  db.collection('fs.files').find({"filename": filename}, function (err, records) {
              if (err) {
                console.log(err);
                return;
              }

              var found_id = records[0]._id;
              console.log(found_id);

              // TODO will need to add the metadata (tags and tagged users to the metadata)
              db.collection('fs.files').update({_id: mongojs.ObjectId(found_id)}, {$set: {'metadata': {"kt_id" : kt_id}}}, function (error) {
                if (error) {
                  console.log(error);
                  return;
                }

                console.log("successfully added metadata");
              });

              res.end("success");

            });

});

//var server = app.listen(port);
http.listen(8080);

/**
app.listen(port, function() {
  console.log("Listening on " + port);
}); **/
//app.listen(3000);


