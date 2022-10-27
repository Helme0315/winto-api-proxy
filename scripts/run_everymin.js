var async = require('async');
var dateTime = require('node-datetime');

var collectionObj = require('./collection');
//var bet365 = require('./bet365');

exports.run = function () {

    var totalCount = 1; //2
    var crons = [];

    crons.push('collection 1');

    var collection = new collectionObj();

    var tasks = [
        function (callback) {
            collection.run(callback);
        }
    ];


    async.parallel(tasks, function (err, result) {
        if (err) {
            console.debug("Error Collection1: " + err);
        }
        else {
            for (var i = 0; i < totalCount; i++) {
                if (result[i] != 'success') {
                    console.debug('Error in ' + crons[i] + ' cron');
                }
            }
            var dt = dateTime.create();
            var formatted = dt.format('Y-m-d H:M:S');
            console.log('Done! -- ' + formatted + '\n');
        }
        return;
    });
}