var assert = require('better-assert');

// const { MerkleTree } = require("merkletreejs");
const keccak_256 = require('js-sha3').keccak256;

exports.isUUIDv4 = function (uuid) {
    return (typeof uuid === 'string') && uuid.match(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i);
};

exports.isInt = function (nVal) {
    return typeof nVal === "number" && isFinite(nVal) && nVal > -9007199254740992 && nVal < 9007199254740992 && Math.floor(nVal) === nVal;
};

exports.hasOwnProperty = function (obj, propName) {
    return Object.prototype.hasOwnProperty.call(obj, propName);
};

exports.getOwnProperty = function (obj, propName) {
    return Object.prototype.hasOwnProperty.call(obj, propName) ? obj[propName] : undefined;
};

exports.parseTimeString = function (str) {
    var reg = /^\s*([1-9]\d*)([dhms])\s*$/;
    var match = str.match(reg);

    if (!match)
        return null;

    var num = parseInt(match[1]);
    switch (match[2]) {
        case 'd': num *= 24;
        case 'h': num *= 60;
        case 'm': num *= 60;
        case 's': num *= 1000;
    }

    assert(num > 0);
    return num;
};

exports.printTimeString = function (ms) {
    var days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (days >= 3) return '' + days + 'd';

    var hours = Math.ceil(ms / (60 * 60 * 1000));
    if (hours >= 3) return '' + hours + 'h';

    var minutes = Math.ceil(ms / (60 * 1000));
    if (minutes >= 3) return '' + minutes + 'm';

    var seconds = Math.ceil(ms / 1000);
    return '' + seconds + 's';
};

exports.padNum = function (n, width) {
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join('0') + n;
}

exports.hexToBytes = function (hex) {
    for (var bytes = [], c = 0; c < hex.length; c += 2)
        bytes.push(parseInt(hex.substr(c, 2), 16));
    return bytes;
}
