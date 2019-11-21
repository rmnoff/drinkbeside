import * as dotenv from 'dotenv';
dotenv.config();
import { userByID } from '../database';

var FCM = require('fcm-node');
var serverKey = 'AAAAKFeT-j8:APA91bHFf4L4U7kfI5b9eW283O4Tjs-ais06z8NF0gQuFNygiRDD8qBzzvsgxWLttPu2UvJotZcLSJg_RPm8X-JM8z96DZUYLSsgYv1XtBSoNoAWm887kB4kwjxHb50wUQABUJzv6Ub3';
var fcm = new FCM(serverKey);
import asyncRedis from 'async-redis';
const redis = asyncRedis.createClient();

export const sendFcmMessage = async (req, res) => {
    const title = req.body.title;
    const body = req.body.body;
    const userId = Number.parseInt(req.body.userId);
    const user = await userByID(userId);
    const token = user.fcmtoken;
    if (!token) {
        return res.json({
            error: "Пользователь не зарегистрировал токен для уведомлений.",
            data: null
        })
    }

    var message = { //this may vary according to the message type (single recipient, multicast, topic, et cetera)
        to: token, 
        
        notification: {
            title: title, 
            body: body 
        }
    };

    fcm.send(message, function(err, response){
        if (err) {
            return res.json({
                error: err,
                data: null
            })
        } else {
            return res.json({
                error: null,
                data: response
            })
        }
    });
};
