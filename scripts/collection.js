var dateTime = require('node-datetime');
var database = require('./database')

var assert = require('better-assert');
var async = require('async');
var _ = require('lodash');
var lib = require('../server/lib');
var request = require('request');
var querystring = require('querystring');


function collection() {
    var self = this;
}

collection.prototype.run = function (callback) {
    var self = this;

    self.doAction(function (err) {
        if (err) {
            console.log('doAction error: ' + err.toString());
        }
    });

}

collection.prototype.doAction = function (callback) {
    console.log('call daily doAction');

    // var self = this;
    // var today = new Date().toISOString().split("T")[0];

    // self.get('/horses/racecards/date/' + today, function (err, resp) {
    //     if (err) {
    //         return callback(err);
    //     }

    //     if (resp.status == 404) {
    //         resp.data = { list: null };
    //     }
    //     else if (resp.status != 200)
    //         return callback("error code dailyRacecards:" + resp.errors);

    //     var json_data = [];

    //     if (resp.data.list != null) {
    //         var keys = Object.keys(resp.data.list);
    //         for (var i = 0; i < keys.length; i++) {
    //             var meeting = resp.data.list[keys[i]];
    //             var racecard_items = [];
    //             if (meeting.races != null) {
    //                 racecard_items = meeting.races.map(function (item) {
    //                     var info = {
    //                         course_uid: meeting.course_uid,
    //                         course_name: meeting.course_name,
    //                         course_key: meeting.course_key,
    //                         pre_going_desc: meeting.pre_going_desc,
    //                         pre_weather_desc: meeting.pre_weather_desc,
    //                         cards_order: meeting.cards_order,
    //                         course_image_path: meeting.course_image_path,
    //                         aw_surface_type: meeting.aw_surface_type,
    //                         country_code: meeting.country_code,
    //                         meeting_type: meeting.meeting_type,

    //                         race_instance_uid: item.race_instance_uid,
    //                         race_instance_title: item.race_instance_title,
    //                         race_datetime: item.race_datetime,
    //                         race_class: item.race_class,
    //                         rp_ages_allowed_desc: item.rp_ages_allowed_desc,
    //                         official_rating_band_desc: item.official_rating_band_desc,
    //                         distance_furlong_rounded: item.distance_furlong_rounded,
    //                         satelite_tv_txt: item.satelite_tv_txt,
    //                         no_of_runners: item.no_of_runners
    //                     };
    //                     return info;
    //                 });
    //                 json_data.push.apply(json_data, racecard_items);
    //             }
    //         }
    //     }


    //     database.putDailyRacecards(json_data, function (err) {
    //         return callback(null);
    //     });
    // });
}
module.exports = collection;
