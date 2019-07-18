// to keep consts away from file
require('dotenv').config();
// libraries
const fusejs = require('fuse.js')
const express = require('express');
const cors = require('cors');
const bodyparser = require('body-parser');
const asyncRedis = require("async-redis");
const axios = require('axios');
const fs = require('fs');
const multer = require('multer');
const jwt = require('jsonwebtoken');
// system consts
const app = express();
const redis = asyncRedis.createClient();
const upload = multer();
// custom functions
const {
  userByID,
  userByPhone,
  saveUser,
  updateUserInfo,
  updateRating,
  updateAvatar,
  partyByID,
  fetchParties,
  createParty,
  inviteToParty,
  suspendParty,
  modifyParty,
  joinParty,
  guestList,
  fetchGuests,
  kickGuest,
  leaveParty
} = require('./database/postgres');
const { fetchPlaces } = require('./middleware/places');
const { authorize } = require('./middleware/auth');
// express application configuration
app.use(cors());
app.use(bodyparser.json({limit: '50mb', extended: true}));
app.use(bodyparser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
// sign up & sign in endpoints
app.post('/send_code', async (req, res) => {
  const phone = req.body.phoneNumber;
  const random = Math.floor(100000 + Math.random() * 900000);
  await redis.set(phone.replace('+', ''), random);
  setTimeout(() => {
    redis.del(phone.replace('+', ''));
  }, process.env.SMS_TIMEOUT);
  const toSend = process.env.DEF_URL
    .replace('<phones>', phone)
    .replace('<message>', random);
  try {
    const response = await axios.get(toSend);
    res.json({
      error: null,
      data: 'Code sent'
    });
  } catch (e) {
    res.json({
      error: 'Ошибка отправки проверочного кода',
      data: null
    });
  }
});

app.post('/confirm_code', async (req, res) => {
  const phone = req.body.phoneNumber.replace('+', '');
  const code = req.body.code;
  const codeKept = await redis.get(phone);
  if (codeKept && codeKept === code) {
    let user = await userByPhone(phone);
    if (!user) {
      user = await saveUser(phone);
    };
    if (user) {
      await redis.del(phone);
      const token = jwt.sign({ user }, process.env.SECRET);
      await redis.set(user.id, token);
      return res.json({
        error: null,
        data: {
          ...user,
          token: token
        }
      });
    }
  }
  res.json({
    error: 'Вы прислали неверный код',
    data: null
  });
});
// end of sign up & sign in endpoints
// user related endpoints
app.get('/user/:id', async (req, res) => {
  const id = Number.parseInt(req.params.id);
  const user = await userByID(id);
  if (!user) return res.json({
    error: `Невозможно найти пользователя с ID ${id}`,
    data: null
  });
  res.json({
    error: null,
    data: {
      ...user,
      token: await redis.get(user.id)
    }
  });
});

app.get('/parties', authorize, async (req, res) => {
  const id = Number.parseInt(req.headers.id);
  const parties = await fetchParties(id);
  if(!parties) return res.json({
    data: null,
    error: 'Ошибка подбора событий, попробуйте позже'
  });
  res.json({
    data: parties,
    error: null
  });
});

// app.get('/friends/:id', authorize, async (req, res) => {
//   const id = req.params.id;
//   const friends = await fetchFriends(id);
//   if(!friends) return res.json({
//     data: null,
//     error: 'Ошибка подбора друзей, попробуйте позже'
//   });
//   res.json({
//     data: friends,
//     error: null
//   });
// });

app.post('/update_user_info', authorize, async (req, res) => {
  const data = req.body;
  const id = Number.parseInt(data.id);
  const user = await userByID(id);
  if (user) {
    const updateQueryArray = Object.keys(data.fields)
      .filter(key => key !== 'id' && key !== 'avatar')
      .map(key => `${key} = '${data.fields[key]}'`)
      .join(',');
    const updatedUser = await updateUserInfo(id, updateQueryArray);
    if (updatedUser) return res.json({
      error: null,
      data: updatedUser
    });
  }
  res.json({
    error: 'Ошибка обновления данных пользователя',
    data: null
  });
});

app.post('/update_avatar', authorize, upload.single('image'), async (req, res, next) => {
  const id = Number.parseInt(req.headers.id);
  const image = req.file.buffer;
  const path = `images/avatars/id_${id}.png`;
  try {
    fs.writeFileSync(`public/${path}`, image);
  } catch (e) {
    return res.json({
      error: 'Ошибка сохранения аватара, попробуйте заново',
      data: null
    });
  }
  const updatedUser = await updateAvatar(id, path);
  if (updatedUser) return res.json({
    error: null,
    data: updatedUser
  });
  res.json({
    error: 'Ошибка загрузки, попробуйте заново',
    data: null
  });
});

app.post('/rate', authorize, async (req, res) => {
  const userID = Number.parseInt(req.headers.id);
  const guestID = req.body.guest_id;
  const rating = Number.parseInt(req.body.rating);
  if(!guestID || !rating) return res.json({
    data: null,
    error: 'Переданы не все необходимые параметры'
  });
  const user = await updateRating(guestID, userID, rating);
  if(!user) return res.json({
    data: null,
    error: 'Невозможно поставить оценку пользователю'
  });
  res.json({
    data: `Рейтинг пользователя ${user.fname} ${user.lname} обновлен`,
    error: null
  });
});

app.post('/join_party', async (req, res) => {
  const partyID = req.body.partyID;
  const userID = Number.parseInt(req.headers.id);
  done = await joinParty(partyID, userID);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка присоединения'
  });
  res.json({
    data: done,
    error: null
  });
});

