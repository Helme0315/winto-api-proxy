require('dotenv').config();

var fs = require('fs');
var path = require('path');

const routes = require('./server/routes');

var compression = require('compression');
var cookieParser = require('cookie-parser');

var _ = require('lodash');
var server;
var express = require('express');
const bodyParser = require('body-parser');

var app = express();

const cors = require('cors');
// Accept specific domains only
const allowlist = ['https://winto.io/', 'https://www.winto.io/'];
const corsOptionsDelegate = (req, callback) => {
  let corsOptions;
  let isDomainAllowed = allowlist.indexOf(req.header('Origin')) !== -1;
  if (isDomainAllowed) {
    corsOptions = { origin: true };
  } else {
    corsOptions = { origin: false };
  }
  callback(null, corsOptions);
};
// app.use(cors(corsOptionsDelegate));
app.use(cookieParser());
app.use(bodyParser.json({ limit: '900mb' }));
app.use(bodyParser.urlencoded({ limit: '900mb', extended: true }));
app.use(compression());

app.disable('x-powered-by');
app.set('trust proxy', true);
// app.enable('trust proxy');
app.disable('etag');

// Use sessions for tracking logins

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'X-Requested-With, X-HTTP-Method-Override, Authorization, Content-Length, Content-Type, Accept'
  );
  if ('OPTIONS' === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});

if (process.env.NODE_ENV === 'production') {
  try {
    // Load certificate for SSL
    // Generate can http://www.cert-depot.com/
    var prvKeyPath1 = path.join(__dirname, process.env.NODE_PRIVATE_KEY);
    var certKeyPath1 = path.join(__dirname, process.env.NODE_PUBLIC_KEY);
    var caKeyPath = path.join(__dirname, process.env.NODE_HTTPS_CA);
    var prvKeyPath2 = path.join(__dirname, process.env.NODE_HTTPS_KEY);
    var certKeyPath2 = path.join(__dirname, process.env.NODE_HTTPS_CERT);

    var privateKey = fs.readFileSync(prvKeyPath1, 'utf-8');
    var certificate = fs.readFileSync(certKeyPath1, 'utf-8');

    var cakey = fs.readFileSync(caKeyPath, 'utf-8');
    var credentials = {
      key: privateKey,
      cert: certificate,
      ca: cakey,
      secureProtocol: 'SSLv23_method'
      // secureOptions: constants.SSL_OP_NO_SSLv3 | constants.SSL_OP_NO_SSLv2
    };

    app.key = fs.readFileSync(prvKeyPath2);
    app.cert = fs.readFileSync(certKeyPath2);
    app.ca = fs.readFileSync(caKeyPath);

    app.secureProtocol = 'SSLv23_method';
    // app.secureOptions = constants.SSL_OP_NO_SSLv3 | constants.SSL_OP_NO_SSLv2;
    console.log('process.env.NODE_PORT :>> ', process.env.NODE_PORT);
    server = require('https')
      .createServer(credentials, app)
      .listen(process.env.NODE_PORT, function () {
        console.log('Express server listening on port ' + process.env.NODE_PORT + 'on HTTPS!');
      });
  } catch (ex) {
    console.log(ex.message);
  }
} else {
  server = require('http')
    .createServer(app)
    .listen(process.env.NODE_PORT, function () {
      console.log('Listening on port ', process.env.NODE_PORT, ' with http');
    });
}

app.use('/', routes);

// React DIST output folder
console.log(process.env.NODE_ENV);
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../backoffice_client/build')));
  app.use('*', express.static(path.join(__dirname, '../backoffice_client/build')));
}

app.get('*', function (req, res) {
  // res.status(404);
  return res.sendStatus(404);
});

/** Error Middleware
 *
 * How to handle the errors:
 * If the error is a string: Send it to the client.
 * If the error is an actual: error print it to the server log.
 *
 * We do not use next() to avoid sending error logs to the client
 * so this should be the last middleware in express .
 */
function errorHandler(err, req, res, next) {
  if (err) {
    if (typeof err === 'string') {
      return res.send('error', { error: err });
    } else {
      if (err.stack) {
        console.error('[INTERNAL_ERROR] ', err.stack);
      } else console.error('[INTERNAL_ERROR', err);

      res.send('error');
    }
  } else {
    console.warning("A 'next()' call was made without arguments, if this an error or a msg to the client?");
  }
}

app.use(errorHandler);

/** Log uncaught exceptions and kill the application **/
process.on('uncaughtException', function (err) {
  console.error(new Date().toUTCString() + ' uncaughtException:', err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at: %s - message: %s', reason.stack, reason.message);
});

