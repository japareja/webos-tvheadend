const http = require('http');
const https = require('https');
const urlUtil = require('url');
const crypto = require('crypto');

exports.proxy = proxy;

// reuse connections to tvheadend instead of opening a new one for every api call
var httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });
var httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

// last authentication challenge per server and user, used to authenticate preemptively
// so we don't need an extra 401 round trip for every request
var authChallenges = {};

var REQUEST_TIMEOUT = 5000;

function proxy(message) {
    /** local node js mock setup
    function MockMessage() { };
    MockMessage.prototype.respond = function (object) {
        console.log("MockMessage: ", object);
    }
    var message = new MockMessage();
    message.payload = {};
    message.payload.url = "http://userver.fritz.box:9981/api/serverinfo";
    message.payload.user = "webos";
    message.payload.password = "webos3583";
     */
    var url = message.payload.url,
        user = message.payload.user,
        password = message.payload.password;

    var parsedURL = urlUtil.parse(url);
    var options = {
        protocol: parsedURL.protocol,
        host: parsedURL.hostname,
        port: parsedURL.port,
        path: parsedURL.path,
        method: message.payload.method || 'GET',
        agent: parsedURL.protocol === 'https:' ? httpsAgent : httpAgent,
        headers: {}
    };

    var state = {
        authKey: parsedURL.protocol + '//' + parsedURL.host + '|' + user,
        challenged: false,
        connectionRetried: false,
        responded: false
    };

    // authenticate preemptively with the last known challenge
    var challenge = user ? authChallenges[state.authKey] : undefined;
    if (challenge) {
        options.headers.Authorization = createAuthorizationHeader(options, user, password, challenge);
    }

    request(options, user, password, message, state);
}

/**
 * make sure every message is only answered once
 */
function respond(message, state, response) {
    if (state.responded) {
        return;
    }
    state.responded = true;
    message.respond(response);
}

/**
 * create hash to hex string
 *
 * @param {string} s
 */
function hex_hash(algorithm, s) {
    return crypto.createHash(algorithm).update(s).digest('hex');
}

function genNonce(b) {
    var c = [],
        e = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
        a = e.length;
    for (var d = 0; d < b; ++d) {
        c.push(e[(Math.random() * a) | 0]);
    }
    return c.join('');
}
// Parse the parameters (check existence and validity) and extract the values.
// Note that quoted-string values can be folded, so you need to unfold them with this function
function unq(quotedString) {
    if (!String.prototype.startsWith) {
        String.prototype.startsWith = function (searchString, position) {
            position = position || 0;
            return this.indexOf(searchString, position) === position;
        };
    }

    if (quotedString.startsWith("'") || quotedString.startsWith('"')) {
        return quotedString.substr(1, quotedString.length - 2).replace(/(?:(?:\r\n)?[ \t])+/g, ' ');
    } else {
        // actually unquoted
        return quotedString.replace(/(?:(?:\r\n)?[ \t])+/g, ' ');
    }
}

/**
 * send request
 *
 * @param {http.RequestOptions} options
 * @param {WebOSTV.OnCompleteResponse} message
 */
function request(options, user, password, message, state) {
    var protocolHandler = options.protocol === 'https:' ? https : http;
    var timedOut = false;
    var req = protocolHandler
        .request(options, function (resp) {
            var data = '';
            // handle http status unauthorized only if did not already answer a fresh challenge
            if (resp.statusCode === 401 && !state.challenged) {
                // drain the response, so the connection can be reused
                resp.resume();
                delete authChallenges[state.authKey];
                var authHeader = resp.headers['www-authenticate'];
                handleAuthentication(options, user, password, authHeader, message, state);
            } else if (resp.statusCode < 200 || resp.statusCode > 299) {
                resp.resume();
                // return error in case of unexpected status code
                respond(message, state, {
                    returnValue: false,
                    errorText: 'Server answered with StatusCode ' + resp.statusCode,
                    errorCode: 1,
                    statusCode: resp.statusCode
                });
                //console.log(resp.statusCode, resp);
            } else {
                // decode as utf8 stream, so multibyte characters split between chunks stay intact
                resp.setEncoding('utf8');
                // A chunk of data has been recieved.
                resp.on('data', function (chunk) {
                    data += chunk;
                });
                // The whole response has been received. Print out the result.
                resp.on('end', function () {
                    respond(message, state, {
                        returnValue: true,
                        result: data,
                        statusCode: resp.statusCode
                    });
                });
                resp.on('aborted', function () {
                    respond(message, state, {
                        returnValue: false,
                        errorText: 'Connection closed before the response was complete',
                        errorCode: 1
                    });
                });
            }
        })
        .on('error', function (err) {
            // a kept alive connection might have been closed by the server in the meantime -> retry once
            if (!timedOut && !state.connectionRetried && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
                state.connectionRetried = true;
                request(options, user, password, message, state);
                return;
            }
            console.log('error:', err.message);
            respond(message, state, {
                returnValue: false,
                errorText: timedOut ? 'Request timed out' : err.message,
                errorCode: 1
            });
        });
    req.setTimeout(REQUEST_TIMEOUT, function () {
        timedOut = true;
        req.abort();
    });
    req.end();
}