app.post('/leave_party', authorize, async (req, res) => {
  const partyID = req.body.partyID;
  const userID = Number.parseInt(req.headers.id);
  const done = await leaveParty(partyID, userID);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка исключения пользователя'
  });
  res.json({
    data: done,
    error: null
  });
});

app.post('/update_user_location', authorize, async (req, res) => {
  const userID = Number.parseInt(req.headers.id);
  const city = req.body.city;
  const done = await updateUserLocation(userID, city);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка изменения города пользователя'
  });
  res.json({
    data: done,
    error: null
  });
});

// end of user related endpoints
// places related endpoints

app.post('/places', authorize, async (req, res) => {
  await fetchPlaces(res, req.body.city);
});

app.post('/search', authorize, async (req, res) => {
  const query = req.body.query;
  const city = req.body.city;
  if (!query || !city) return res.json({
    data: null,
    error: 'Некорректный запрос'
  });
  var options = {
    keys: [{
      name: 'title',
      weight: 0.5
    }, {
      name: 'address',
      weight: 0.2
    }, {
      name: 'subway',
      weight: 0.3
    }]
  }
  const data = await redis.get(city);
  if (!data) return res.json({
    data: null,
    error: 'Ошибка на стороне сервера, попробуйте позже'
  });
  const fuse = new fusejs(JSON.parse(data), options);
  const result = await fuse.search(query);
  res.json({
    data: result,
    error: null
  });
});
// end of places related endpoints
// party/event related endpoints
app.get('/party/:id', authorize, async (req, res) => {
  const id = req.params.id;
  const party = await partyByID(id);
  if (!party) return res.json({
    data: null,
    error: 'Данного события не существует'
  });
  res.json({
    data: party,
    error: null
  });
});

app.post('/create_party', authorize, async (req, res) => {
  const hostID = req.body.hostID;
  const invitedIDs = req.body.invitedIDs || [];
  const name = req.body.name;
  const isFree = req.body.isFree;
  const minPrice = req.body.minPrice || 0;
  const maxPrice = req.body.maxPrice || 0;
  const address = req.body.address;
  const type = req.body.type || 0;
  const start = req.body.start;
  const end = req.body.end || 0;
  const minRating = req.body.minRating || 0.0;
  const limit = req.body.limit || 0;
  if (!hostID || !name || !isFree || !address || !start) return res.json({
    data: null,
    error: 'Указаны не все обязательные поля'
  });
  const party = await createParty({
    hostID, invitedIDs, name, isFree,
    minPrice, maxPrice, address, type,
    start, end, minRating, limit
  });
  if(!party) return res.json({
    data: null,
    error: 'Невозможно создать событие'
  })
  res.json({
    data: party,
    error: null
  });
});

app.post('/modify_party', authorize, async (req, res) => {
  const partyID = req.body.partyID;
  const userID = Number.parseInt(req.headers.id);
  const fields = req.body.fields;
  const updateQueryArray = Object.keys(fields)
    .filter(key => !(key in ['id', 'host_id', 'is_suspended']))
    .map(key => `${key} = '${fields[key]}'`)
    .join(',');
  const done = await modifyParty(partyID, userID, updateQueryArray);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка изменения параметров события'
  });
  res.json({
    data: done,
    error: null
  });
});

app.post('/suspend_party', authorize, async (req, res) => {
  const partyID = req.body.party_id;
  const userID = Number.parseInt(req.headers.id);
  const done = await suspendParty(partyID, userID);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка приостановки события.'
  });
  res.json({
    data: done,
    error: null
  });
});

app.post('/invite_to_party', authorize, async (req, res) => {
  const partyID = req.body.party_id;
  const userID = Number.parseInt(req.headers.id);
  const guestID = req.body.guest_id;
  const { done, party, user } = await inviteToParty(partyID, userID, guestID);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка на стороне сервера, либо вы не хост события'
  });
  res.json({
    data: `Вы пригласили ${user.name} на ${party.name}`,
    error: null
  });
});

app.get('/guest_list/:pid', authorize, async (req,res) => {
  const partyID = req.params.pid;
  const userID = Number.parseInt(req.headers.id);
  const list = await fetchGuests(partyID, userID);
  if (!list) return res.json({
    data: null,
    error: 'Ошибка получения списка участников'
  });
  res.json({
    data: list,
    error: null
  });
});

app.get('/rate_guests/:id', authorize, async (req, res) => {
  const userID = Number.parseInt(req.headers.id);
  const partyID = req.params.id;
  if(!userID || !partyID) return res.json({
    data: null,
    error: 'Переданы не все необходимые параметры'
  });
  const guests = await fetchGuests(userID, partyID);
  if(!guests) return res.json({
    data: null,
    error: 'Скорее всего Вы не являетесь хостом события, либо события не существует'
  });
  res.json({
    data: guests,
    error: null
  });
});

app.post('/kick_guest', authorize, async (req, res) => {
  const partyID = req.body.partyID;
  const userID = Number.parseInt(req.headers.id);
  const guestID = req.body.guestID;
  const done = await kickGuest(partyID, userID, guestID);
  if (!done) return res.json({
    data: null,
    error: 'Ошибка исключения пользователя'
  });
  res.json({
    data: done,
    error: null
  });
});
// end of party/event related endpoints
// running server
app.listen(process.env.PORT, () => {
  console.log(`UP & RUNNING ON ${process.env.PORT}`);
});
