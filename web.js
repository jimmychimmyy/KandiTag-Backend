// web.js
var express = require("express");
var logfmt = require("logfmt");
var app = express();
var url = require('url');
var bodyParser = require('body-parser');

mongojs = require("mongojs")

var mongoDbUri = "mongodb://nodejitsu:2aea94baf80fb1195c2285ed9f2a976a@troup.mongohq.com:10083/nodejitsudb9860264258";
var collections = ["users", "tags", "kt_qrcode", "kt_ownership"]

app.use(logfmt.requestLogger());
app.use(bodyParser.json());

app.get('/', function(req, res) {
  res.send('Hello World!!');
});

app.post('/login', function(req, res) {
  var query = req.body;
  var facebookid = query.facebookid; // the user's facebook id
  var username = query.username; // the user's name
  console.log("/login, facebookid is " + facebookid + " :: username is " + username);
  var db = mongojs.connect(mongoDbUri , collections);
  res.setHeader('Content-Type', 'application/json');

  db.users.find({facebookid: facebookid, username: username}, function(err, records) {
    if (err) {
      console.log ("/login, user couldn't be found");
      res.end(JSON.stringify({success: false}), null, 3);
    } else {
      if (records.length == 0) {
        // they weren't found in the db, so add them
        db.users.save({facebookid: facebookid, username: username}, function(err, saved) {
          if( err || !saved ) {
            console.log("User not saved");
            res.end(JSON.stringify({success: false}), null, 3);
          } else {
            console.log("/login, New User saved");
            res.end(success: true, JSON.stringify({user_id: saved._id}), null, 3);
          }
        });
      } else {
        // there was a record of the user, just return their information (user_id)
        var user_id = records[0]._id;
        console.log("/login, existing user, returning their user id " + user_id);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({success: true, user_id: user_id}), null, 3);
      }
    }
  });

});

app.get('/kandi', function(req, res) {
  console.log ("GET:/kandi");
  var query = req.body;
  var qrcode_id = query.qrcode_id;
  var user_id = query.user_id;
  var create_at = query.create_at;
  var original_create_at = query.original_create_at;
  var db = mongojs.connect(mongoDbUri , collections);

  db.kt_qrcode.find({"userId": userId}, function(err, records) {
    if (err) {
      console.log(err);
      res.end();
    } else if (records.length > 0) {
      // todo ; send back kt_qrcode properties
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({user_id: user_id}), null, 3);
    }
  });

});

app.get('/ownership', function(req, res) {
  console.log ("GET:/ownership");
  var query = req.body;
  var qrcode_code = query.qrcode;
  var qrcode_id = query.qrcode_id;
  var user_id = query.user_id;
  var create_at = query.create_at;
  var original_create_at = query.original_create_at;
  var db = mongojs.connect(mongoDbUri , collections);

  db.kt_ownership.find({"qrcode_id": qrCodeId, "create_at": original_create_at}, function(err, records) {
    if (err) {
      console.log(err);
      res.end();
    } else {
      if (records.length > 0) {
        // todo ; send back kt_ownership properties
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({user_id: user_id}), null, 3);
      }
    }
  });

});

app.get('/ownership_count', function(req, res) {
  console.log ("GET:/ownership_count");
  var query = req.body;
  var qrcode_code = query.qrcode;
  var qrcode_id = query.qrcode_id;
  var user_id = query.user_id;
  var create_at = query.create_at;
  var original_create_at = query.original_create_at;
  var db = mongojs.connect(mongoDbUri , collections);

  db.kt_ownership.find({"qrcode_id": qrCodeId}, function(err, records) {
    if (err) {
      console.log(err);
      res.end();
    } else {
      if (records.length >= 5) {
        limitReached = true;
      } else {
        limitReached = false;
      }

      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({qrcode_limit_reached: limitReached}), null, 3);
    }
  });

});

app.get('/qr', function(req, res) {
  console.log ("GET:/qr");
  var query = req.body;
  var qrcode = query.qrcode;
  var user_id = query.user_id;
  var db = mongojs.connect(mongoDbUri , collections);

  res.setHeader('Content-Type', 'application/json');
  db.kt_qrcode.find({"qrcode": qrcode}, function(err, records) {
    if (err) {
      console.log(err);
      res.end(JSON.stringify({success: false, error: "qrcode wasn't saved. had error trying to find"}), null, 3);
    } else {
      if (records.length == 0) {
        // qr code doesn't exist in database yet
        db.kt_qrcode.save({qrcode: qrcode, user_id: user_id}, function(err, saved) {
          if( err || !saved ) {
            console.log("User not saved");
            res.end(JSON.stringify({success: false, error: "qrcode wasn't saved. had error saving"}), null, 3);
          } else {
            // qr code was saved into to kt_qrcode table
            // so it definitely doesn't exist in kt_ownership table
            // placement is from {0,1,2,3,4}, with 0 being the original owner of the qrcode
            db.kt_ownership.save({qrcode_id: saved._id, user_id: user_id, placement: 0}, function(err, saved) {
              console.log("qr code was saved into ownership table");
              res.end(JSON.stringify({success: true, qrcode: qrcode, user_id: user_id, placement: 0, ownership_id: saved._id}), null, 3);
            });
          }
        });

      } else {
        // qr code already exists in database, we just need to add to the kt_ownership table now
        var existingQrCode = records [0];
        db.kt_ownership.find({qrcode_id: existingQrCode._id}, function (err, records) {
          if (err) {
            res.end(JSON.stringify({error: "qrcode wasn't saved. had error trying to find in kt_ownership table"}), null, 3);
          } else {
            var dbCount = records.length;
            if (dbCount >= 5) {
              // there's already been 5 max qr references in the kt_ownership table
              res.end(JSON.stringify({success: false, limit_reached: true}), null, 3);
            } else {
              // there's room to add more to the qrcode table
              // example: if there's 1 qrcode in the ownership table, the length of db count is 1
              // while that qrcode will have a placement of 0, so the placement should always be the length of dbCount
              var placement = dbCount;
              db.kt_ownership.save({qrcode_id: existingQrCode._id, user_id: user_id, placement: placement}, function(err, saved) {
                console.log("qr code was saved into ownership table");
                res.end(JSON.stringify({success: true, qrcode: qrcode, user_id: user_id, placement: placement, ownership_id: saved._id}), null, 3);
              });
            }
          }
        });
      }
    }
  });
});