function handleAuthentication(options, user, password, authHeader, message, state) {
    if (!authHeader) {
        respond(message, state, {
            returnValue: false,
            errorText: 'Server answered with StatusCode 401',
            errorCode: 1,
            statusCode: 401
        });
        return;
    }

    var challenge = parseChallenge(authHeader);
    if (challenge.type !== 'Digest' && challenge.type !== 'Basic') {
        respond(message, state, {
            returnValue: false,
            errorText: 'Unsupported authentication type ' + challenge.type,
            errorCode: 1
        });
        return;
    }
    authChallenges[state.authKey] = challenge;
    options.headers = options.headers || {};
    options.headers.Authorization = createAuthorizationHeader(options, user, password, challenge);

    // request again with authorization header
    state.challenged = true;
    request(options, user, password, message, state);
}

/**
 * parse the www-authenticate header
 */
function parseChallenge(authHeader) {
    var ws = '(?:(?:\\r\\n)?[ \\t])+',
        token = '(?:[\\x21\\x23-\\x27\\x2A\\x2B\\x2D\\x2E\\x30-\\x39\\x3F\\x41-\\x5A\\x5E-\\x7A\\x7C\\x7E]+)',
        quotedString = '"(?:[\\x00-\\x0B\\x0D-\\x21\\x23-\\x5B\\\\x5D-\\x7F]|' + ws + '|\\\\[\\x00-\\x7F])*"',
        tokenizer = RegExp(token + '(?:=(?:' + quotedString + '|' + token + '))?', 'g');

    //'Digest realm="tvheadend", qop="auth", nonce="b8/cJWAebqXycYezwKvNRZL/gi9NL1jUeCHjTiphh30=", opaque="wpjG3XYw4UxxNM9lSbjaJqfDTkvCAAJLd4k5Nt6HH4E="'
    var tokens = authHeader.match(tokenizer) || [];
    var challenge = { type: tokens[0] };
    for (var i = 1; i < tokens.length; i++) {
        var value = tokens[i];
        if (value.match('nonce')) challenge.nonce = unq(value.substring(value.indexOf('=') + 1));
        if (value.match('realm')) challenge.realm = unq(value.substring(value.indexOf('=') + 1));
        if (value.match('qop')) challenge.qop = unq(value.substring(value.indexOf('=') + 1));
        if (value.match('algorithm')) challenge.algorithm = unq(value.substring(value.indexOf('=') + 1));
    }
    return challenge;
}

function createAuthorizationHeader(options, user, password, challenge) {
    if (challenge.type === 'Digest') {
        return digestAuth(options, user, password, challenge);
    }
    return basicAuth(user, password);
}

/**
 * create basic authentication header
 *
 * @param {http.RequestOptions} options
 * @param {String} user
 * @param {String} password
 */
function basicAuth(user, password) {
    return 'Basic ' + new Buffer(user + ':' + password).toString('base64');
}

/**
 * create digest authentication header
 *
 * @param {http.RequestOptions} options
 * @param {String} user
 * @param {String} password
 * @param {Object} challenge parsed www-authenticate header
 */
function digestAuth(options, user, password, challenge) {
    var nonce = challenge.nonce,
        realm = challenge.realm,
        qop = challenge.qop,
        algorithm = challenge.algorithm,
        mappedAlgorithm;

    switch (algorithm) {
        case 'SHA-256': mappedAlgorithm = 'sha256'; break;
        case 'SHA-512': mappedAlgorithm = 'sha512'; break;
        case 'SHA-512-256': mappedAlgorithm = 'sha256'; break; // not yet supported 512-256
        default: {
            mappedAlgorithm = 'md5';
            algorithm = 'MD5';
        }
    }

    var cnonce = genNonce(20); // opaque random string value provided by the client
    var nc = '0000001';
    /*
     * HA1 = MD5(USER:REALM:PASS) --> john:your.realm:pass
     */
    var HA1 = hex_hash(mappedAlgorithm, user + ':' + realm + ':' + password);

    /*
     * HA2 = MD5(METHOD:URI)--> GET:your.realm
     */
    var HA2 = hex_hash(mappedAlgorithm, options.method + ':' + options.path);

    /*
     * response = digest = MD5(HA1 + ":" + NONCE + ":" + NC + ":" + CNONCE + ":" + QOP + ":" + HA2);
     */
    var res = hex_hash(mappedAlgorithm, HA1 + ':' + nonce + ':' + nc + ':' + cnonce + ':' + qop + ':' + HA2);

    /*
    *  Authorization header:
    *  Important: TVH 4.3 needs to have algorithm with quotes although according to spec this is without quotes
    *  Authorization:  Digest username="John", realm="your.realm", 
                    nonce="k7KYbGJOCIw4RAK0IcaUQsYszXwsJGOU", uri="/", 
                    algorithm="SHA-256",
                    cnonce="MDAwODM0", nc=00000001, qop="auth", 
                    response="77f88f3f6b4623eedf17af206098ebf8"
    */
    return 'Digest username="' + user + '", realm="' + realm + '", nonce="' + nonce + '", uri="' + options.path + '", algorithm="' + algorithm + '" cnonce="' + cnonce + '", nc="' + nc + '", qop=' + qop + ', response="' + res + '"';
}
