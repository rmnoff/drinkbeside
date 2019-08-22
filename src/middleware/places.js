import axios from 'axios';
import asyncRedis from 'async-redis';
const redis = asyncRedis.createClient();

export const fetchPlaces = async (res, city = 'spb', places = [], page = 1, lang = 'ru') => {
  // checking cache
  let cachedPlaces = await redis.get(city);
  if(cachedPlaces) {
    if(!res) return JSON.parse(cachedPlaces);
    return res.json({
      error: null,
      data: JSON.parse(cachedPlaces)
    });
  }
  // in case there is no cache
  const url = `https://kudago.com/public-api/v1.4/places/?lang=${lang}&page=${page}&page_size=100&fields=${'title,address,location,timetable,phone,description,coords,subway'}&text_format=text&location=${city}&categories=bar,bar-s-zhivoj-muzykoj,cafe,clubs,fastfood,restaurants`;
  console.log(url);
  let updatedPlaces = [];
  let response;
  try {
    response = await axios.get(url);
    updatedPlaces = places.concat(response.data.results);
  } catch(e) {
    response = {
      data: {
        next: null
      }
    };
  }
  if(!response.data.next) {
    redis.set(city, JSON.stringify(updatedPlaces));
    setTimeout(() => {
      redis.del(city);
    }, process.env.CACHE_TIMEOUT);
    if(!res) return updatedPlaces;
    return res.json({
      error: null,
      data: updatedPlaces
    });
  }
  await fetchPlaces(res, city, updatedPlaces, ++page, lang);
};