app.get('/test', function(req, res) {
  console.log('HEADERS: ' + JSON.stringify(res.headers));
  var query = req.query;
  console.log('--------------------------------------');
  var resultStr = 'START:\n' 
           + ' app_id= ' + query.app_id + ' \n'
           + ' app_token= ' + query.app_token + ' \n'
           + ' app_name= ' + query.app_name + ' \n'
           + ' app_store= ' + query.app_store + ' \n'
           + ' tracker= ' + query.tracker + ' \n'
           + ' tracker_name= ' + query.tracker_name + ' \n'
           + ' fb_campaign_name= ' + query.fb_campaign_name + ' \n'
           + ' fb_campaign_id= ' + query.fb_campaign_id + ' \n'
           + ' fb_adgroup_name= ' + query.fb_adgroup_name + ' \n'
           + ' fb_adgroup_id= ' + query.fb_adgroup_id + ' \n'
           + ' network_name= ' + query.network_name + ' \n'
           + ' campaign_name= ' + query.campaign_name + ' \n'
           + ' adgroup_name= ' + query.adgroup_name + ' \n'
           + ' creative_name= ' + query.creative_name + ' \n'
           + ' is_iad= ' + query.is_iad + ' \n'
           + ' adid= ' + query.adid + ' \n'
           + ' idfa= ' + query.idfa + ' \n'
           + ' android_id= ' + query.android_id + ' \n'
           + ' mac_sha1= ' + query.mac_sha1 + ' \n'
           + ' mac_md5= ' + query.mac_md5 + ' \n'
           + ' idfa||android_id= ' + query.idfa_or_android_id + ' \n'
           + ' idfa_md5= ' + query.idfa_md5 + ' \n'
           + ' idfa_md5_hex= ' + query.idfa_md5_hex + ' \n'
           + ' idfa_upper= ' + query.idfa_upper + ' \n'
           + ' idfv= ' + query.idfv + ' \n'
           + ' gps_adid= ' + query.gps_adid + ' \n'
           + ' reftag= ' + query.reftag + ' \n'
           + ' ip_address= ' + query.ip_address + ' \n'
           + ' created_at= ' + query.created_at + ' \n'
           + ' click_time= ' + query.click_time + ' \n'
           + ' installed_at= ' + query.installed_at + ' \n'
           + ' country= ' + query.country + ' \n'
           + ' device_name= ' + query.device_name + ' \n'
           + ' os_name= ' + query.os_name + ' \n'
           + ' os_version= ' + query.os_version + ' \n'
           + ' session_count= ' + query.session_count + ' \n'
           + ' event= ' + query.event + ' \n'
           + ' revenue= ' + query.revenue + ' \n'
           + ' friend_code= ' + query.friend_code + ' \n'
           + ' END\n------------------------------------------------';

  res.send(resultStr);
  console.log(resultStr)
})


app.get('/db', function(req, res) {
  //res.writeHead(200, {"Content-Type": "text/html"});
  //res.send("db");

  var collections = ["users", "tags"]
  var db = mongojs.connect(mongoDbUri, collections);

  db.users.find({sex: "female"}, function(err, users) {
    if( err || !users) console.log("No female users found");
    else users.forEach( function(femaleUser) {
      console.log(femaleUser);
    });
  });

  db.users.save({email: "srirangan@gmail.com", password: "iLoveMongo", sex: "male"}, function(err, saved) {
    if( err || !saved ) console.log("User not saved");
    else console.log("User saved");
  });

  db.users.update({email: "srirangan@gmail.com"}, {$set: {password: "iReallyLoveMongo"}}, function(err, updated) {
    if( err || !updated ) console.log("User not updated");
    else console.log("User updated");
    res.send("UPDATED");
    res.end();
  });

});

var port = Number(80);
app.listen(port, function() {
  console.log("Listening on " + port);
});



// tag table

// list of all your current tags  where you were not the original owner
// show the previous owner

// show all previous owners

// kandi table
// list of all your original tags
// show who currently own it
// in detail controller 
// show a list of all previous owners

// -> add friend + send message page
// - add friend on facebook
// need add friend 
