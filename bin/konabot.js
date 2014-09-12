#! /usr/bin/env node

var konabot     = require('commander'),
    http        = require('http'),
    cheerio     = require('cheerio'),
    mysql       = require('mysql'),
    twilio      = require('twilio'),
    bunyan      = require('bunyan'),
    packageInfo = require('../package.json');

var TWILIO_ACCOUNT_SID = process.env.KONABOT_TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN  = process.env.KONABOT_TWILIO_AUTH_TOKEN,
    NOTIFICATIONS_FROM = process.env.KONABOT_NOTIFICATIONS_FROM,
    NOTIFICATIONS_TO   = process.env.KONABOT_NOTIFICATIONS_TO,
    DB_HOST            = process.env.KONABOT_DB_HOST || "localhost",
    DB_NAME            = process.env.KONABOT_DB_NAME || "konabot",
    DB_USER            = process.env.KONABOT_DB_USER || "konabot",
    DB_PASSWORD        = process.env.KONABOT_DB_PASSWORD || "konabot";

var MAX_RENT  = 1100;
var httpOptions = {
  hostname: 'honolulu.craigslist.org',
  port: 80,
  method: 'GET',
  path: '/search/big/apa?maxAsk=' + MAX_RENT + '&pets_dog=wooof&sale_date=-',
  headers: {
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.120 Safari/537.36"
  }
};

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !NOTIFICATIONS_FROM || !NOTIFICATIONS_TO || !DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
  console.error("Missing environment variable");
  process.exit(1);
}

// init services
twilio = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
var db = mysql.createConnection({
  host: DB_HOST,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD
});
var log = bunyan.createLogger({name: packageInfo.name});

// common functions
var numbers = function (val) {
  return val.split(',');
};

var sendNotification = function (message) {
  konabot.numbers.forEach(function (number, index) {
    if (number.match(/^\+1\d{10}$/)) {
      twilio.messages.create({
        to: number,
        from: NOTIFICATIONS_FROM,
        body: message
      }, function (error, message) {
        if (error) {
          log.error(error);
        }
      });
    }
  });
};

var rememberListings = function (listings) {
  listings.forEach(function (listing, index) {
    db.query('select count(*) from listings where id = ?', [listing.id], function (error, results) {
      var count = parseInt(results[0]['count(*)']);

      if (count == 0) {
        listing.posted_on = listing.postedOn;
        delete listing.postedOn;

        db.query('insert into listings SET ?', listing, function (error, result) {
            if (error) {
              console.error(error);
            } else {
              var message = "I found";

              if (listing.bedrooms) {
                message += " a ";
                if (listing.size) {
                  message += listing.size + " ";
                }
                message += listing.bedrooms + "br apartment";
              } else {
                message += " an apartment";
              }

              if (listing.location) {
                message += " in " + listing.location;
              }

              if (listing.price) {
                message += " for $" + listing.price;
              }

              message += ": " + listing.url;

              log.info(message);
              sendNotification(message);
            }
          }
        );
      }
    });
  });
}

var parseListings = function(responseBody, callback) {
  $ = cheerio.load(responseBody);
  var listings = [];

  var content = $('div.content');
  content.find('p.row').each(function (index, element) {
    var listing = {
      id: parseInt($(element).attr('data-pid')),
      title: $(element).find('a[data-id="' + $(element).attr('data-pid') + '"]').first().text(),
      url: "http://honolulu.craigslist.org" + $(element).find('a').first().attr('href'),
      price: parseInt($(element).find('span.price').text().replace(/\D/, ''))
    };

    if (isNaN(listing.price)) {
      delete listing.price;
    }

    var regex = /(\S+)br\D*(\d+\S+)?.*\((.*)\)/i;
    var results = $(element).find('span.l2').text().match(regex);

    if (results) {
      listing['bedrooms'] = parseInt(results[1]);
      if (results[2]) {
        listing.size = results[2];
      }
      listing['location'] = results[3].trim();
    }

    var postedOn = new Date(Date.parse($(element).find('span.date').text() + " " + new Date().getFullYear()));
    var yyyy = postedOn.getFullYear().toString();
    var mm = (postedOn.getMonth()+1).toString();
    var dd  = postedOn.getDate().toString();
    listing.postedOn = yyyy + "-" + (mm[1]?mm:"0"+mm[0]) + "-" + (dd[1]?dd:"0"+dd[0]);
    
    listings.push(listing);
  });

  log.info("Found " + listings.length + " listings");
  callback(listings);
};

var scanListings = function () {
  log.info("Searching craigslist for dog-friendly apartments in Kona");
  var request = http.request(httpOptions, function(response) {
    var responseBody = "";
    
    response.on('data', function(chunk) {
      responseBody += chunk;
    });
  
    response.on('end', function() {
      parseListings(responseBody, rememberListings);
    });
  });

  request.end();

  var min           = 10, // minutes
      max           = 30, //minutes
      minutesToWait = Math.floor(Math.random() * (max - min)) + min;

  log.info("Will check again in " + minutesToWait + " minutes");
  setTimeout(arguments.callee, minutesToWait * 60 * 1000);
};

// parse and go
konabot
  .version(packageInfo.version)
  .option('-n, --numbers <list>', 'a list of phone numbers that should receive SMS notifications, e.g. +18005551234,+18005554321', numbers, numbers(NOTIFICATIONS_TO))
  .parse(process.argv);

log.info("KonaBot lives!");
scanListings();

